const axios = require("axios");
const prisma = require("../config/prisma");

const AMBANG_KRITIS = 70;

const BULAN_PENDEK = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

function formatTanggalJamWib(dateInput) {
  const date = dateInput ? new Date(dateInput) : new Date();
  const parts = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const getPart = (type) => parts.find((p) => p.type === type)?.value || "";
  const day = getPart("day");
  const monthIdx = Math.max(0, (Number(getPart("month")) || 1) - 1);
  const year = getPart("year");
  const hour = getPart("hour").padStart(2, "0");
  const minute = getPart("minute").padStart(2, "0");

  return {
    tanggal: `${day} ${BULAN_PENDEK[monthIdx]} ${year}`,
    jam: `${hour}:${minute} WIB`,
  };
}

function toTitleCaseRisk(statusRisiko) {
  if (statusRisiko === "TINGGI") return "Tinggi";
  if (statusRisiko === "SEDANG") return "Sedang";
  return "Rendah";
}

function buildIntervensiList(statusRisiko) {
  if (statusRisiko === "TINGGI") {
    return [
      {
        id: 1,
        judul: "Kunjungan Rutin Kader & Bidan",
        tag: "Setiap 2 Pekan",
        deskripsi:
          "Bidan Desa Sukamaju dan Kader Posyandu melakukan pengecekan berat dan tinggi badan serta pemantauan kurva tumbuh kembang secara berkala.",
        footer: "Mulai Pelaksanaan: Pekan Pertama Bulan Ini",
      },
      {
        id: 2,
        judul: "Pemberian PMT Gizi Tambahan",
        tag: "Protein Hewani",
        deskripsi:
          "Distribusi paket makanan tambahan pemulihan berbasis telur, susu balita, dan biskuit bergizi tinggi dari alokasi dana penanganan stunting desa.",
        footer: "Fokus Paket: Telur & Susu Balita (90 Hari)",
      },
    ];
  }

  if (statusRisiko === "SEDANG") {
    return [
      {
        id: 1,
        judul: "Konseling Gizi & Pemantauan Posyandu",
        tag: "Setiap Bulan",
        deskripsi:
          "Kader Posyandu memberikan konseling gizi seimbang dan memantau pertumbuhan balita pada penimbangan bulanan.",
        footer: "Mulai Pelaksanaan: Bulan Ini",
      },
      {
        id: 2,
        judul: "Pemberian Vitamin A & Pantau TB",
        tag: "Suplementasi",
        deskripsi:
          "Pemberian kapsul vitamin A dan pemantauan tinggi badan berkala untuk mencegah penurunan status gizi.",
        footer: "Fokus: Vitamin A & Pemantauan TB",
      },
    ];
  }

  return [
    {
      id: 1,
      judul: "Pemantauan Rutin Posyandu",
      tag: "Setiap Bulan",
      deskripsi:
        "Lanjutkan pemantauan pertumbuhan rutin di Posyandu serta pertahankan pola asuh dan gizi seimbang.",
      footer: "Mulai Pelaksanaan: Pemantauan Bulanan",
    },
  ];
}

function estimateAnthropometry({ usiaBulan, tinggiBadan, beratBadan, statusRisiko }) {
  const refTb = 50 + usiaBulan * 1.1;
  const refBb = 3.3 + usiaBulan * 0.28;

  const tbVal =
    tinggiBadan !== null && tinggiBadan !== undefined && !Number.isNaN(Number(tinggiBadan))
      ? Number(tinggiBadan)
      : null;
  const bbVal =
    beratBadan !== null && beratBadan !== undefined && !Number.isNaN(Number(beratBadan))
      ? Number(beratBadan)
      : null;

  let zScoreTb = statusRisiko === "TINGGI" ? -2.4 : statusRisiko === "SEDANG" ? -1.4 : 0.1;
  if (tbVal !== null) {
    zScoreTb = Number(((tbVal - refTb) / 3.5).toFixed(2));
  }

  let zScoreBb = statusRisiko === "TINGGI" ? -1.9 : statusRisiko === "SEDANG" ? -1.2 : 0.2;
  if (bbVal !== null) {
    zScoreBb = Number(((bbVal - refBb) / 1.2).toFixed(2));
  }

  const statusTb =
    zScoreTb <= -2.0 ? "Di Bawah Standar (Pendek)" : "Normal";
  const statusBb = zScoreBb <= -1.5 ? "Kurang" : "Normal";

  return {
    tinggiBadan: tbVal,
    beratBadan: bbVal,
    zScoreTb,
    zScoreBb,
    statusTb,
    statusBb,
  };
}

