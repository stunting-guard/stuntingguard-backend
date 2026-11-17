const prisma = require("../config/prisma");

function toTitleCaseZona(zona) {
  if (!zona) return "Hijau";
  const z = String(zona).toUpperCase();
  if (z === "MERAH") return "Merah";
  if (z === "KUNING") return "Kuning";
  return "Hijau";
}

function toLowerCaseZona(zona) {
  if (!zona) return "hijau";
  const z = String(zona).toUpperCase();
  if (z === "MERAH") return "merah";
  if (z === "KUNING") return "kuning";
  return "hijau";
}

function toTitleCaseRisk(statusRisiko) {
  if (statusRisiko === "TINGGI") return "Tinggi";
  if (statusRisiko === "SEDANG") return "Sedang";
  return "Rendah";
}

function getToneFromZona(zona) {
  const z = String(zona || "").toUpperCase();
  if (z === "MERAH") return "merah";
  if (z === "KUNING") return "kuning";
  return "hijau";
}

// 1. Dashboard Aparatur (GET /api/aparatur/dashboard)
async function getDashboardAparatur(req, res, next) {
  try {
    const dusunList = await prisma.dusun.findMany({
      orderBy: { id: "asc" },
      include: {
        skrining: {
          select: {
            id: true,
            statusRisiko: true,
          },
        },
      },
    });

    let totalBalita = 0;
    let totalKasus = 0;
    let dusunAman = 0;

    const dusunData = dusunList.map((d) => {
      const kasusTinggi = d.skrining.filter(
        (s) => s.statusRisiko === "TINGGI"
      ).length;
      const kapasitas = d.kapasitasBalita || 100;
      totalBalita += kapasitas;
      totalKasus += kasusTinggi;

      if (d.zona === "HIJAU") {
        dusunAman += 1;
      }

      return {
        id: d.id,
        nama: d.nama,
        namaSingkat: d.namaSingkat || d.nama.replace(/^Dusun\s+/i, ""),
        zona: toTitleCaseZona(d.zona),
        kasus: kasusTinggi,
        balita: kapasitas,
        prioritas: d.prioritas || (d.zona === "MERAH" ? "PMT Ekstra" : "Pemantauan Rutin"),
      };
    });

    const persenKasus =
      totalBalita > 0 ? Number(((totalKasus / totalBalita) * 100).toFixed(1)) : 0;

    return res.status(200).json({
      success: true,
      message: "Data dashboard aparatur berhasil diambil",
      data: {
        dusun: dusunData,
        summary: {
          totalBalita,
          totalKasus,
          persenKasus,
          dusunAman,
        },
      },
    });
  } catch (err) {
    return next(err);
  }
}

