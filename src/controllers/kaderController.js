const prisma = require("../config/prisma");

const BULAN_MAP = {
  januari: 0,
  februari: 1,
  maret: 2,
  april: 3,
  mei: 4,
  juni: 5,
  juli: 6,
  agustus: 7,
  september: 8,
  oktober: 9,
  november: 10,
  desember: 11,
};

const RISK_ORDER = {
  TINGGI: 1,
  SEDANG: 2,
  RENDAH: 3,
};

function toTitleCaseRisk(statusRisiko) {
  if (statusRisiko === "TINGGI") return "Tinggi";
  if (statusRisiko === "SEDANG") return "Sedang";
  return "Rendah";
}

function extractFaktorTags(row) {
  if (Array.isArray(row.faktorDetail) && row.faktorDetail.length > 0) {
    return row.faktorDetail
      .slice(0, 2)
      .map((item) => (typeof item === "string" ? item : item?.label))
      .filter(Boolean);
  }

  if (row.faktorDominan) {
    return String(row.faktorDominan)
      .split(/\s*(?:&|,|\+)\s*/)
      .filter(Boolean)
      .slice(0, 2);
  }

  return ["Pemantauan Rutin"];
}

function computeFaktorDominan(records) {
  if (!records.length) {
    return [
      { label: "Sanitasi Buruk / Tidak Layak", value: 0 },
      { label: "Air Minum Tidak Terlindungi", value: 0 },
      { label: "Pendapatan Keluarga Rendah", value: 0 },
      { label: "Pendidikan Ibu Rendah", value: 0 },
      { label: "Riwayat KEK Ibu", value: 0 },
    ];
  }

  const buckets = {
    "Sanitasi Buruk / Tidak Layak": 0,
    "Air Minum Tidak Terlindungi": 0,
    "Pendapatan Keluarga Rendah": 0,
    "Pendidikan Ibu Rendah": 0,
    "Riwayat KEK Ibu": 0,
  };

  for (const row of records) {
    if (Array.isArray(row.faktorDetail) && row.faktorDetail.length > 0) {
      for (const item of row.faktorDetail) {
        const label = String(item?.label || "").toLowerCase();
        const weight = Number(item?.value) || 0;
        if (label.includes("sanitasi") || label.includes("jamban")) {
          buckets["Sanitasi Buruk / Tidak Layak"] += weight;
        } else if (label.includes("air") || label.includes("sumur")) {
          buckets["Air Minum Tidak Terlindungi"] += weight;
        } else if (label.includes("pendapatan") || label.includes("ekonomi")) {
          buckets["Pendapatan Keluarga Rendah"] += weight;
        } else if (label.includes("pendidikan") || label.includes("pengasuh")) {
          buckets["Pendidikan Ibu Rendah"] += weight;
        } else if (label.includes("kek") || label.includes("bblr") || label.includes("kehamilan")) {
          buckets["Riwayat KEK Ibu"] += weight;
        }
      }
    } else {
      if (
        row.kondisiSanitasi &&
        !row.kondisiSanitasi.toLowerCase().includes("pribadi layak")
      ) {
        buckets["Sanitasi Buruk / Tidak Layak"] += 30;
      }
      if (
        row.sumberAir &&
        (row.sumberAir.toLowerCase().includes("tidak terlindung") ||
          row.sumberAir.toLowerCase().includes("sungai"))
      ) {
        buckets["Air Minum Tidak Terlindungi"] += 25;
      }
      if (Number(row.pendapatan) < 2000000) {
        buckets["Pendapatan Keluarga Rendah"] += 20;
      }
      if (
        row.pendidikanIbu &&
        (row.pendidikanIbu.toLowerCase().includes("tidak sekolah") ||
          row.pendidikanIbu.toLowerCase().includes("sd") ||
          row.pendidikanIbu.toLowerCase().includes("smp"))
      ) {
        buckets["Pendidikan Ibu Rendah"] += 15;
      }
      if (
        row.riwayatKehamilan &&
        !row.riwayatKehamilan.toLowerCase().includes("tidak pernah")
      ) {
        buckets["Riwayat KEK Ibu"] += 10;
      }
    }
  }

  const totalScore = Object.values(buckets).reduce((acc, v) => acc + v, 0);

  return Object.entries(buckets)
    .map(([label, raw]) => ({
      label,
      value:
        totalScore > 0 ? Number(((raw / totalScore) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.value - a.value);
}

function parseDateFilter({ bulan, tahun, periode }) {
  if (bulan && tahun) {
    const mName = String(bulan).trim().toLowerCase();
    const mIdx =
      BULAN_MAP[mName] !== undefined ? BULAN_MAP[mName] : Number(bulan) - 1;
    const yNum = Number(tahun);
    if (!Number.isNaN(mIdx) && mIdx >= 0 && mIdx <= 11 && !Number.isNaN(yNum)) {
      const start = new Date(Date.UTC(yNum, mIdx, 1, 0, 0, 0));
      const end = new Date(Date.UTC(yNum, mIdx + 1, 1, 0, 0, 0));
      return { start, end };
    }
  }

  if (periode && !String(periode).toLowerCase().includes("semua")) {
    const parts = String(periode).trim().split(/\s+/);
    if (parts.length === 2) {
      const mIdx = BULAN_MAP[parts[0].toLowerCase()];
      const yNum = Number(parts[1]);
      if (mIdx !== undefined && !Number.isNaN(yNum)) {
        const start = new Date(Date.UTC(yNum, mIdx, 1, 0, 0, 0));
        const end = new Date(Date.UTC(yNum, mIdx + 1, 1, 0, 0, 0));
        return { start, end };
      }
    }
  }

  return null;
}

async function getDashboard(req, res, next) {
  try {
    const {
      kecamatan = "",
      desa = "",
      dusun = "",
      periode = "",
      bulan = "",
      tahun = "",
      page = "1",
      limit = "5",
    } = req.query;

    const currentPage = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.max(1, parseInt(limit, 10) || 5);

    const dusunFilter = {};
    if (
      kecamatan &&
      !String(kecamatan).toLowerCase().includes("semua")
    ) {
      dusunFilter.kecamatan = String(kecamatan).trim();
    }

    const dusunQuery = String(dusun || desa).trim();
    if (
      dusunQuery &&
      !dusunQuery.toLowerCase().includes("semua") &&
      !dusunQuery.toLowerCase().startsWith("desa ")
    ) {
      const matchedDusun = await prisma.dusun.findFirst({
        where: {
          OR: [
            { nama: { contains: dusunQuery } },
            { namaSingkat: { contains: dusunQuery } },
            { rw: dusunQuery },
          ],
        },
      });
      if (matchedDusun) {
        dusunFilter.id = matchedDusun.id;
      }
    }

    const allDusun = await prisma.dusun.findMany({
      where: dusunFilter,
      orderBy: { id: "asc" },
    });

    const dusunIds = allDusun.map((d) => d.id);

    const baseWhere = {
      ...(Object.keys(dusunFilter).length > 0
        ? { dusunId: { in: dusunIds } }
        : {}),
    };

    const dateRange = parseDateFilter({ bulan, tahun, periode });
    let skriningRecords = [];

    if (dateRange) {
      skriningRecords = await prisma.skriningStunting.findMany({
        where: {
          ...baseWhere,
          createdAt: {
            gte: dateRange.start,
            lt: dateRange.end,
          },
        },
        include: { dusun: true },
        orderBy: { createdAt: "desc" },
      });

      // Jika filter periode default UI tidak memiliki data pada bulan tersebut,
      // fallback ke seluruh data agar dashboard tetap menampilkan metrik aktual DB
      if (skriningRecords.length === 0 && periode && !bulan && !tahun) {
        skriningRecords = await prisma.skriningStunting.findMany({
          where: baseWhere,
          include: { dusun: true },
          orderBy: { createdAt: "desc" },
        });
      }
    } else {
      skriningRecords = await prisma.skriningStunting.findMany({
        where: baseWhere,
        include: { dusun: true },
        orderBy: { createdAt: "desc" },
      });
    }

    const totalKK = skriningRecords.length;
    const tinggi = skriningRecords.filter(
      (r) => r.statusRisiko === "TINGGI"
    ).length;
    const sedang = skriningRecords.filter(
      (r) => r.statusRisiko === "SEDANG"
    ).length;
    const rendah = skriningRecords.filter(
      (r) => r.statusRisiko === "RENDAH"
    ).length;
    const persenTinggi =
      totalKK > 0 ? Number(((tinggi / totalKK) * 100).toFixed(1)) : 0;

    // Daftar prioritas: urutkan TINGGI -> SEDANG -> RENDAH, lalu terbaru
    const sortedForPrioritas = [...skriningRecords].sort((a, b) => {
      const rankDiff =
        (RISK_ORDER[a.statusRisiko] || 99) -
        (RISK_ORDER[b.statusRisiko] || 99);
      if (rankDiff !== 0) return rankDiff;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    const totalPrioritas = sortedForPrioritas.length;
    const totalPages = Math.max(1, Math.ceil(totalPrioritas / pageSize));
    const offset = (currentPage - 1) * pageSize;
    const pagedPrioritas = sortedForPrioritas
      .slice(offset, offset + pageSize)
      .map((item) => ({
        id:
          item.kodeKeluarga ||
          `KK-SKM-${String(item.id).padStart(4, "0")}`,
        skriningId: item.id,
        kodeKeluarga:
          item.kodeKeluarga ||
          `KK-SKM-${String(item.id).padStart(4, "0")}`,
        kepala: item.kepalaKeluarga || "-",
        balita: item.namaBalita || "-",
        usia: `${item.usiaBulan} Bulan`,
        rw: item.dusun ? item.dusun.rw : "-",
        dusun: item.dusun ? item.dusun.nama : "-",
        status: toTitleCaseRisk(item.statusRisiko),
        faktor: extractFaktorTags(item),
      }));

    const faktorDominan = computeFaktorDominan(skriningRecords);

    const sebaranRw = allDusun.map((d) => {
      const rows = skriningRecords.filter((r) => r.dusunId === d.id);
      const kk = rows.length;
      const countTinggi = rows.filter(
        (r) => r.statusRisiko === "TINGGI"
      ).length;
      const countSedang = rows.filter(
        (r) => r.statusRisiko === "SEDANG"
      ).length;
      const countRendah = rows.filter(
        (r) => r.statusRisiko === "RENDAH"
      ).length;

      const segTinggi =
        kk > 0 ? Number(((countTinggi / kk) * 100).toFixed(1)) : 0;
      const segSedang =
        kk > 0 ? Number(((countSedang / kk) * 100).toFixed(1)) : 0;
      const segRendah =
        kk > 0
          ? Number(
              Math.max(0, 100 - segTinggi - segSedang).toFixed(1)
            )
          : 0;

      let kategori = "Rendah";
      if (segTinggi >= 25 || (kk === 0 && d.zona === "MERAH")) {
        kategori = "Tinggi";
      } else if (segTinggi >= 10 || segSedang >= 35 || (kk === 0 && d.zona === "KUNING")) {
        kategori = "Sedang";
      }

      return {
        rw: d.rw,
        dusun: d.nama,
        kk,
        persenTinggi: segTinggi,
        kategori,
        segmen: {
          tinggi: segTinggi,
          sedang: segSedang,
          rendah: countRendah > 0 ? segRendah : 0,
        },
      };
    });

    return res.status(200).json({
      success: true,
      message: "Data dashboard berhasil diambil",
      data: {
        summary: {
          totalKK,
          tinggi,
          sedang,
          rendah,
          persenTinggi,
        },
        prioritas: {
          items: pagedPrioritas,
          meta: {
            page: currentPage,
            limit: pageSize,
            total: totalPrioritas,
            totalPages,
          },
        },
        faktorDominan,
        sebaranRw,
      },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getDashboard,
};