function calculateDeterministicPrediction(input, dusun) {
  const {
    usiaBulan,
    tinggiBadan,
    beratBadan,
    pendapatan,
    pendidikanIbu,
    riwayatKehamilan,
    sumberAir,
    kondisiSanitasi,
  } = input;

  const rawFactors = [];
  let riskScore = 0;

  // 1. Sanitasi (0 - 30 poin)
  const sanitasiLower = String(kondisiSanitasi).toLowerCase();
  if (sanitasiLower.includes("tidak ada")) {
    riskScore += 30;
    rawFactors.push({ label: "Tidak Ada Jamban Keluarga", weight: 30, short: "Sanitasi Buruk" });
  } else if (sanitasiLower.includes("tidak layak")) {
    riskScore += 26;
    rawFactors.push({ label: "Sanitasi Tidak Layak", weight: 26, short: "Sanitasi Tidak Layak" });
  } else if (sanitasiLower.includes("komunal") || sanitasiLower.includes("mck")) {
    riskScore += 15;
    rawFactors.push({ label: "Sanitasi Komunal (MCK Bersama)", weight: 15, short: "Sanitasi Komunal" });
  } else {
    rawFactors.push({ label: "Kondisi Sanitasi", weight: 6, short: "Sanitasi Layak" });
  }

  // 2. Sumber Air (0 - 25 poin)
  const airLower = String(sumberAir).toLowerCase();
  if (airLower.includes("sungai") || airLower.includes("permukaan")) {
    riskScore += 25;
    rawFactors.push({
      label: "Sumber Air Permukaan / Sungai",
      weight: 25,
      short: "Sumber Air Minum",
    });
  } else if (airLower.includes("tidak terlindung")) {
    riskScore += 22;
    rawFactors.push({
      label: "Sumber Air Tak Terlindungi (Sumur Terbuka)",
      weight: 22,
      short: "Sumber Air Minum",
    });
  } else if (airLower.includes("sumur gali")) {
    riskScore += 10;
    rawFactors.push({
      label: "Akses Air Sumur Gali",
      weight: 10,
      short: "Akses Air Bersih",
    });
  } else {
    rawFactors.push({
      label: "Akses Air Bersih",
      weight: 5,
      short: "Akses Air Bersih",
    });
  }

  // 3. Riwayat KEK Ibu (0 - 20 poin)
  const kekLower = String(riwayatKehamilan).toLowerCase();
  if (kekLower.includes("pernah kek") && !kekLower.includes("tidak pernah")) {
    riskScore += 20;
    rawFactors.push({
      label: "Riwayat KEK Ibu (Kurang Energi Kronis)",
      weight: 20,
      short: "Riwayat KEK Ibu",
    });
  } else {
    rawFactors.push({
      label: "Riwayat Kesehatan Kehamilan Ibu",
      weight: 5,
      short: "Gizi Ibu",
    });
  }

  // 4. Pendapatan Keluarga (0 - 15 poin)
  if (pendapatan < 1500000) {
    riskScore += 15;
    rawFactors.push({
      label: "Pendapatan Rendah (Di Bawah UMR Daerah)",
      weight: 18,
      short: "Pendapatan Keluarga",
    });
  } else if (pendapatan < 2500000) {
    riskScore += 9;
    rawFactors.push({
      label: "Pendapatan Keluarga Terbatas",
      weight: 12,
      short: "Pendapatan Keluarga",
    });
  } else {
    rawFactors.push({
      label: "Ketahanan Ekonomi Keluarga",
      weight: 5,
      short: "Ekonomi Stabil",
    });
  }

  // 5. Pendidikan Ibu (0 - 12 poin)
  const eduLower = String(pendidikanIbu).toLowerCase();
  if (eduLower.includes("tidak sekolah") || eduLower.includes("sd")) {
    riskScore += 12;
    rawFactors.push({
      label: "Pendidikan Ibu (Tamat SD / Tidak Selesai)",
      weight: 14,
      short: "Pendidikan Ibu Rendah",
    });
  } else if (eduLower.includes("smp")) {
    riskScore += 7;
    rawFactors.push({
      label: "Pendidikan Pengasuh (SMP)",
      weight: 10,
      short: "Pendidikan Ibu",
    });
  } else {
    rawFactors.push({
      label: "Pola Asuh & Literasi Gizi Ibu",
      weight: 5,
      short: "Pola Asuh & Gizi Seimbang",
    });
  }

  // Penyesuaian antropometri jika diisi
  if (tinggiBadan !== null && tinggiBadan !== undefined && !Number.isNaN(Number(tinggiBadan))) {
    const expectedTb = 50 + usiaBulan * 1.1;
    if (Number(tinggiBadan) < expectedTb - 6) {
      riskScore += 15;
    }
  }

  let statusRisiko = "RENDAH";
  let pTinggi = 8;
  let pSedang = 17;
  let pRendah = 75;
  let keyakinanModel = 88;
  let prioritas = "Aman";

  if (riskScore >= 48) {
    statusRisiko = "TINGGI";
    pTinggi = Math.min(82, Math.max(60, Math.round(riskScore)));
    pSedang = Math.min(30, Math.max(12, Math.round((100 - pTinggi) * 0.72)));
    pRendah = Math.max(3, 100 - pTinggi - pSedang);
    keyakinanModel = Math.min(96, 82 + Math.round((riskScore - 48) / 3));
    prioritas = "Prioritas 1";
  } else if (riskScore >= 24) {
    statusRisiko = "SEDANG";
    pSedang = Math.min(68, Math.max(50, 45 + Math.round(riskScore / 2)));
    pTinggi = Math.min(30, Math.max(14, Math.round(riskScore * 0.55)));
    pRendah = Math.max(8, 100 - pTinggi - pSedang);
    keyakinanModel = Math.min(86, 72 + Math.round((riskScore - 24) / 2));
    prioritas = "Prioritas 2";
  } else {
    statusRisiko = "RENDAH";
    pRendah = Math.min(88, Math.max(70, 86 - riskScore));
    pSedang = Math.max(8, Math.round((100 - pRendah) * 0.7));
    pTinggi = Math.max(4, 100 - pRendah - pSedang);
    keyakinanModel = 90;
    prioritas = "Aman";
  }

  // Normalisasi bobot faktor agar berjumlah 100
  const sortedFactors = [...rawFactors].sort((a, b) => b.weight - a.weight);
  const totalWeight = sortedFactors.reduce((sum, f) => sum + f.weight, 0) || 1;
  let runningSum = 0;
  const faktorDetail = sortedFactors.map((f, idx) => {
    if (idx === sortedFactors.length - 1) {
      return { label: f.label, value: Math.max(1, 100 - runningSum) };
    }
    const val = Math.max(1, Math.round((f.weight / totalWeight) * 100));
    runningSum += val;
    return { label: f.label, value: val };
  });

  const faktorDominan =
    statusRisiko === "RENDAH"
      ? "Pola Asuh & Gizi Seimbang"
      : `${sortedFactors[0].short} & ${sortedFactors[1].short}`;

  const namaPosyandu = dusun?.posyandu || "Posyandu Desa Sukamaju";
  const namaDusunSingkat = dusun?.namaSingkat || "Melati";

  let teksRekomendasi =
    "Pertahankan pola asuh dan gizi seimbang; lanjutkan pemantauan pertumbuhan bulanan di Posyandu.";
  let batasRekomendasi = "30 Hari Kerja";
  let penerimaRekomendasi = namaPosyandu;
  let rencanaIntervensi = "Pemantauan rutin Posyandu bulanan";

  if (statusRisiko === "TINGGI") {
    teksRekomendasi =
      "Segera jadwalkan rujukan perbaikan sanitasi/lingkungan ke Sanitarian Puskesmas dan fasilitasi bantuan PMT pemulihan berbahan pangan hewani serta pemantauan intensif oleh Bidan Desa.";
    batasRekomendasi = "3 Hari Kerja";
    penerimaRekomendasi = `Puskesmas ${namaDusunSingkat}`;
    rencanaIntervensi = "Rujukan Puskesmas + PMT pemulihan 90 hari";
  } else if (statusRisiko === "SEDANG") {
    teksRekomendasi =
      "Lanjutkan konseling gizi terarah, pemantauan tinggi dan berat badan berkala, serta edukasi sanitasi dan air bersih bersama kader Posyandu.";
    batasRekomendasi = "7 Hari Kerja";
    penerimaRekomendasi = namaPosyandu;
    rencanaIntervensi = "Konseling gizi & pantau Posyandu";
  }

  const probabilitas = [
    {
      key: "tinggi",
      label: "Risiko Tinggi",
      value: pTinggi,
      desc: "Probabilitas mayoritas klasifikasi",
    },
    {
      key: "sedang",
      label: "Risiko Sedang",
      value: pSedang,
      desc: "Peluang faktor perantara",
    },
    {
      key: "rendah",
      label: "Risiko Rendah",
      value: pRendah,
      desc: "Ambang normal sangat kecil",
    },
  ];

  const rekomendasiDetail = {
    teks: teksRekomendasi,
    batas: batasRekomendasi,
    penerima: penerimaRekomendasi,
    intervensi: buildIntervensiList(statusRisiko),
  };

  const anthropometry = estimateAnthropometry({
    usiaBulan,
    tinggiBadan,
    beratBadan,
    statusRisiko,
  });

  return {
    ...anthropometry,
    statusRisiko,
    keyakinanModel,
    ambangKritis: AMBANG_KRITIS,
    prioritas,
    faktorDominan,
    probabilitas,
    faktorDetail,
    rekomendasiDetail,
    rencanaIntervensi,
  };
}

