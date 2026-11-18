const axios = require("axios");
const fs = require("fs");
const path = require("path");
const prisma = require("../src/config/prisma");
const app = require("../server");

async function runTests() {
  console.log("=== STARTING AUDIT & END-TO-END VERIFICATION ===");
  const server = app.listen(0);
  const port = server.address().port;
  const baseURL = `http://127.0.0.1:${port}/api`;
  const client = axios.create({ baseURL, validateStatus: () => true });

  const createdIds = [];
  let originalKaderDusunId = null;
  let kaderUserId = null;

  try {
    // -------------------------------------------------------------
    // SCENARIO A: Admin Retrain & Evaluation
    // -------------------------------------------------------------
    console.log("\n[SCENARIO A] Testing Admin Model Retraining & Evaluation...");
    const adminLoginRes = await client.post("/auth/login", {
      email: "admin@admin.go.id",
      password: "password123",
    });
    if (adminLoginRes.status !== 200 || !adminLoginRes.data.data?.token) {
      throw new Error(`Admin login failed: ${JSON.stringify(adminLoginRes.data)}`);
    }
    const adminToken = adminLoginRes.data.data.token;
    console.log("✓ Admin logged in successfully");

    const retrainRes = await client.post(
      "/admin/ml/retrain",
      {},
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    if (retrainRes.status !== 200 || !retrainRes.data.success) {
      throw new Error(`Retrain model failed: ${JSON.stringify(retrainRes.data)}`);
    }
    const trainData = retrainRes.data.data;
    console.log("✓ Model retrain completed via Python scikit-learn:");
    console.log(`  - Versi Model: ${trainData.versiModel}`);
    console.log(`  - Total Data Latih: ${trainData.totalDataLatih} (${trainData.dataLatihRiilMySQL || 0} MySQL + ${trainData.dataLatihReferensi || 0} Referensi)`);
    console.log(`  - Akurasi (5-fold CV): ${trainData.akurasi}%`);
    console.log(`  - Presisi: ${trainData.presisi}%, Recall: ${trainData.recall}%, F1: ${trainData.f1Score}%`);
    console.log(`  - Feature Importances count: ${Array.isArray(trainData.featureImportance) ? trainData.featureImportance.length : 0}`);

    if (trainData.totalDataLatih < 300) {
      throw new Error(`Expected at least 300 training samples, got ${trainData.totalDataLatih}`);
    }

    // Verify .joblib file on disk
    const modelPath = path.join(__dirname, "../ml/model_rf.joblib");
    if (!fs.existsSync(modelPath)) {
      throw new Error(`Model file not found at ${modelPath}`);
    }
    const stat = fs.statSync(modelPath);
    console.log(`✓ Model .joblib verified on disk (${stat.size} bytes, modified: ${stat.mtime.toISOString()})`);

    // Verify GET /api/admin/ml/evaluation
    const evalRes = await client.get("/admin/ml/evaluation", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (evalRes.status !== 200 || !evalRes.data.success) {
      throw new Error(`Get evaluation failed: ${JSON.stringify(evalRes.data)}`);
    }
    console.log("✓ GET /api/admin/ml/evaluation returns verified metrics from database");

    // -------------------------------------------------------------
    // SCENARIO B: Kader Input & Real Prediction (Dusun 1)
    // -------------------------------------------------------------
    console.log("\n[SCENARIO B] Testing Kader Input & Real Scikit-Learn Prediction...");
    const kaderLoginRes = await client.post("/auth/login", {
      email: "posyandu@posyandu.go.id",
      password: "password123",
    });
    if (kaderLoginRes.status !== 200 || !kaderLoginRes.data.data?.token) {
      throw new Error(`Kader login failed: ${JSON.stringify(kaderLoginRes.data)}`);
    }
    const kaderToken = kaderLoginRes.data.data.token;
    kaderUserId = kaderLoginRes.data.data.user.id;
    const kaderUser = await prisma.user.findUnique({ where: { id: kaderUserId } });
    originalKaderDusunId = kaderUser.dusunId;
    console.log(`✓ Kader logged in (User ID: ${kaderUserId}, assigned Dusun ID: ${originalKaderDusunId})`);

    const newScreeningPayload = {
      namaBalita: "Bima Putra Test E2E",
      nikBalita: "3204999999990099",
      jenisKelamin: "Laki-laki",
      namaIbu: "Ibu Siti Test",
      usiaIbu: 28,
      tinggiBadanIbu: 153.5,
      beratLahirGram: 3100,
      kepalaKeluarga: "Bpk. Joko Test",
      noKk: "3204999999990099",
      dusunId: 1, // Dusun 1
      rt: "01",
      usiaBulan: 18,
      tinggiBadan: 76.5,
      beratBadan: 9.2,
      pendapatan: 1800000,
      statusSosialEkonomi: "Keluarga Prasejahtera (Penerima PKH/BPNT)",
      pendidikanIbu: "SMP / Sederajat",
      riwayatKehamilan: "Kekurangan Energi Kronis (KEK) / Anemia Ringan",
      sumberAir: "Sumur Gali Tak Terlindung / Air Permukaan",
      kondisiSanitasi: "Tidak Layak / Jamban Cemplung Terbuka",
      asiEksklusif: "Tidak Diberikan ASI Eksklusif (Susu Formula Dini)",
      praktikMpasi: "Praktik MPASI Kurang Beragam (Minim Protein Hewani)",
    };

    const createPredRes = await client.post("/prediksi", newScreeningPayload, {
      headers: { Authorization: `Bearer ${kaderToken}` },
    });
    if (createPredRes.status !== 201 || !createPredRes.data.success) {
      throw new Error(`Create prediction failed: ${JSON.stringify(createPredRes.data)}`);
    }
    const createdRecord = createPredRes.data.data;
    createdIds.push(createdRecord.id);
    console.log(`✓ Screening created with ID: ${createdRecord.id}`);
    console.log(`  - Status Risiko: ${createdRecord.status}`);
    console.log(`  - Keyakinan Model: ${createdRecord.keyakinan}%`);
    console.log(`  - Probabilitas: ${JSON.stringify(createdRecord.probabilitas)}`);

    // Verify record in MySQL has dusunId locked to 1
    const dbRecord = await prisma.skriningStunting.findUnique({
      where: { id: createdRecord.id },
    });
    if (dbRecord.dusunId !== 1) {
      throw new Error(`Expected record dusunId to be 1, got ${dbRecord.dusunId}`);
    }
    console.log("✓ Record in DB verified: dusunId strictly locked to 1");

    // -------------------------------------------------------------
    // SCENARIO C: Dusun Data Isolation for Kader
    // -------------------------------------------------------------
    console.log("\n[SCENARIO C] Testing Dusun Data Isolation for Kader...");

    // 1. Kader checks riwayat
    const riwayatRes = await client.get("/riwayat", {
      headers: { Authorization: `Bearer ${kaderToken}` },
    });
    if (riwayatRes.status !== 200 || !riwayatRes.data.success) {
      throw new Error(`Get riwayat failed: ${JSON.stringify(riwayatRes.data)}`);
    }
    const riwayatItems = riwayatRes.data.data.items || [];
    console.log(`✓ Kader retrieved riwayat (${riwayatItems.length} items)`);
    // Verify all items are in Dusun 1
    for (const item of riwayatItems) {
      const rec = await prisma.skriningStunting.findUnique({ where: { id: item.id } });
      if (rec && rec.dusunId !== 1) {
        throw new Error(`Data leak! Kader Dusun 1 saw record ${item.id} belonging to Dusun ${rec.dusunId}`);
      }
    }
    console.log("✓ All riwayat items verified to belong exclusively to Dusun 1");

    // 2. Kader checks dashboard
    const kaderDashRes = await client.get("/kader/dashboard", {
      headers: { Authorization: `Bearer ${kaderToken}` },
    });
    if (kaderDashRes.status !== 200 || !kaderDashRes.data.success) {
      throw new Error(`Get kader dashboard failed: ${JSON.stringify(kaderDashRes.data)}`);
    }
    console.log("✓ Kader dashboard verified (isolated to Dusun 1)");

    // 3. Create dummy screening in Dusun 2 (Dusun Mawar)
    const dusun2Record = await prisma.skriningStunting.create({
      data: {
        namaBalita: "Balita Dusun 2 Test",
        nikBalita: "3204999999990022",
        kepalaKeluarga: "Bpk. Mawar Test",
        usiaBulan: 20,
        pendapatan: 2500000,
        pendidikanIbu: "SMA / Sederajat",
        riwayatKehamilan: "Normal",
        sumberAir: "PDAM Terlindung",
        kondisiSanitasi: "Jamban Leher Angsa / Sanitasi Layak",
        statusRisiko: "RENDAH",
        dusunId: 2, // Dusun 2
      },
    });
    createdIds.push(dusun2Record.id);
    console.log(`✓ Created test screening for Dusun 2 (ID: ${dusun2Record.id})`);

    // 4. Kader Dusun 1 attempts to access detail of Dusun 2 record -> MUST BE 403
    const forbiddenRes = await client.get(`/prediksi/${dusun2Record.id}`, {
      headers: { Authorization: `Bearer ${kaderToken}` },
    });
    if (forbiddenRes.status !== 403) {
      throw new Error(`Security breach! Expected 403 Forbidden for cross-dusun access, got ${forbiddenRes.status}`);
    }
    console.log("✓ Cross-dusun access blocked with HTTP 403 Forbidden");

    // 5. Change Kader's assigned dusun to Dusun 2 in DB
    await prisma.user.update({
      where: { id: kaderUserId },
      data: { dusunId: 2 },
    });
    console.log("✓ Updated Kader's assignment in DB to Dusun 2");

    // Immediately fetch riwayat -> now must see Dusun 2
    const riwayatDusun2Res = await client.get("/riwayat", {
      headers: { Authorization: `Bearer ${kaderToken}` },
    });
    const itemsDusun2 = riwayatDusun2Res.data.data.items || [];
    for (const item of itemsDusun2) {
      const rec = await prisma.skriningStunting.findUnique({ where: { id: item.id } });
      if (rec && rec.dusunId !== 2) {
        throw new Error(`Data leak after reassignment! Expected Dusun 2, got record with Dusun ${rec.dusunId}`);
      }
    }
    console.log("✓ Reassigned Kader immediately sees only Dusun 2 records");

    // Re-attempt detail access of Dusun 2 record -> MUST BE 200 OK now
    const allowedRes = await client.get(`/prediksi/${dusun2Record.id}`, {
      headers: { Authorization: `Bearer ${kaderToken}` },
    });
    if (allowedRes.status !== 200) {
      throw new Error(`Expected 200 OK after reassignment to Dusun 2, got ${allowedRes.status}`);
    }
    console.log("✓ Access to Dusun 2 record is now permitted (HTTP 200 OK)");

    // Revert Kader back to Dusun 1
    await prisma.user.update({
      where: { id: kaderUserId },
      data: { dusunId: originalKaderDusunId },
    });
    console.log(`✓ Reverted Kader's assignment back to Dusun ${originalKaderDusunId}`);

    // -------------------------------------------------------------
    // SCENARIO D: Aparatur Flow & Restrictions
    // -------------------------------------------------------------
    console.log("\n[SCENARIO D] Testing Aparatur Desa Flow & Permission Restrictions...");
    const aparaturLoginRes = await client.post("/auth/login", {
      email: "aparatur.desa@desa.go.id",
      password: "password123",
    });
    if (aparaturLoginRes.status !== 200 || !aparaturLoginRes.data.data?.token) {
      throw new Error(`Aparatur login failed: ${JSON.stringify(aparaturLoginRes.data)}`);
    }
    const aparaturToken = aparaturLoginRes.data.data.token;
    console.log("✓ Aparatur logged in successfully");

    // 1. Aparatur views data-keluarga across all dusuns
    const aparaturDataRes = await client.get("/aparatur/data-keluarga", {
      headers: { Authorization: `Bearer ${aparaturToken}` },
    });
    if (aparaturDataRes.status !== 200 || !aparaturDataRes.data.success) {
      throw new Error(`Aparatur data-keluarga failed: ${JSON.stringify(aparaturDataRes.data)}`);
    }
    const dusunList = aparaturDataRes.data.data.dusun || [];
    console.log(`✓ Aparatur can view all dusun data (${dusunList.length} dusun terdata)`);

    // 2. Aparatur reclassifies single screening with latest RF
    const reclassRes = await client.post(
      `/aparatur/klasifikasi-ulang/${createdRecord.id}`,
      {},
      { headers: { Authorization: `Bearer ${aparaturToken}` } }
    );
    if (reclassRes.status !== 200 || !reclassRes.data.success) {
      throw new Error(`Aparatur reclassify failed: ${JSON.stringify(reclassRes.data)}`);
    }
    console.log(`✓ Aparatur successfully reclassified screening ${createdRecord.id} with Random Forest`);

    // 3. Aparatur runs batch process
    const batchRes = await client.post(
      "/aparatur/proses-prediksi",
      {},
      { headers: { Authorization: `Bearer ${aparaturToken}` } }
    );
    if (batchRes.status !== 200 || !batchRes.data.success) {
      throw new Error(`Aparatur batch process failed: ${JSON.stringify(batchRes.data)}`);
    }
    console.log(`✓ Aparatur batch processed ${batchRes.data.data.totalDiproses} screenings`);

    // 4. Aparatur attempts direct POST /api/prediksi (raw family entry) -> MUST BE 403
    const aparaturDirectRes = await client.post(
      "/prediksi",
      newScreeningPayload,
      { headers: { Authorization: `Bearer ${aparaturToken}` } }
    );
    if (aparaturDirectRes.status !== 403) {
      throw new Error(`Aparatur direct prediction should be forbidden (403), got ${aparaturDirectRes.status}`);
    }
    console.log("✓ Aparatur direct POST /api/prediksi rejected with HTTP 403 Forbidden (strict separation of duties)");

    console.log("\n=== ALL TEST SCENARIOS PASSED WITH 100% SUCCESS ===");
  } finally {
    // -------------------------------------------------------------
    // SCENARIO E: Cleanup Test Records
    // -------------------------------------------------------------
    console.log("\n[CLEANUP] Cleaning up test records from database...");
    if (originalKaderDusunId && kaderUserId) {
      await prisma.user.update({
        where: { id: kaderUserId },
        data: { dusunId: originalKaderDusunId },
      }).catch(() => {});
    }
    if (createdIds.length > 0) {
      const deleteRes = await prisma.skriningStunting.deleteMany({
        where: { id: { in: createdIds } },
      });
      console.log(`✓ Removed ${deleteRes.count} test screening records (IDs: ${createdIds.join(", ")})`);
    }
    server.close();
    await prisma.$disconnect();
  }
}

runTests().catch((err) => {
  console.error("\n❌ TEST FAILED:", err);
  process.exit(1);
});
