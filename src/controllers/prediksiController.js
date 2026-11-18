const axios = require("axios");
const prisma = require("../config/prisma");
const { predictRandomForest } = require("../services/mlService");

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

/**
 * Logika klasifikasi deterministik berbasis 8 fitur tervalidasi jurnal acuan:
 * (Atmadji & Nugraha, 2025; Ayue et al., 2025)
 *
 * 1. pendapatan
 * 2. statusSosialEkonomi
 * 3. pendidikan / pendidikanIbu
 * 4. sanitasi / kondisiSanitasi
 * 5. air / sumberAir
 * 6. usiaIbu
 * 7. asiEksklusif
 * 8. praktikMpasi
 */
function calculateDeterministicPrediction(fiturModel, antropometri = {}, dusun = {}) {
  const {
    pendapatan = 0,
    statusSosialEkonomi = "",
    pendidikan = "",
    pendidikanIbu = pendidikan,
    sanitasi = "",
    kondisiSanitasi = sanitasi,
    air = "",
    sumberAir = air,
    usiaIbu = null,
    asiEksklusif = "",
    praktikMpasi = "",
  } = fiturModel;

  const {
    usiaBulan = 12,
    tinggiBadan = null,
    beratBadan = null,
    tinggiBadanIbu = null,
    beratLahirGram = null,
  } = antropometri;

  const rawFactors = [];
  let riskScore = 0;

  // 1. Kondisi Sanitasi (0 - 30 poin)
  const sanitasiLower = String(kondisiSanitasi || "").toLowerCase();
  if (
    sanitasiLower.includes("tidak memiliki") ||
    sanitasiLower.includes("tidak ada") ||
    sanitasiLower.includes("sembarangan")
  ) {
    riskScore += 30;
    rawFactors.push({
      label: "Tidak Memiliki Jamban / BAB Sembarangan",
      weight: 30,
      short: "Sanitasi Buruk",
    });
  } else if (
    sanitasiLower.includes("komunal") ||
    sanitasiLower.includes("mck")
  ) {
    riskScore += 16;
    rawFactors.push({
      label: "Sanitasi Komunal (MCK Bersama)",
      weight: 16,
      short: "Sanitasi Komunal",
    });
  } else if (
    sanitasiLower.includes("tanpa septictank") ||
    sanitasiLower.includes("tidak layak")
  ) {
    riskScore += 10;
    rawFactors.push({
      label: "Jamban Layak Tanpa Septictank",
      weight: 10,
      short: "Jamban Tanpa Septictank",
    });
  } else {
    rawFactors.push({
      label: "Jamban Sehat & Septictank Pribadi",
      weight: 2,
      short: "Sanitasi Layak",
    });
  }

  // 2. Akses Air Bersih (0 - 25 poin)
  const airLower = String(sumberAir || "").toLowerCase();
  if (
    airLower.includes("sungai") ||
    airLower.includes("permukaan") ||
    (airLower.includes("terbuka") && airLower.includes("tidak terlindung"))
  ) {
    riskScore += 25;
    rawFactors.push({
      label: "Air Permukaan / Sungai Tak Terlindung",
      weight: 25,
      short: "Air Tak Terlindung",
    });
  } else if (
    airLower.includes("pamsimas") ||
    airLower.includes("hujan")
  ) {
    riskScore += 15;
    rawFactors.push({
      label: "Pamsimas / Penampungan Air Hujan",
      weight: 15,
      short: "Air Hujan / Pamsimas",
    });
  } else if (
    airLower.includes("sumur timba") ||
    airLower.includes("mata air")
  ) {
    riskScore += 10;
    rawFactors.push({
      label: "Sumur Timba / Mata Air Terlindung",
      weight: 10,
      short: "Sumur Timba",
    });
  } else if (
    airLower.includes("sumur bor") ||
    airLower.includes("sumur pompa")
  ) {
    riskScore += 5;
    rawFactors.push({
      label: "Sumur Pompa / Bor Terlindung",
      weight: 5,
      short: "Sumur Bor",
    });
  } else {
    rawFactors.push({
      label: "PDAM / Air Minum Kemasan Terlindungi",
      weight: 2,
      short: "Air Bersih Layak",
    });
  }

  // 3. Status Sosial Ekonomi Keluarga (0 - 20 poin)
  const sosEkLower = String(statusSosialEkonomi || "").toLowerCase();
  if (
    sosEkLower.includes("prasejahtera") ||
    sosEkLower.includes("pkh") ||
    sosEkLower.includes("bpnt")
  ) {
    riskScore += 20;
    rawFactors.push({
      label: "Status Sosial Ekonomi Prasejahtera (Penerima PKH/BPNT)",
      weight: 20,
      short: "Keluarga Prasejahtera",
    });
  } else if (
    sosEkLower.includes("rentan") ||
    sosEkLower.includes("bawah umr")
  ) {
    riskScore += 12;
    rawFactors.push({
      label: "Status Sosial Ekonomi Rentan Miskin / Bawah UMR",
      weight: 12,
      short: "Rentan Miskin",
    });
  } else if (
    sosEkLower.includes("menengah") ||
    sosEkLower.includes("sejahtera")
  ) {
    riskScore += 3;
    rawFactors.push({
      label: "Ketahanan Sosial Ekonomi Keluarga Mampu",
      weight: 3,
      short: "Sosial Ekonomi Mampu",
    });
  } else {
    riskScore += 8;
    rawFactors.push({
      label: "Kondisi Ketahanan Ekonomi Keluarga",
      weight: 8,
      short: "Ketahanan Ekonomi",
    });
  }

  // 4. Pendapatan Keluarga (0 - 15 poin)
  const pendNum = Number(pendapatan) || 0;
  if (pendNum < 1500000) {
    riskScore += 15;
    rawFactors.push({
      label: "Pendapatan Rendah (< Rp 1.500.000)",
      weight: 15,
      short: "Pendapatan Rendah",
    });
  } else if (pendNum < 2500000) {
    riskScore += 8;
    rawFactors.push({
      label: "Pendapatan Terbatas (< Rp 2.500.000)",
      weight: 8,
      short: "Pendapatan Terbatas",
    });
  } else {
    rawFactors.push({
      label: "Ketahanan Pendapatan Keluarga Memadai",
      weight: 3,
      short: "Ekonomi Memadai",
    });
  }

  // 5. Pendidikan Ibu (0 - 15 poin)
  const eduLower = String(pendidikanIbu || "").toLowerCase();
  if (
    eduLower.includes("tidak tamat") ||
    eduLower.includes("tidak sekolah")
  ) {
    riskScore += 15;
    rawFactors.push({
      label: "Pendidikan Ibu Tidak Tamat SD",
      weight: 15,
      short: "Pendidikan Ibu Rendah",
    });
  } else if (eduLower.includes("sd")) {
    riskScore += 12;
    rawFactors.push({
      label: "Pendidikan Terakhir Ibu Tamat SD",
      weight: 12,
      short: "Pendidikan Ibu SD",
    });
  } else if (eduLower.includes("smp")) {
    riskScore += 8;
    rawFactors.push({
      label: "Pendidikan Terakhir Ibu Tamat SMP",
      weight: 8,
      short: "Pendidikan Ibu SMP",
    });
  } else if (eduLower.includes("sma") || eduLower.includes("smk")) {
    riskScore += 4;
    rawFactors.push({
      label: "Pendidikan Terakhir Ibu SMA/SMK",
      weight: 4,
      short: "Pendidikan Ibu Menengah",
    });
  } else if (
    eduLower.includes("diploma") ||
    eduLower.includes("sarjana") ||
    eduLower.includes("d3") ||
    eduLower.includes("s1")
  ) {
    riskScore += 1;
    rawFactors.push({
      label: "Pendidikan Terakhir Ibu Diploma/Sarjana",
      weight: 1,
      short: "Pendidikan Ibu Tinggi",
    });
  } else {
    riskScore += 5;
    rawFactors.push({
      label: "Literasi Gizi & Pendidikan Ibu",
      weight: 5,
      short: "Pendidikan Ibu",
    });
  }

  // 6. Usia Ibu Saat Mengasuh / Hamil (0 - 16 poin)
  const numUsiaIbu = Number(usiaIbu);
  if (numUsiaIbu > 0 && numUsiaIbu < 20) {
    riskScore += 16;
    rawFactors.push({
      label: "Usia Ibu Berisiko Tinggi (< 20 Tahun)",
      weight: 16,
      short: "Usia Ibu < 20 Thn",
    });
  } else if (numUsiaIbu > 35) {
    riskScore += 12;
    rawFactors.push({
      label: "Usia Ibu Berisiko (> 35 Tahun)",
      weight: 12,
      short: "Usia Ibu > 35 Thn",
    });
  } else if (numUsiaIbu >= 20 && numUsiaIbu <= 35) {
    rawFactors.push({
      label: "Usia Ibu Reproduksi Sehat (20–35 Tahun)",
      weight: 3,
      short: "Usia Reproduksi Sehat",
    });
  } else {
    rawFactors.push({
      label: "Rentang Usia Reproduksi Ibu",
      weight: 4,
      short: "Usia Ibu",
    });
  }

  // 7. Riwayat ASI Eksklusif (0 - 16 poin)
  const asiLower = String(asiEksklusif || "").toLowerCase();
  if (
    asiLower.includes("tidak") ||
    asiLower.includes("formula") ||
    asiLower.includes("makanan dini")
  ) {
    riskScore += 16;
    rawFactors.push({
      label: "Tidak Mendapatkan ASI Eksklusif (Formula/Dini)",
      weight: 16,
      short: "Bukan ASI Eksklusif",
    });
  } else if (
    asiLower.includes("ya") ||
    asiLower.includes("eksklusif")
  ) {
    rawFactors.push({
      label: "Pemberian ASI Eksklusif 0–6 Bulan Optimal",
      weight: 2,
      short: "ASI Eksklusif",
    });
  } else {
    rawFactors.push({
      label: "Praktik Pemberian ASI Balita",
      weight: 5,
      short: "Pemberian ASI",
    });
  }

  // 8. Praktik Pemberian MPASI (0 - 15 poin)
  const mpasiLower = String(praktikMpasi || "").toLowerCase();
  if (
    mpasiLower.includes("terlambat") ||
    mpasiLower.includes("terlalu dini")
  ) {
    riskScore += 15;
    rawFactors.push({
      label: "Praktik MPASI Terlambat atau Terlalu Dini",
      weight: 15,
      short: "MPASI Kurang Tepat",
    });
  } else if (mpasiLower.includes("kurang beragam")) {
    riskScore += 10;
    rawFactors.push({
      label: "Praktik MPASI Kurang Beragam (Minim Protein Hewani)",
      weight: 10,
      short: "MPASI Kurang Beragam",
    });
  } else if (
    mpasiLower.includes("seimbang") ||
    mpasiLower.includes("tepat waktu")
  ) {
    rawFactors.push({
      label: "Praktik MPASI Tepat Waktu & Gizi Seimbang",
      weight: 2,
      short: "MPASI Gizi Seimbang",
    });
  } else if (mpasiLower.includes("belum")) {
    rawFactors.push({
      label: "Belum Memasuki Usia MPASI (< 6 Bulan)",
      weight: 2,
      short: "Belum Usia MPASI",
    });
  } else {
    rawFactors.push({
      label: "Pola Asuh Praktik Pemberian MPASI",
      weight: 4,
      short: "Praktik MPASI",
    });
  }

  // Data Pendukung KIA Tambahan (Opsional)
  if (beratLahirGram !== null && beratLahirGram !== undefined && !Number.isNaN(Number(beratLahirGram))) {
    if (Number(beratLahirGram) < 2500) {
      riskScore += 10;
      rawFactors.push({
        label: "Riwayat Berat Badan Lahir Rendah (BBLR < 2500g)",
        weight: 12,
        short: "Riwayat BBLR",
      });
    }
  }

  if (tinggiBadanIbu !== null && tinggiBadanIbu !== undefined && !Number.isNaN(Number(tinggiBadanIbu))) {
    if (Number(tinggiBadanIbu) < 145) {
      riskScore += 8;
      rawFactors.push({
        label: "Tinggi Badan Ibu Pendek (< 145 cm)",
        weight: 8,
        short: "TB Ibu Pendek",
      });
    }
  }

  // Penyesuaian antropometri balita jika diisi
  if (tinggiBadan !== null && tinggiBadan !== undefined && !Number.isNaN(Number(tinggiBadan))) {
    const expectedTb = 50 + usiaBulan * 1.1;
    if (Number(tinggiBadan) < expectedTb - 6) {
      riskScore += 12;
    }
  }

  // Menentukan Kategori Risiko Berdasarkan Akumulasi Skor
  let statusRisiko = "RENDAH";
  let pTinggi = 8;
  let pSedang = 17;
  let pRendah = 75;
  let keyakinanModel = 88;
  let prioritas = "Aman";

  if (riskScore >= 48) {
    statusRisiko = "TINGGI";
    pTinggi = Math.min(84, Math.max(62, Math.round(riskScore)));
    pSedang = Math.min(28, Math.max(12, Math.round((100 - pTinggi) * 0.72)));
    pRendah = Math.max(4, 100 - pTinggi - pSedang);
    keyakinanModel = Math.min(96, 84 + Math.round((riskScore - 48) / 3));
    prioritas = "Prioritas 1";
  } else if (riskScore >= 24) {
    statusRisiko = "SEDANG";
    pSedang = Math.min(68, Math.max(50, 46 + Math.round(riskScore / 2)));
    pTinggi = Math.min(30, Math.max(14, Math.round(riskScore * 0.52)));
    pRendah = Math.max(8, 100 - pTinggi - pSedang);
    keyakinanModel = Math.min(86, 74 + Math.round((riskScore - 24) / 2));
    prioritas = "Prioritas 2";
  } else {
    statusRisiko = "RENDAH";
    pRendah = Math.min(88, Math.max(70, 88 - riskScore));
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
      ? "Pola Asuh & Ketahanan Keluarga"
      : `${sortedFactors[0].short} & ${sortedFactors[1]?.short || "Sanitasi"}`;

  const namaPosyandu = dusun?.posyandu || "Posyandu Desa Sukamaju";
  const namaDusunSingkat = dusun?.namaSingkat || "Melati";

  let teksRekomendasi =
    "Pertahankan pola asuh dan gizi seimbang; lanjutkan pemantauan pertumbuhan bulanan di Posyandu.";
  let batasRekomendasi = "30 Hari Kerja";
  let penerimaRekomendasi = namaPosyandu;
  let rencanaIntervensi = "Pemantauan rutin Posyandu bulanan";

  if (statusRisiko === "TINGGI") {
    teksRekomendasi =
      "Segera koordinasikan rujukan perbaikan sanitasi/lingkungan ke Sanitarian Puskesmas dan fasilitasi bantuan PMT pemulihan berbasis pangan hewani serta pemantauan intensif oleh Bidan Desa.";
    batasRekomendasi = "3 Hari Kerja";
    penerimaRekomendasi = `Puskesmas ${namaDusunSingkat}`;
    rencanaIntervensi = "Rujukan Puskesmas + PMT Pemulihan Hewani (90 Hari) + Intervensi Sanitasi";
  } else if (statusRisiko === "SEDANG") {
    teksRekomendasi =
      "Tingkatkan edukasi praktik MPASI kaya protein hewani, konseling gizi pengasuhan balita, dan pemantauan penimbangan berkala di Posyandu setiap bulan.";
    batasRekomendasi = "7 Hari Kerja";
    penerimaRekomendasi = namaPosyandu;
    rencanaIntervensi = "Konseling gizi seimbang, edukasi MPASI & pemantauan rutin Posyandu";
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

/**
 * Memanggil mesin machine learning scikit-learn Random Forest
 * dengan 8 fitur model tervalidasi jurnal acuan, atau fallback deterministik jika gagal.
 */
async function callMlOrFallback(fiturModel, antropometri = {}, dusun = {}) {
  const fallback = calculateDeterministicPrediction(fiturModel, antropometri, dusun);

  try {
    const mlData = await predictRandomForest(fiturModel);
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
      prioritas: mlData.prioritas || fallback.prioritas,
      mlSource: "SCIKIT_LEARN_RANDOM_FOREST",
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
    noKk: record.noKk || null,
    kepalaKeluarga: record.kepalaKeluarga || null,
    namaIbu: record.namaIbu || null,
    namaBalita: record.namaBalita || null,
    nikBalita: record.nikBalita || null,
    jenisKelamin: record.jenisKelamin || null,
    rt: record.rt || null,
    usiaBulan: record.usiaBulan,
    tinggiBadan: record.tinggiBadan,
    beratBadan: record.beratBadan,
    zScoreTb: record.zScoreTb,
    zScoreBb: record.zScoreBb,
    statusTb: record.statusTb,
    statusBb: record.statusBb,
    pendapatan: record.pendapatan,
    statusSosialEkonomi: record.statusSosialEkonomi || null,
    pendidikanIbu: record.pendidikanIbu,
    usiaIbu: record.usiaIbu || null,
    riwayatKehamilan: record.riwayatKehamilan,
    sumberAir: record.sumberAir,
    kondisiSanitasi: record.kondisiSanitasi,
    asiEksklusif: record.asiEksklusif || null,
    praktikMpasi: record.praktikMpasi || null,
    tinggiBadanIbu: record.tinggiBadanIbu || null,
    beratLahirGram: record.beratLahirGram || null,
    keluarga: `${kepala} & Balita: ${balita} (${record.usiaBulan} bln) • ${rw}`,
    tanggal,
    jam,
    status: statusLower,
    statusRisiko: record.statusRisiko,
    keyakinan: record.keyakinanModel ?? 85,
    ambangKritis: record.ambangKritis ?? AMBANG_KRITIS,
    prioritas:
      record.prioritas ||
      (record.statusRisiko === "TINGGI"
        ? "Prioritas 1"
        : record.statusRisiko === "SEDANG"
        ? "Prioritas 2"
        : "Aman"),
    faktorDominan: record.faktorDominan || "Sanitasi & Air Bersih",
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
    dusun: record.dusun || null,
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
      select: { id: true, dusun: true },
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

    // 1. Identitas Keluarga & Balita
    const noKk = body.noKk ? String(body.noKk).trim() : null;
    const kepalaKeluarga =
      body.kepalaKeluarga && String(body.kepalaKeluarga).trim()
        ? String(body.kepalaKeluarga).trim()
        : null;
    const namaIbu =
      body.namaIbu && String(body.namaIbu).trim()
        ? String(body.namaIbu).trim()
        : null;
    const namaBalita =
      body.namaBalita && String(body.namaBalita).trim()
        ? String(body.namaBalita).trim()
        : null;
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
    const rawUsia = body.usia !== undefined ? body.usia : body.usiaBulan;

    // 2. Fitur Model Prediksi (8 Fitur Jurnal Acuan)
    const rawPendapatan = body.pendapatan;
    const pendidikanIbu = String(
      body.pendidikan || body.pendidikanIbu || ""
    ).trim();
    const sumberAir = String(body.air || body.sumberAir || "").trim();
    const kondisiSanitasi = String(
      body.sanitasi || body.kondisiSanitasi || ""
    ).trim();

    // Nilai default cerdas untuk fitur sosio-ekonomi & pengasuhan baru agar backward-compatible
    const statusSosialEkonomi = String(
      body.statusSosialEkonomi ||
        body.statusEkonomi ||
        (Number(rawPendapatan) < 1500000
          ? "Prasejahtera / Penerima Bantuan (PKH/BPNT)"
          : Number(rawPendapatan) < 3000000
          ? "Rentan Miskin / Bawah UMR"
          : "Menengah / Sejahtera")
    ).trim();

    const usiaIbu =
      body.usiaIbu !== undefined && body.usiaIbu !== "" && !Number.isNaN(Number(body.usiaIbu))
        ? parseInt(body.usiaIbu, 10)
        : null;

    const asiEksklusif = String(
      body.asiEksklusif || "Ya (ASI Eksklusif 0–6 Bulan / Masih Berjalan)"
    ).trim();

    const praktikMpasi = String(
      body.praktikMpasi ||
        (Number(rawUsia) < 6
          ? "Belum Usia MPASI (< 6 Bulan)"
          : "Tepat Waktu & Gizi Seimbang (Protein Hewani)")
    ).trim();

    // 3. Data Pendukung KIA (Opsional / Non-Fitur Utama)
    const riwayatKehamilan = String(
      body.kek || body.riwayatKehamilan || "Tidak Pernah KEK"
    ).trim();

    const tinggiBadanIbu =
      body.tinggiBadanIbu !== undefined &&
      body.tinggiBadanIbu !== "" &&
      !Number.isNaN(Number(body.tinggiBadanIbu))
        ? parseFloat(body.tinggiBadanIbu)
        : null;

    const beratLahirGram =
      body.beratLahirGram !== undefined &&
      body.beratLahirGram !== "" &&
      !Number.isNaN(Number(body.beratLahirGram))
        ? parseInt(body.beratLahirGram, 10)
        : null;

    const tinggiBadan =
      body.tinggiBadan !== undefined &&
      body.tinggiBadan !== "" &&
      !Number.isNaN(Number(body.tinggiBadan))
        ? parseFloat(body.tinggiBadan)
        : null;

    const beratBadan =
      body.beratBadan !== undefined &&
      body.beratBadan !== "" &&
      !Number.isNaN(Number(body.beratBadan))
        ? parseFloat(body.beratBadan)
        : null;

    // Validasi Field Utama
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

    let dusun;
    if (req.user?.role === "KADER") {
      if (!req.user.dusunId) {
        return res.status(400).json({
          success: false,
          message: "Akun Kader Anda belum ditugaskan ke wilayah dusun manapun. Hubungi administrator desa.",
        });
      }
      dusun = await prisma.dusun.findUnique({
        where: { id: req.user.dusunId },
      });
      if (!dusun) {
        return res.status(400).json({
          success: false,
          message: "Wilayah dusun penugasan Kader tidak ditemukan di sistem.",
        });
      }
    } else {
      dusun = await resolveTargetDusun({
        dusunId: body.dusunId,
        wilayah: body.wilayah,
        userId: req.user?.id,
      });
    }

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

    // 8 Fitur Model Prediksi Tervalidasi
    const fiturModel = {
      pendapatan: Math.round(pendapatan),
      statusSosialEkonomi,
      pendidikan: pendidikanIbu,
      sanitasi: kondisiSanitasi,
      air: sumberAir,
      usiaIbu,
      asiEksklusif,
      praktikMpasi,
    };

    // Data Antropometri & Pendukung KIA
    const dataKia = {
      usiaBulan: Math.round(usiaBulan),
      tinggiBadan,
      beratBadan,
      tinggiBadanIbu,
      beratLahirGram,
    };

    const mlResult = await callMlOrFallback(fiturModel, dataKia, dusun);

    const created = await prisma.skriningStunting.create({
      data: {
        kodeKeluarga,
        noKk,
        kepalaKeluarga: kepalaKeluarga || `Keluarga ${kodeKeluarga}`,
        namaIbu:
          namaIbu ||
          (kepalaKeluarga
            ? `Ibu (${kepalaKeluarga.replace(/^Bpk\.\s*/i, "")})`
            : `Ibu ${kodeKeluarga}`),
        namaBalita: namaBalita || `Balita ${kodeKeluarga}`,
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
        statusSosialEkonomi,
        pendidikanIbu,
        usiaIbu,
        riwayatKehamilan,
        sumberAir,
        kondisiSanitasi,
        asiEksklusif,
        praktikMpasi,
        tinggiBadanIbu,
        beratLahirGram,
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

    // Pembatasan akses berbasis wilayah untuk role KADER
    if (req.user?.role === "KADER") {
      if (!req.user.dusunId || record.dusunId !== req.user.dusunId) {
        return res.status(403).json({
          success: false,
          message: "Akses ditolak: Anda tidak memiliki izin untuk melihat data skrining di luar wilayah dusun tugas Anda.",
        });
      }
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

    // Pembatasan akses berbasis wilayah untuk role KADER
    if (req.user?.role === "KADER") {
      if (!req.user.dusunId) {
        return res.status(200).json({
          success: true,
          message: "Riwayat prediksi berhasil diambil (Kader belum ditugaskan ke dusun)",
          data: {
            items: [],
            meta: {
              page: 1,
              limit: pageSize,
              total: 0,
              totalPages: 1,
            },
          },
        });
      }
      where.dusunId = req.user.dusunId;
    } else {
      const trimmedRw = String(rw).trim();
      if (trimmedRw && !trimmedRw.toLowerCase().includes("semua")) {
        where.dusun = { rw: trimmedRw };
      }
    }

    const trimmedSearch = String(search).trim();
    if (trimmedSearch) {
      where.OR = [
        { kepalaKeluarga: { contains: trimmedSearch } },
        { namaBalita: { contains: trimmedSearch } },
        { kodeKeluarga: { contains: trimmedSearch } },
        { noKk: { contains: trimmedSearch } },
        { namaIbu: { contains: trimmedSearch } },
      ];
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
        noKk: row.noKk || "-",
        tanggal,
        jam,
        kepala: row.kepalaKeluarga || "-",
        namaIbu: row.namaIbu || "-",
        balita: `${namaBalita} (${row.usiaBulan} bln)`,
        namaBalita,
        usiaBulan: row.usiaBulan,
        rw: row.dusun?.rw || "-",
        rt: row.rt || "RT 01",
        risiko: toTitleCaseRisk(row.statusRisiko),
        statusRisiko: row.statusRisiko,
        statusSosialEkonomi: row.statusSosialEkonomi || "-",
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
  callMlOrFallback,
};