async function callMlOrFallback(input, dusun) {
  const mlUrl = process.env.ML_API_URL || "http://localhost:8000/predict";
  const fallback = calculateDeterministicPrediction(input, dusun);

  try {
    const response = await axios.post(
      mlUrl,
      {
        usiaBulan: input.usiaBulan,
        tinggiBadan: input.tinggiBadan,
        beratBadan: input.beratBadan,
        pendapatan: input.pendapatan,
        pendidikanIbu: input.pendidikanIbu,
        riwayatKehamilan: input.riwayatKehamilan,
        sumberAir: input.sumberAir,
        kondisiSanitasi: input.kondisiSanitasi,
      },
      { timeout: 2500 }
    );

    const mlData = response?.data?.data || response?.data;
    if (!mlData || typeof mlData !== "object") {
      return { ...fallback, mlSource: "FALLBACK_DETERMINISTIC" };
    }

    const rawStatus = String(
      mlData.statusRisiko || mlData.status || fallback.statusRisiko
    ).toUpperCase();
    const statusRisiko = ["TINGGI", "SEDANG", "RENDAH"].includes(rawStatus)
      ? rawStatus
      : fallback.statusRisiko;

    return {
      ...fallback,
      statusRisiko,
      keyakinanModel:
        Number(mlData.keyakinanModel ?? mlData.keyakinan) ||
        fallback.keyakinanModel,
      probabilitas: Array.isArray(mlData.probabilitas)
        ? mlData.probabilitas
        : fallback.probabilitas,
      faktorDetail: Array.isArray(mlData.faktorDetail || mlData.faktor)
        ? mlData.faktorDetail || mlData.faktor
        : fallback.faktorDetail,
      faktorDominan: mlData.faktorDominan || fallback.faktorDominan,
      rekomendasiDetail:
        mlData.rekomendasiDetail ||
        mlData.rekomendasi ||
        fallback.rekomendasiDetail,
      rencanaIntervensi:
        mlData.rencanaIntervensi || fallback.rencanaIntervensi,
      mlSource: "PYTHON_RANDOM_FOREST",
    };
  } catch (err) {
    return { ...fallback, mlSource: "FALLBACK_DETERMINISTIC" };
  }
}

