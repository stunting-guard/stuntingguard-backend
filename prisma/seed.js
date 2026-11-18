require("dotenv/config");

const bcrypt = require("bcryptjs");
const prisma = require("../src/config/prisma");

const DEFAULT_PASSWORD = "password123";
const AMBANG_KRITIS = 70;

const USERS = [
  {
    email: "posyandu@posyandu.go.id",
    name: "Mamil Ganteng",
    role: "KADER",
    dusunNama: "Dusun Melati",
  },
  {
    email: "aparatur.desa@desa.go.id",
    name: "Varghi Ganteng",
    role: "APARATUR",
  },
  {
    email: "admin@admin.go.id",
    name: "Admin StuntingGuard",
    role: "ADMIN",
  },
];

const DUSUN = [
  {
    nama: "Dusun Melati",
    namaSingkat: "Melati",
    kecamatan: "Kec. Cibadak",
    rw: "RW 01",
    posyandu: "Posyandu Melati Indah",
    kapasitasBalita: 120,
    zona: "MERAH",
    prioritas: "PMT Ekstra",
    polygon: "110,105 400,100 410,230 330,300 100,215",
    pusat: { x: 255, y: 175 },
    labelPos: { x: 255, y: 330 },
  },
  {
    nama: "Dusun Mawar",
    namaSingkat: "Mawar",
    kecamatan: "Kec. Cibadak",
    rw: "RW 02",
    posyandu: "Posyandu Mawar Asri",
    kapasitasBalita: 110,
    zona: "KUNING",
    prioritas: "Sanitasi & Akses Air Bersih",
    polygon: "420,100 735,120 750,235 600,255 480,330 415,240",
    pusat: { x: 575, y: 185 },
    labelPos: { x: 640, y: 275 },
  },
  {
    nama: "Dusun Kenanga",
    namaSingkat: "Kenanga",
    kecamatan: "Kec. Cikalong",
    rw: "RW 03",
    posyandu: "Posyandu Kenanga Harapan",
    kapasitasBalita: 105,
    zona: "HIJAU",
    prioritas: "Pemantauan Rutin Posyandu Bulanan",
    polygon: "130,305 345,320 420,380 405,470 205,480 128,390",
    pusat: { x: 265, y: 395 },
    labelPos: { x: 300, y: 495 },
  },
  {
    nama: "Dusun Cempaka",
    namaSingkat: "Cempaka",
    kecamatan: "Kec. Cikalong",
    rw: "RW 04",
    posyandu: "Posyandu Cempaka Putih",
    kapasitasBalita: 95,
    zona: "HIJAU",
    prioritas: "Edukasi Mandiri Pola Asuh & MPASI",
    polygon: "425,400 535,325 745,340 730,450 480,480 395,415",
    pusat: { x: 575, y: 400 },
    labelPos: { x: 650, y: 495 },
  },
];

function probabilitas(tinggi, sedang, rendah) {
  return [
    {
      key: "tinggi",
      label: "Risiko Tinggi",
      value: tinggi,
      desc: "Probabilitas mayoritas klasifikasi",
    },
    {
      key: "sedang",
      label: "Risiko Sedang",
      value: sedang,
      desc: "Peluang faktor perantara",
    },
    {
      key: "rendah",
      label: "Risiko Rendah",
      value: rendah,
      desc: "Ambang normal sangat kecil",
    },
  ];
}