// 2. Data Keluarga (GET /api/aparatur/data-keluarga)
async function getDataKeluargaAparatur(req, res, next) {
  try {
    const { dusun: dusunQuery, zona: zonaQuery, search = "" } = req.query;

    const whereDusun = {};
    if (dusunQuery && !dusunQuery.toLowerCase().includes("semua")) {
      whereDusun.OR = [
        { nama: { contains: dusunQuery } },
        { namaSingkat: { contains: dusunQuery } },
      ];
    }
    if (zonaQuery && !zonaQuery.toLowerCase().includes("semua")) {
      whereDusun.zona = zonaQuery.toUpperCase();
    }

    const dusunList = await prisma.dusun.findMany({
      where: whereDusun,
      orderBy: { id: "asc" },
      include: {
        skrining: true,
      },
    });

    const dusunRecap = dusunList.map((d) => {
      let skrining = d.skrining;
      if (search.trim()) {
        const s = search.toLowerCase();
        skrining = skrining.filter(
          (k) =>
            (k.kepalaKeluarga && k.kepalaKeluarga.toLowerCase().includes(s)) ||
            (k.namaBalita && k.namaBalita.toLowerCase().includes(s)) ||
            (k.kodeKeluarga && k.kodeKeluarga.toLowerCase().includes(s)) ||
            (k.noKk && k.noKk.toLowerCase().includes(s)) ||
            (k.namaIbu && k.namaIbu.toLowerCase().includes(s))
        );
      }

      const tinggi = skrining.filter((s) => s.statusRisiko === "TINGGI").length;
      const sedang = skrining.filter((s) => s.statusRisiko === "SEDANG").length;
      const rendah = skrining.filter((s) => s.statusRisiko === "RENDAH").length;
      const total = skrining.length;

      return {
        id: d.id,
        nama: d.nama,
        total,
        tinggi,
        sedang,
        rendah,
      };
    });

    const allSkrining = await prisma.skriningStunting.findMany({
      select: {
        pendapatan: true,
        kondisiSanitasi: true,
        sumberAir: true,
        pendidikanIbu: true,
        riwayatKehamilan: true,
        faktorDetail: true,
      },
    });

    // Hitung persentase faktor determinan desa
    let totalScore = 0;
    const factorCounts = {
      pendapatan: 0,
      sanitasi: 0,
      air: 0,
      pendidikan: 0,
      kek: 0,
    };

    allSkrining.forEach((row) => {
      if (row.pendapatan < 2000000) {
        factorCounts.pendapatan += 3;
        totalScore += 3;
      }
      if (row.kondisiSanitasi && !row.kondisiSanitasi.toLowerCase().includes("pribadi layak")) {
        factorCounts.sanitasi += 3;
        totalScore += 3;
      }
      if (row.sumberAir && !row.sumberAir.toLowerCase().includes("perpipaan")) {
        factorCounts.air += 2;
        totalScore += 2;
      }
      if (row.pendidikanIbu && (row.pendidikanIbu.toLowerCase().includes("sd") || row.pendidikanIbu.toLowerCase().includes("smp"))) {
        factorCounts.pendidikan += 2;
        totalScore += 2;
      }
      if (row.riwayatKehamilan && row.riwayatKehamilan.toLowerCase().includes("pernah kek")) {
        factorCounts.kek += 2;
        totalScore += 2;
      }
    });

    const calcPercent = (val) =>
      totalScore > 0 ? Math.round((val / totalScore) * 100) : 20;

    const faktor = [
      {
        id: "pendapatan",
        judul: "Pendapatan & Ketahanan Pangan",
        deskripsi: "Daya beli pangan hewani dan gizi seimbang terbatas",
        persen: calcPercent(factorCounts.pendapatan) || 38,
      },
      {
        id: "sanitasi",
        judul: "Fasilitas Sanitasi & MCK",
        deskripsi: "Penggunaan jamban tidak layak dan MCK komunal minim standar",
        persen: calcPercent(factorCounts.sanitasi) || 28,
      },
      {
        id: "air",
        judul: "Akses Air Minum Bersih",
        deskripsi: "Sumber air sumur gali terbuka dan belum terlindungi optimal",
        persen: calcPercent(factorCounts.air) || 20,
      },
      {
        id: "pendidikan",
        judul: "Literasi Pola Asuh & Gizi",
        deskripsi: "Tingkat pemahaman ibu terkait MPASI bergizi seimbang",
        persen: calcPercent(factorCounts.pendidikan) || 14,
      },
    ];

    return res.status(200).json({
      success: true,
      message: "Ringkasan data keluarga berhasil diambil",
      data: {
        dusun: dusunRecap,
        faktor,
      },
    });
  } catch (err) {
    return next(err);
  }
}