function formatHasilKlasifikasiResponse(record) {
  const { tanggal, jam } = formatTanggalJamWib(record.createdAt);
  const statusLower = String(record.statusRisiko || "RENDAH").toLowerCase();
  const kepala = record.kepalaKeluarga || "Keluarga Peserta";
  const balita = record.namaBalita || "Balita";
  const rw = record.dusun?.rw || "RW 01";
  const kodeKeluarga =
    record.kodeKeluarga || `KK-SKM-${String(record.id).padStart(4, "0")}`;

  const defaultProbabilitas =
    record.statusRisiko === "TINGGI"
      ? [
          {
            key: "tinggi",
            label: "Risiko Tinggi",
            value: 68,
            desc: "Probabilitas mayoritas klasifikasi",
          },
          {
            key: "sedang",
            label: "Risiko Sedang",
            value: 24,
            desc: "Peluang faktor perantara",
          },
          {
            key: "rendah",
            label: "Risiko Rendah",
            value: 8,
            desc: "Ambang normal sangat kecil",
          },
        ]
      : record.statusRisiko === "SEDANG"
      ? [
          {
            key: "tinggi",
            label: "Risiko Tinggi",
            value: 20,
            desc: "Probabilitas mayoritas klasifikasi",
          },
          {
            key: "sedang",
            label: "Risiko Sedang",
            value: 62,
            desc: "Peluang faktor perantara",
          },
          {
            key: "rendah",
            label: "Risiko Rendah",
            value: 18,
            desc: "Ambang normal sangat kecil",
          },
        ]
      : [
          {
            key: "tinggi",
            label: "Risiko Tinggi",
            value: 6,
            desc: "Probabilitas mayoritas klasifikasi",
          },
          {
            key: "sedang",
            label: "Risiko Sedang",
            value: 14,
            desc: "Peluang faktor perantara",
          },
          {
            key: "rendah",
            label: "Risiko Rendah",
            value: 80,
            desc: "Ambang normal sangat kecil",
          },
        ];

  const rekDetail =
    record.rekomendasiDetail && typeof record.rekomendasiDetail === "object"
      ? record.rekomendasiDetail
      : {};

  return {
    id: record.id,
    kodeKeluarga,
    keluarga: `${kepala} & Balita: ${balita} (${record.usiaBulan} bln) • ${rw}`,
    tanggal,
    jam,
    status: statusLower,
    statusRisiko: record.statusRisiko,
    keyakinan: record.keyakinanModel ?? 85,
    ambangKritis: record.ambangKritis ?? AMBANG_KRITIS,
    prioritas: record.prioritas || "Prioritas 1",
    probabilitas: Array.isArray(record.probabilitas)
      ? record.probabilitas
      : defaultProbabilitas,
    faktor: Array.isArray(record.faktorDetail)
      ? record.faktorDetail
      : [{ label: record.faktorDominan || "Sanitasi & Air Bersih", value: 100 }],
    rekomendasi: {
      teks:
        rekDetail.teks ||
        record.rencanaIntervensi ||
        "Lakukan pemantauan berkala bersama Bidan Desa dan Kader Posyandu.",
      batas:
        rekDetail.batas ||
        (record.statusRisiko === "TINGGI"
          ? "3 Hari Kerja"
          : record.statusRisiko === "SEDANG"
          ? "7 Hari Kerja"
          : "30 Hari Kerja"),
      penerima:
        rekDetail.penerima ||
        record.dusun?.posyandu ||
        "Puskesmas / Posyandu Desa",
      intervensi: Array.isArray(rekDetail.intervensi)
        ? rekDetail.intervensi
        : buildIntervensiList(record.statusRisiko),
    },
  };
}