function intervensiUntuk(status) {
  if (status === "TINGGI") {
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

  if (status === "SEDANG") {
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

function rekomendasiDetail(teks, batas, penerima, status) {
  return {
    teks,
    batas,
    penerima,
    intervensi: intervensiUntuk(status),
  };
}

const SKRINING = [
  {
    kodeKeluarga: "KK-SKM-0142",
    kepalaKeluarga: "Bpk. Slamet Riyadi",
    namaBalita: "Ananda Yusuf",
    nikBalita: "3204128492040001",
    jenisKelamin: "Laki-laki",
    rt: "RT 02",
    usiaBulan: 24,
    tinggiBadan: 78.2,
    beratBadan: 9.1,
    zScoreTb: -2.6,
    zScoreBb: -2.0,
    statusTb: "Di Bawah Standar (Pendek)",
    statusBb: "Kurang",
    pendapatan: 1500000,
    pendidikanIbu: "SMA (Sekolah Menengah Atas)",
    riwayatKehamilan: "Pernah KEK (Kurang Energi Kronis)",
    sumberAir: "Mata Air Tidak Terlindung",
    kondisiSanitasi: "Jamban Tidak Layak",
    statusRisiko: "TINGGI",
    keyakinanModel: 92,
    ambangKritis: AMBANG_KRITIS,
    prioritas: "Prioritas 1",
    faktorDominan: "Sanitasi & Sumber Air Minum",
    probabilitas: probabilitas(68, 24, 8),
    faktorDetail: [
      { label: "Sanitasi Tidak Layak", value: 42 },
      { label: "Sumber Air Tak Terlindungi (Sumur Terbuka)", value: 26 },
      { label: "Pendapatan Rendah (Di Bawah UMR Daerah)", value: 18 },
      { label: "Pendidikan Ibu (Tamat SD / Tidak Selesai)", value: 9 },
      { label: "Riwayat KEK Ibu (Kurang Energi Kronis)", value: 5 },
    ],
    rekomendasiDetail: rekomendasiDetail(
      "Segera jadwalkan rujukan perbaikan jamban sehat ke Sanitarian Puskesmas dan fasilitasi bantuan PMT pemulihan serta akses air bersih aman untuk balita.",
      "3 Hari Kerja",
      "Puskesmas Melati",
      "TINGGI"
    ),
    rencanaIntervensi: "Rujukan sanitasi ke Puskesmas + PMT pemulihan 90 hari",
    dusunNama: "Dusun Melati",
  },
  {
    kodeKeluarga: "KK-SKM-0107",
    kepalaKeluarga: "Bpk. Ahmad Fauzi",
    namaBalita: "Muhammad Rizky",
    nikBalita: "3204128492040002",
    jenisKelamin: "Laki-laki",
    rt: "RT 02",
    usiaBulan: 24,
    tinggiBadan: 80.5,
    beratBadan: 9.8,
    zScoreTb: -2.35,
    zScoreBb: -1.72,
    statusTb: "Di Bawah Standar (Pendek)",
    statusBb: "Kurang",
    pendapatan: 1200000,
    pendidikanIbu: "SMP (Sekolah Menengah Pertama)",
    riwayatKehamilan: "Pernah KEK (Kurang Energi Kronis)",
    sumberAir: "Sumur Gali Terlindung",
    kondisiSanitasi: "MCK Komunal",
    statusRisiko: "TINGGI",
    keyakinanModel: 89,
    ambangKritis: AMBANG_KRITIS,
    prioritas: "Prioritas 1",
    faktorDominan: "Sanitasi Buruk",
    probabilitas: probabilitas(72, 21, 7),
    faktorDetail: [
      { label: "Sanitasi Tidak Layak", value: 45 },
      { label: "Sumber Air Tak Terlindungi", value: 25 },
      { label: "Pendapatan Rendah (Di Bawah UMR Daerah)", value: 16 },
      { label: "Pendidikan Ibu Rendah", value: 9 },
      { label: "Riwayat KEK Ibu", value: 5 },
    ],
    rekomendasiDetail: rekomendasiDetail(
      "Balita memerlukan pendampingan gizi intensif dan pemantauan berkala oleh Bidan Desa Sukamaju serta perbaikan fasilitas sanitasi keluarga.",
      "3 Hari Kerja",
      "Puskesmas Melati",
      "TINGGI"
    ),
    rencanaIntervensi: "Pendampingan gizi intensif & perbaikan sanitasi",
    dusunNama: "Dusun Melati",
  },
  {
    kodeKeluarga: "KK-SKM-0512",
    kepalaKeluarga: "Bpk. Agus Setiawan",
    namaBalita: "Nayla Putri",
    nikBalita: "3204128492040003",
    jenisKelamin: "Perempuan",
    rt: "RT 01",
    usiaBulan: 32,
    tinggiBadan: 86.0,
    beratBadan: 11.5,
    zScoreTb: -1.4,
    zScoreBb: -1.2,
    statusTb: "Normal",
    statusBb: "Normal",
    pendapatan: 2500000,
    pendidikanIbu: "SMA (Sekolah Menengah Atas)",
    riwayatKehamilan: "Tidak Pernah KEK",
    sumberAir: "PDAM / Perpipaan",
    kondisiSanitasi: "Jamban Pribadi Layak",
    statusRisiko: "SEDANG",
    keyakinanModel: 76,
    ambangKritis: AMBANG_KRITIS,
    prioritas: "Prioritas 2",
    faktorDominan: "Pendidikan Ibu Rendah",
    probabilitas: probabilitas(20, 62, 18),
    faktorDetail: [
      { label: "Pendidikan Pengasuh Rendah", value: 34 },
      { label: "Pendapatan Keluarga", value: 28 },
      { label: "Akses Air Bersih", value: 22 },
      { label: "Kondisi Sanitasi", value: 16 },
    ],
    rekomendasiDetail: rekomendasiDetail(
      "Konseling gizi dan pemantauan berkala di Posyandu perlu dilanjutkan untuk menjaga status gizi balita.",
      "7 Hari Kerja",
      "Posyandu Mawar Asri",
      "SEDANG"
    ),
    rencanaIntervensi: "Konseling gizi & pantau Posyandu",
    dusunNama: "Dusun Mawar",
  },
  {
    kodeKeluarga: "KK-SKM-0620",
    kepalaKeluarga: "Bpk. Dedi Kurniawan",
    namaBalita: "Bilal",
    nikBalita: "3204128492040004",
    jenisKelamin: "Laki-laki",
    rt: "RT 03",
    usiaBulan: 5,
    tinggiBadan: 62.0,
    beratBadan: 6.2,
    zScoreTb: 0.2,
    zScoreBb: 0.1,
    statusTb: "Normal",
    statusBb: "Normal",
    pendapatan: 3000000,
    pendidikanIbu: "Perguruan Tinggi",
    riwayatKehamilan: "Tidak Pernah KEK",
    sumberAir: "PDAM / Perpipaan",
    kondisiSanitasi: "Jamban Pribadi Layak",
    statusRisiko: "RENDAH",
    keyakinanModel: 88,
    ambangKritis: AMBANG_KRITIS,
    prioritas: "Aman",
    faktorDominan: "ASI Eksklusif & Sanitasi Layak",
    probabilitas: probabilitas(6, 14, 80),
    faktorDetail: [
      { label: "Pola Asuh & Gizi Seimbang", value: 40 },
      { label: "ASI Eksklusif", value: 35 },
      { label: "Sanitasi Layak", value: 25 },
    ],
    rekomendasiDetail: rekomendasiDetail(
      "Pertahankan pola asuh dan gizi seimbang; lanjutkan pemantauan rutin Posyandu.",
      "30 Hari Kerja",
      "Posyandu Mawar Asri",
      "RENDAH"
    ),
    rencanaIntervensi: "Pemantauan rutin & edukasi MPASI",
    dusunNama: "Dusun Mawar",
  },
  {
    kodeKeluarga: "KK-SKM-0705",
    kepalaKeluarga: "Bpk. Eko Prasetyo",
    namaBalita: "Arkan",
    nikBalita: "3204128492040005",
    jenisKelamin: "Laki-laki",
    rt: "RT 01",
    usiaBulan: 7,
    tinggiBadan: 66.0,
    beratBadan: 7.0,
    zScoreTb: 0.1,
    zScoreBb: 0.3,
    statusTb: "Normal",
    statusBb: "Normal",
    pendapatan: 2800000,
    pendidikanIbu: "SMA (Sekolah Menengah Atas)",
    riwayatKehamilan: "Tidak Pernah KEK",
    sumberAir: "Sumur Bor / Pompa",
    kondisiSanitasi: "Jamban Pribadi Layak",
    statusRisiko: "RENDAH",
    keyakinanModel: 90,
    ambangKritis: AMBANG_KRITIS,
    prioritas: "Aman",
    faktorDominan: "Kondisi Rumah & Gizi Seimbang",
    probabilitas: probabilitas(5, 15, 80),
    faktorDetail: [
      { label: "Kondisi Rumah Sehat", value: 38 },
      { label: "Gizi Seimbang", value: 34 },
      { label: "Akses Air Bersih", value: 28 },
    ],
    rekomendasiDetail: rekomendasiDetail(
      "Pertahankan kondisi lingkungan sehat dan gizi seimbang; lanjutkan pemantauan bulanan di Posyandu.",
      "30 Hari Kerja",
      "Posyandu Kenanga Harapan",
      "RENDAH"
    ),
    rencanaIntervensi: "Pemantauan rutin Posyandu bulanan",
    dusunNama: "Dusun Kenanga",
  },
  {
    kodeKeluarga: "KK-SKM-0833",
    kepalaKeluarga: "Bpk. Hendra Gunawan",
    namaBalita: "Aisyah",
    nikBalita: "3204128492040006",
    jenisKelamin: "Perempuan",
    rt: "RT 04",
    usiaBulan: 19,
    tinggiBadan: 76.0,
    beratBadan: 8.7,
    zScoreTb: -1.5,
    zScoreBb: -1.4,
    statusTb: "Normal",
    statusBb: "Kurang",
    pendapatan: 2000000,
    pendidikanIbu: "SMP (Sekolah Menengah Pertama)",
    riwayatKehamilan: "Pernah KEK (Kurang Energi Kronis)",
    sumberAir: "Sumur Gali Terlindung",
    kondisiSanitasi: "MCK Komunal",
    statusRisiko: "SEDANG",
    keyakinanModel: 74,
    ambangKritis: AMBANG_KRITIS,
    prioritas: "Prioritas 2",
    faktorDominan: "Pendapatan Keluarga & BBLR",
    probabilitas: probabilitas(18, 60, 22),
    faktorDetail: [
      { label: "Pendapatan Keluarga Rendah", value: 32 },
      { label: "Riwayat BBLR", value: 26 },
      { label: "Sanitasi & Air Bersih", value: 24 },
      { label: "Pendidikan Ibu", value: 18 },
    ],
    rekomendasiDetail: rekomendasiDetail(
      "Lanjutkan konseling gizi, pemantauan berat badan, dan edukasi sanitasi keluarga bersama kader Posyandu.",
      "7 Hari Kerja",
      "Posyandu Cempaka Putih",
      "SEDANG"
    ),
    rencanaIntervensi: "Konseling gizi & edukasi sanitasi",
    dusunNama: "Dusun Cempaka",
  },
];

async function main() {
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  const dusunByName = new Map();
  for (const item of DUSUN) {
    const dusun = await prisma.dusun.upsert({
      where: { nama: item.nama },
      update: {
        namaSingkat: item.namaSingkat,
        kecamatan: item.kecamatan,
        rw: item.rw,
        posyandu: item.posyandu,
        kapasitasBalita: item.kapasitasBalita,
        zona: item.zona,
        prioritas: item.prioritas,
        polygon: item.polygon,
        pusat: item.pusat,
        labelPos: item.labelPos,
      },
      create: { ...item },
    });
    dusunByName.set(item.nama, dusun);
  }

  let kader = null;
  for (const item of USERS) {
    const dusun = item.dusunNama ? dusunByName.get(item.dusunNama) : null;
    const user = await prisma.user.upsert({
      where: { email: item.email },
      update: {
        name: item.name,
        role: item.role,
        dusunId: dusun ? dusun.id : null,
      },
      create: {
        email: item.email,
        name: item.name,
        password: passwordHash,
        role: item.role,
        dusunId: dusun ? dusun.id : null,
      },
    });
    if (item.role === "KADER") kader = user;
  }

  for (const item of SKRINING) {
    const { dusunNama, ...fields } = item;
    const dusun = dusunByName.get(dusunNama);
    if (!dusun) {
      throw new Error(`Dusun tidak ditemukan: ${dusunNama}`);
    }

    const data = {
      ...fields,
      dusunId: dusun.id,
      kaderId: kader ? kader.id : null,
    };

    const existing = await prisma.skriningStunting.findFirst({
      where: {
        kodeKeluarga: item.kodeKeluarga,
        namaBalita: item.namaBalita,
      },
    });

    if (existing) {
      await prisma.skriningStunting.update({
        where: { id: existing.id },
        data,
      });
    } else {
      await prisma.skriningStunting.create({ data });
    }
  }

  const [userCount, dusunCount, skriningCount] = await Promise.all([
    prisma.user.count(),
    prisma.dusun.count(),
    prisma.skriningStunting.count(),
  ]);

  console.log(
    `Seed selesai: User=${userCount}, Dusun=${dusunCount}, SkriningStunting=${skriningCount}`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