// 3. Peta Wilayah (GET /api/aparatur/peta-wilayah)
async function getPetaWilayahAparatur(req, res, next) {
  try {
    const { zona, dusunId } = req.query;

    const where = {};
    if (zona && !zona.toLowerCase().includes("semua")) {
      const zUpper = zona.toUpperCase() === "AMAN" ? "HIJAU" : zona.toUpperCase();
      where.zona = zUpper;
    }
    if (dusunId && !Number.isNaN(Number(dusunId))) {
      where.id = Number(dusunId);
    }

    const dusunList = await prisma.dusun.findMany({
      where,
      orderBy: { id: "asc" },
      include: {
        skrining: {
          select: {
            id: true,
            statusRisiko: true,
            kondisiSanitasi: true,
          },
        },
      },
    });

    const dusunData = dusunList.map((d) => {
      const kasusTinggi = d.skrining.filter(
        (s) => s.statusRisiko === "TINGGI"
      ).length;
      const sanitasiKurang = d.skrining.filter(
        (s) =>
          s.kondisiSanitasi &&
          !s.kondisiSanitasi.toLowerCase().includes("pribadi layak")
      ).length;

      const kapasitas = d.kapasitasBalita || 100;
      const prevalensi =
        kapasitas > 0
          ? Number(((kasusTinggi / kapasitas) * 100).toFixed(1))
          : 0;

      return {
        id: d.id,
        nama: d.nama,
        zona: toLowerCaseZona(d.zona),
        rw: d.rw,
        posyandu: d.posyandu,
        kapasitas,
        prevalensi,
        prevalensiLabel: "Prevalensi Stunting",
        kasus: kasusTinggi,
        stat1: {
          nilai: `${kasusTinggi} Balita`,
          label: "Kasus Risiko Tinggi",
        },
        stat2: {
          nilai: `${sanitasiKurang} Rumah`,
          label: "Sanitasi Kurang Layak",
        },
        polygon: d.polygon,
        pusat: d.pusat,
        labelPos: d.labelPos,
      };
    });

    return res.status(200).json({
      success: true,
      message: "Data peta wilayah berhasil diambil",
      data: {
        dusun: dusunData,
      },
    });
  } catch (err) {
    return next(err);
  }
}

// 4. Detail Hasil Prediksi Aparatur (GET /api/aparatur/hasil-prediksi/:id)
async function getHasilPrediksiDetailAparatur(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "ID hasil prediksi tidak valid",
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

    const statusTitle = toTitleCaseRisk(record.statusRisiko);
    const judul =
      record.statusRisiko === "TINGGI"
        ? "Balita Terindikasi Berisiko Tinggi Stunting"
        : record.statusRisiko === "SEDANG"
        ? "Balita Terindikasi Berisiko Sedang Stunting"
        : "Pertumbuhan Balita Terpantau Aman & Sesuai Standar";

    const deskripsi =
      record.statusRisiko === "TINGGI"
        ? `Balita memerlukan pendampingan gizi intensif dan pemantauan berkala oleh Bidan ${record.dusun?.posyandu || "Desa"}.`
        : record.statusRisiko === "SEDANG"
        ? `Balita memerlukan konseling pola asuh gizi dan suplementasi berkala di ${record.dusun?.posyandu || "Posyandu"}.`
        : "Lanjutkan pemantauan tumbuh kembang bulanan dan pertahankan gizi seimbang di Posyandu.";

    const prioritasNumber =
      record.statusRisiko === "TINGGI" ? 1 : record.statusRisiko === "SEDANG" ? 2 : 3;

    const rekDetail =
      record.rekomendasiDetail && typeof record.rekomendasiDetail === "object"
        ? record.rekomendasiDetail
        : {};

    const defaultIntervensi = [
      {
        id: 1,
        judul: "Kunjungan Rutin Kader & Bidan",
        tag: "Setiap 2 Pekan",
        deskripsi: `Bidan Desa dan Kader ${record.dusun?.posyandu || "Posyandu"} melakukan pengecekan berat dan tinggi badan secara berkala.`,
        footer: "Mulai Pelaksanaan: Pekan Pertama Bulan Ini",
      },
      {
        id: 2,
        judul: "Pemberian PMT Gizi Tambahan",
        tag: "Protein Hewani",
        deskripsi: "Distribusi paket makanan tambahan pemulihan berbasis telur, susu balita, dan makanan bergizi tinggi.",
        footer: "Fokus Paket: Telur & Susu Balita (90 Hari)",
      },
    ];

    const intervensiList = Array.isArray(rekDetail.intervensi) && rekDetail.intervensi.length > 0
      ? rekDetail.intervensi
      : defaultIntervensi;

    const rtRw = `${record.rt || "RT 01"} / ${record.dusun?.rw || "RW 01"}`;

    return res.status(200).json({
      success: true,
      message: "Detail hasil prediksi berhasil diambil",
      data: {
        id: record.id,
        status: statusTitle,
        judul,
        deskripsi,
        prioritas: prioritasNumber,
        keyakinan: Math.round(record.keyakinanModel || 85),
        ambangKritis: Math.round(record.ambangKritis || 70),
        balita: {
          nama: record.namaBalita || "Ananda",
          nik: record.nikBalita || "-",
          jenisKelamin: record.jenisKelamin || "Laki-laki",
          usiaBulan: record.usiaBulan,
        },
        tinggiBadan: {
          nilai: record.tinggiBadan !== null ? Number(record.tinggiBadan) : 80.0,
          zScore: record.zScoreTb !== null ? Number(record.zScoreTb) : -2.1,
          status: record.statusTb || (record.statusRisiko === "TINGGI" ? "Di Bawah Standar (Pendek)" : "Normal"),
        },
        beratBadan: {
          nilai: record.beratBadan !== null ? Number(record.beratBadan) : 9.5,
          zScore: record.zScoreBb !== null ? Number(record.zScoreBb) : -1.5,
          status: record.statusBb || (record.statusRisiko === "TINGGI" ? "Kurang" : "Normal"),
        },
        lingkungan: {
          dusun: record.dusun?.nama || "Dusun Melati",
          rtRw,
          kepalaKeluarga: record.kepalaKeluarga || "-",
          jamban: record.kondisiSanitasi || "Jamban Tidak Layak",
          sumberAir: record.sumberAir || "Sumur Gali",
        },
        intervensi: intervensiList,
      },
    });
  } catch (err) {
    return next(err);
  }
}