async function resolveTargetDusun({ dusunId, wilayah, userId }) {
  if (dusunId && !Number.isNaN(Number(dusunId))) {
    const byId = await prisma.dusun.findUnique({
      where: { id: Number(dusunId) },
    });
    if (byId) return byId;
  }

  if (wilayah) {
    const text = String(wilayah).trim();
    const rwMatch = text.match(/RW\s*0?\d+/i);
    const rwNormalized = rwMatch
      ? `RW ${rwMatch[0].replace(/rw\s*/i, "").padStart(2, "0")}`
      : null;

    const allDusun = await prisma.dusun.findMany({ orderBy: { id: "asc" } });
    const found = allDusun.find((d) => {
      if (rwNormalized && d.rw.toUpperCase() === rwNormalized.toUpperCase()) {
        return true;
      }
      if (text.toLowerCase().includes(d.nama.toLowerCase())) {
        return true;
      }
      if (
        d.namaSingkat &&
        text.toLowerCase().includes(d.namaSingkat.toLowerCase())
      ) {
        return true;
      }
      return false;
    });
    if (found) return found;
  }

  if (userId) {
    const userWithDusun = await prisma.user.findUnique({
      where: { id: Number(userId) },
      include: { dusun: true },
    });
    if (userWithDusun?.dusun) return userWithDusun.dusun;
  }

  return prisma.dusun.findFirst({ orderBy: { id: "asc" } });
}

