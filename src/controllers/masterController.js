const prisma = require("../config/prisma");

const FORM_OPTIONS = {
  pendidikan: [
    "Tidak Sekolah",
    "SD (Sekolah Dasar / Sederajat)",
    "SMP (Sekolah Menengah Pertama)",
    "SMA (Sekolah Menengah Atas)",
    "Perguruan Tinggi",
  ],
  kek: ["Pernah KEK (Kurang Energi Kronis)", "Tidak Pernah KEK"],
  air: [
    "PDAM / Perpipaan",
    "Sumur Bor / Pompa",
    "Sumur Gali Terlindung",
    "Mata Air Tidak Terlindung",
    "Sungai / Air Permukaan",
  ],
  sanitasi: [
    "Jamban Pribadi Layak",
    "MCK Komunal",
    "Jamban Tidak Layak",
    "Tidak Ada Jamban",
  ],
  jenisKelamin: ["Laki-laki", "Perempuan"],
};

const BULAN_INDONESIA = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

function formatPeriodeLabel(date) {
  const d = new Date(date);
  const parts = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    month: "numeric",
    year: "numeric",
  }).formatToParts(d);
  const monthIdx = Number(parts.find((p) => p.type === "month")?.value || 1) - 1;
  const year = parts.find((p) => p.type === "year")?.value || d.getFullYear();
  return `${BULAN_INDONESIA[monthIdx]} ${year}`;
}

async function getFormOptions(req, res, next) {
  try {
    return res.status(200).json({
      success: true,
      message: "Opsi formulir berhasil diambil",
      data: FORM_OPTIONS,
    });
  } catch (err) {
    return next(err);
  }
}

async function getWilayah(req, res, next) {
  try {
    const [dusunList, skriningDates] = await Promise.all([
      prisma.dusun.findMany({
        orderBy: { id: "asc" },
        select: {
          id: true,
          nama: true,
          namaSingkat: true,
          rw: true,
          posyandu: true,
          kecamatan: true,
          zona: true,
        },
      }),
      prisma.skriningStunting.findMany({
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
    ]);

    const rw = [...new Set(dusunList.map((d) => d.rw).filter(Boolean))];
    const posyandu = [...new Set(dusunList.map((d) => d.posyandu).filter(Boolean))];
    const kecamatan = [...new Set(dusunList.map((d) => d.kecamatan).filter(Boolean))];
    const desa = ["Desa Sukamaju", "Desa Sukamulya"];

    const periodeSet = new Set();
    for (const row of skriningDates) {
      if (row.createdAt) {
        periodeSet.add(formatPeriodeLabel(row.createdAt));
      }
    }
    for (const fallbackPeriode of ["Maret 2025", "Februari 2025", "Januari 2025"]) {
      periodeSet.add(fallbackPeriode);
    }

    return res.status(200).json({
      success: true,
      message: "Data wilayah berhasil diambil",
      data: {
        dusun: dusunList.map((d) => ({
          id: d.id,
          nama: d.nama,
          namaSingkat: d.namaSingkat,
          rw: d.rw,
          posyandu: d.posyandu,
          kecamatan: d.kecamatan,
          zona: d.zona,
        })),
        rw,
        posyandu,
        kecamatan,
        desa,
        periode: [...periodeSet],
      },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  FORM_OPTIONS,
  getFormOptions,
  getWilayah,
};