// 5. Laporan Ringkasan Aparatur (GET /api/aparatur/laporan)
async function getLaporanAparatur(req, res, next) {
  try {
    const dusunList = await prisma.dusun.findMany({
      orderBy: { id: "asc" },
      include: {
        skrining: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    let totalSasaran = 0;
    let berisiko = 0;

    const wilayahRecap = dusunList.map((d) => {
      const kasusTinggi = d.skrining.filter(
        (s) => s.statusRisiko === "TINGGI"
      ).length;
      const kapasitas = d.kapasitasBalita || 100;
      totalSasaran += kapasitas;
      berisiko += kasusTinggi;

      return {
        id: d.id,
        dusun: d.nama,
        tag: d.zona === "MERAH" ? "Prioritas 1" : d.zona === "KUNING" ? "Prioritas 2" : "Aman",
        kasus: kasusTinggi,
        catatan:
          d.prioritas ||
          (d.zona === "MERAH"
            ? "Prevalensi tinggi • Fokus PMT telur & susu harian"
            : "Pemantauan berkala Posyandu"),
        tone: getToneFromZona(d.zona),
      };
    });

    const highRiskSkrining = await prisma.skriningStunting.findMany({
      where: { statusRisiko: "TINGGI" },
      include: { dusun: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const balitaPrioritas = highRiskSkrining.map((item) => ({
      id: item.id,
      nama: item.namaBalita || "Balita",
      dusun: item.dusun?.nama || "Dusun Melati",
      usia: item.usiaBulan,
      risiko: toTitleCaseRisk(item.statusRisiko),
      intervensi: "Paket PMT Telur & Susu 90 Hari",
    }));

    return res.status(200).json({
      success: true,
      message: "Laporan ringkasan berhasil diambil",
      data: {
        ringkasan: {
          totalSasaran,
          berisiko,
          paketPmt: berisiko,
          targetEliminasi: 2025,
        },
        wilayah: wilayahRecap,
        balitaPrioritas,
      },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getDashboardAparatur,
  getDataKeluargaAparatur,
  getPetaWilayahAparatur,
  getHasilPrediksiDetailAparatur,
  getLaporanAparatur,
};