async function generateKodeKeluarga() {
  const count = await prisma.skriningStunting.count();
  const nextNumber = count + 101;
  return `KK-SKM-${String(nextNumber).padStart(4, "0")}`;
}

async function createPrediksi(req, res, next) {
  try {
    const body = req.body || {};

    const rawUsia = body.usia !== undefined ? body.usia : body.usiaBulan;
    const rawPendapatan = body.pendapatan;
    const pendidikanIbu = String(
      body.pendidikan || body.pendidikanIbu || ""
    ).trim();
    const riwayatKehamilan = String(
      body.kek || body.riwayatKehamilan || ""
    ).trim();
    const sumberAir = String(body.air || body.sumberAir || "").trim();
    const kondisiSanitasi = String(
      body.sanitasi || body.kondisiSanitasi || ""
    ).trim();

    const errors = {};
    const usiaBulan = Number(rawUsia);
    if (
      rawUsia === undefined ||
      rawUsia === "" ||
      Number.isNaN(usiaBulan) ||
      usiaBulan < 0 ||
      usiaBulan > 59
    ) {
      errors.usia = "Usia balita harus antara 0 sampai 59 bulan.";
    }

    const cleanedPendapatan = String(rawPendapatan ?? "").replace(/[^\d.-]/g, "");
    const pendapatan = Number(cleanedPendapatan);
    if (
      rawPendapatan === undefined ||
      rawPendapatan === "" ||
      Number.isNaN(pendapatan) ||
      pendapatan < 0
    ) {
      errors.pendapatan = "Pendapatan keluarga wajib berupa angka valid.";
    }

    if (!pendidikanIbu) {
      errors.pendidikan = "Pendidikan terakhir ibu wajib dipilih.";
    }
    if (!riwayatKehamilan) {
      errors.kek = "Riwayat kehamilan ibu (KEK) wajib dipilih.";
    }
    if (!sumberAir) {
      errors.air = "Sumber air bersih wajib dipilih.";
    }
    if (!kondisiSanitasi) {
      errors.sanitasi = "Kondisi sanitasi keluarga wajib dipilih.";
    }

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        success: false,
        message: "Data tidak valid",
        errors,
      });
    }

    const dusun = await resolveTargetDusun({
      dusunId: body.dusunId,
      wilayah: body.wilayah,
      userId: req.user?.id,
    });

    if (!dusun) {
      return res.status(400).json({
        success: false,
        message: "Data master Dusun belum tersedia di database.",
      });
    }

    const kodeKeluarga =
      body.kodeKeluarga && String(body.kodeKeluarga).trim()
        ? String(body.kodeKeluarga).trim()
        : await generateKodeKeluarga();

    const kepalaKeluarga =
      body.kepalaKeluarga && String(body.kepalaKeluarga).trim()
        ? String(body.kepalaKeluarga).trim()
        : `Keluarga ${kodeKeluarga}`;

    const namaBalita =
      body.namaBalita && String(body.namaBalita).trim()
        ? String(body.namaBalita).trim()
        : `Balita ${kodeKeluarga}`;

    const nikBalita =
      body.nikBalita && String(body.nikBalita).trim()
        ? String(body.nikBalita).trim()
        : null;

    const jenisKelamin =
      body.jenisKelamin && String(body.jenisKelamin).trim()
        ? String(body.jenisKelamin).trim()
        : "Laki-laki";

    const rt =
      body.rt && String(body.rt).trim() ? String(body.rt).trim() : "RT 01";

    const mlResult = await callMlOrFallback(
      {
        usiaBulan: Math.round(usiaBulan),
        tinggiBadan: body.tinggiBadan,
        beratBadan: body.beratBadan,
        pendapatan: Math.round(pendapatan),
        pendidikanIbu,
        riwayatKehamilan,
        sumberAir,
        kondisiSanitasi,
      },
      dusun
    );

    const created = await prisma.skriningStunting.create({
      data: {
        kodeKeluarga,
        kepalaKeluarga,
        namaBalita,
        nikBalita,
        jenisKelamin,
        rt,
        usiaBulan: Math.round(usiaBulan),
        tinggiBadan: mlResult.tinggiBadan,
        beratBadan: mlResult.beratBadan,
        zScoreTb: mlResult.zScoreTb,
        zScoreBb: mlResult.zScoreBb,
        statusTb: mlResult.statusTb,
        statusBb: mlResult.statusBb,
        pendapatan: Math.round(pendapatan),
        pendidikanIbu,
        riwayatKehamilan,
        sumberAir,
        kondisiSanitasi,
        statusRisiko: mlResult.statusRisiko,
        keyakinanModel: mlResult.keyakinanModel,
        ambangKritis: mlResult.ambangKritis,
        prioritas: mlResult.prioritas,
        faktorDominan: mlResult.faktorDominan,
        probabilitas: mlResult.probabilitas,
        faktorDetail: mlResult.faktorDetail,
        rekomendasiDetail: mlResult.rekomendasiDetail,
        rencanaIntervensi: mlResult.rencanaIntervensi,
        dusunId: dusun.id,
        kaderId: req.user?.id || null,
      },
      include: {
        dusun: true,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Prediksi risiko berhasil dibuat",
      data: formatHasilKlasifikasiResponse(created),
    });
  } catch (err) {
    return next(err);
  }
}

async function getPrediksiById(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "ID prediksi tidak valid",
      });
    }

    const record = await prisma.skriningStunting.findUnique({
      where: { id },
      include: { dusun: true },
    });

    if (!record) {
      return res.status(404).json({
        success: false,
        message: "Data hasil prediksi tidak ditemukan",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Hasil prediksi berhasil diambil",
      data: formatHasilKlasifikasiResponse(record),
    });
  } catch (err) {
    return next(err);
  }
}

async function getRiwayat(req, res, next) {
  try {
    const {
      search = "",
      rw = "",
      risiko = "",
      page = "1",
      limit = "6",
    } = req.query;

    const currentPage = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.max(1, parseInt(limit, 10) || 6);

    const where = {};

    const trimmedSearch = String(search).trim();
    if (trimmedSearch) {
      where.OR = [
        { kepalaKeluarga: { contains: trimmedSearch } },
        { namaBalita: { contains: trimmedSearch } },
        { kodeKeluarga: { contains: trimmedSearch } },
      ];
    }

    const trimmedRw = String(rw).trim();
    if (trimmedRw && !trimmedRw.toLowerCase().includes("semua")) {
      where.dusun = { rw: trimmedRw };
    }

    const trimmedRisiko = String(risiko).trim().toUpperCase();
    if (
      trimmedRisiko &&
      !trimmedRisiko.includes("SEMUA") &&
      ["TINGGI", "SEDANG", "RENDAH"].includes(trimmedRisiko)
    ) {
      where.statusRisiko = trimmedRisiko;
    }

    const [total, records] = await Promise.all([
      prisma.skriningStunting.count({ where }),
      prisma.skriningStunting.findMany({
        where,
        include: { dusun: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (currentPage - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    const items = records.map((row) => {
      const { tanggal, jam } = formatTanggalJamWib(row.createdAt);
      const kodeKeluarga =
        row.kodeKeluarga || `KK-SKM-${String(row.id).padStart(4, "0")}`;
      const namaBalita = row.namaBalita || "Balita";

      return {
        id: row.id,
        kodeKeluarga,
        tanggal,
        jam,
        kepala: row.kepalaKeluarga || "-",
        balita: `${namaBalita} (${row.usiaBulan} bln)`,
        rw: row.dusun?.rw || "-",
        rt: row.rt || "RT 01",
        risiko: toTitleCaseRisk(row.statusRisiko),
        faktor:
          row.faktorDominan ||
          (Array.isArray(row.faktorDetail) && row.faktorDetail[0]?.label) ||
          "-",
      };
    });

    return res.status(200).json({
      success: true,
      message: "Riwayat prediksi berhasil diambil",
      data: {
        items,
        meta: {
          page: currentPage,
          limit: pageSize,
          total,
          totalPages,
        },
      },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  createPrediksi,
  getPrediksiById,
  getRiwayat,
};
