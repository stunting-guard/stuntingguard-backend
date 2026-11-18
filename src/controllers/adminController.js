const bcrypt = require("bcryptjs");
const axios = require("axios");
const prisma = require("../config/prisma");
const { trainRandomForest } = require("../services/mlService");

const ROLE_MAP = {
  kader: "KADER",
  aparatur: "APARATUR",
  admin: "ADMIN",
  KADER: "KADER",
  APARATUR: "APARATUR",
  ADMIN: "ADMIN",
  Kader: "KADER",
  Aparatur: "APARATUR",
  Admin: "ADMIN",
};

function toTitleCaseRole(role) {
  if (role === "KADER") return "Kader";
  if (role === "APARATUR") return "Aparatur";
  if (role === "ADMIN") return "Admin";
  return role || "Kader";
}

function toRoleDetail(role) {
  if (role === "KADER") return "Kader Posyandu / Bidan";
  if (role === "APARATUR") return "Aparatur Desa / Dinkes";
  if (role === "ADMIN") return "Admin / Peneliti";
  return "Pengguna Sistem";
}

function toTitleCaseRisk(statusRisiko) {
  if (statusRisiko === "TINGGI") return "Tinggi";
  if (statusRisiko === "SEDANG") return "Sedang";
  return "Rendah";
}

function generateTemporaryPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let sandi = "SG-";
  for (let i = 0; i < 8; i += 1) {
    sandi += chars[Math.floor(Math.random() * chars.length)];
  }
  return sandi;
}

function formatUserForResponse(user) {
  const peran = toTitleCaseRole(user.role);
  const wilayah = user.dusun
    ? `${user.dusun.nama} (${user.dusun.rw})`
    : user.role === "ADMIN"
    ? "Kampus / Server Machine Learning"
    : "Kantor Desa Sukamaju (Sie Kesra)";

  const username = user.email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "_");
  const isActive = user.isActive !== false && user.status !== "NONAKTIF";
  const statusLabel = isActive ? "Aktif" : "Nonaktif";

  return {
    id: user.id,
    name: user.name,
    nama: user.name,
    email: user.email,
    username,
    role: user.role,
    peran,
    peranDetail: toRoleDetail(user.role),
    wilayah,
    isActive,
    status: statusLabel,
    dusunId: user.dusunId,
    dusun: user.dusun
      ? {
          id: user.dusun.id,
          nama: user.dusun.nama,
          namaSingkat: user.dusun.namaSingkat,
          rw: user.dusun.rw,
        }
      : null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

// -----------------------------------------------------------------------------
// 1. DASHBOARD ADMIN (GET /api/admin/dashboard)
// -----------------------------------------------------------------------------
async function getDashboardAdmin(req, res, next) {
  try {
    const [
      totalDataLatih,
      totalPengguna,
      activeUsers,
      usersByRole,
      datasetByRisk,
      latestSkrining,
      latestModel,
    ] = await Promise.all([
      prisma.skriningStunting.count(),
      prisma.user.count(),
      prisma.user.count({
        where: { isActive: true, status: { not: "NONAKTIF" } },
      }),
      prisma.user.groupBy({
        by: ["role"],
        _count: { role: true },
      }),
      prisma.skriningStunting.groupBy({
        by: ["statusRisiko"],
        _count: { statusRisiko: true },
      }),
      prisma.skriningStunting.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        include: {
          dusun: { select: { nama: true, rw: true } },
          kader: { select: { name: true } },
        },
      }),
      prisma.modelEvaluation.findFirst({
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const penggunaCount = {
      total: totalPengguna,
      aktif: activeUsers,
      nonaktif: Math.max(0, totalPengguna - activeUsers),
      kader: 0,
      aparatur: 0,
      admin: 0,
    };
    usersByRole.forEach((g) => {
      if (g.role === "KADER") penggunaCount.kader = g._count.role;
      if (g.role === "APARATUR") penggunaCount.aparatur = g._count.role;
      if (g.role === "ADMIN") penggunaCount.admin = g._count.role;
    });

    const datasetCount = {
      total: totalDataLatih,
      tinggi: 0,
      sedang: 0,
      rendah: 0,
    };
    datasetByRisk.forEach((g) => {
      if (g.statusRisiko === "TINGGI") datasetCount.tinggi = g._count.statusRisiko;
      if (g.statusRisiko === "SEDANG") datasetCount.sedang = g._count.statusRisiko;
      if (g.statusRisiko === "RENDAH") datasetCount.rendah = g._count.statusRisiko;
    });

    const aktivitasTerbaru = latestSkrining.map((item) => ({
      id: item.id,
      kodeKeluarga: item.kodeKeluarga || `KK-SKM-${String(item.id).padStart(4, "0")}`,
      balita: item.namaBalita || "Balita",
      kepala: item.kepalaKeluarga || "-",
      usia: `${item.usiaBulan} Bulan`,
      dusun: item.dusun?.nama || "-",
      rw: item.dusun?.rw || "-",
      risiko: toTitleCaseRisk(item.statusRisiko),
      kader: item.kader?.name || "Bidan / Kader Desa",
      createdAt: item.createdAt,
    }));

    const akurasiTerakhir = latestModel ? latestModel.akurasi : 94.8;
    const versiModel = latestModel ? latestModel.versiModel : "Random Forest Classifier v1.2";

    return res.status(200).json({
      success: true,
      message: "Data statistik admin berhasil diambil",
      data: {
        totalDataLatih,
        akurasiTerakhir,
        penggunaTerdaftar: totalPengguna,
        penggunaAktif: activeUsers,
        versiModel,
        statusServer: "ONLINE",
        pengguna: penggunaCount,
        dataset: datasetCount,
        aktivitasTerbaru,
      },
    });
  } catch (err) {
    return next(err);
  }
}

// -----------------------------------------------------------------------------
// 2. MANAJEMEN PENGGUNA (USERS)
// -----------------------------------------------------------------------------

// GET /api/admin/users
async function getUsers(req, res, next) {
  try {
    const {
      search = "",
      role = "",
      peran = "",
      status = "",
      page = "1",
      limit = "10",
      sortKey = "id",
      sortDir = "asc",
    } = req.query;

    const currentPage = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.max(1, parseInt(limit, 10) || 10);

    const where = {};

    const roleParam = (role || peran).trim();
    if (roleParam && roleParam.toLowerCase() !== "semua") {
      const mappedRole = ROLE_MAP[roleParam] || roleParam.toUpperCase();
      if (["KADER", "APARATUR", "ADMIN"].includes(mappedRole)) {
        where.role = mappedRole;
      }
    }

    const statusParam = status.trim().toLowerCase();
    if (statusParam === "aktif") {
      where.isActive = true;
      where.status = { not: "NONAKTIF" };
    } else if (statusParam === "nonaktif") {
      where.OR = [{ isActive: false }, { status: "NONAKTIF" }];
    }

    const searchQuery = search.trim();
    if (searchQuery) {
      const searchConditions = [
        { name: { contains: searchQuery } },
        { email: { contains: searchQuery } },
      ];
      if (where.OR) {
        where.AND = [{ OR: searchConditions }, { OR: where.OR }];
        delete where.OR;
      } else {
        where.OR = searchConditions;
      }
    }

    // Sorting
    let orderBy = { id: "asc" };
    const direction = sortDir.toLowerCase() === "desc" ? "desc" : "asc";
    if (sortKey === "nama" || sortKey === "name") {
      orderBy = { name: direction };
    } else if (sortKey === "email") {
      orderBy = { email: direction };
    } else if (sortKey === "role" || sortKey === "peran") {
      orderBy = { role: direction };
    } else if (sortKey === "createdAt") {
      orderBy = { createdAt: direction };
    } else {
      orderBy = { id: direction };
    }

    const [total, users, totalUsers, activeUsers, inactiveUsers, usersByRole] =
      await Promise.all([
        prisma.user.count({ where }),
        prisma.user.findMany({
          where,
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
            status: true,
            dusunId: true,
            dusun: {
              select: {
                id: true,
                nama: true,
                namaSingkat: true,
                rw: true,
              },
            },
            createdAt: true,
            updatedAt: true,
          },
          orderBy,
          skip: (currentPage - 1) * pageSize,
          take: pageSize,
        }),
        prisma.user.count(),
        prisma.user.count({
          where: { isActive: true, status: { not: "NONAKTIF" } },
        }),
        prisma.user.count({
          where: { OR: [{ isActive: false }, { status: "NONAKTIF" }] },
        }),
        prisma.user.groupBy({
          by: ["role"],
          _count: { role: true },
        }),
      ]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const items = users.map(formatUserForResponse);
    const summary = {
      total: totalUsers,
      aktif: activeUsers,
      nonaktif: inactiveUsers,
      peran: { Kader: 0, Aparatur: 0, Admin: 0 },
    };
    usersByRole.forEach((group) => {
      summary.peran[toTitleCaseRole(group.role)] = group._count.role;
    });

    return res.status(200).json({
      success: true,
      message: "Daftar pengguna berhasil diambil",
      data: {
        summary,
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

// POST /api/admin/users
async function createUser(req, res, next) {
  try {
    const {
      name,
      nama,
      email,
      password,
      role,
      peran,
      dusunId,
      isActive,
      status,
    } = req.body || {};

    const userName = (name || nama || "").trim();
    const userEmail = (email || "").trim().toLowerCase();
    const rawRole = (role || peran || "KADER").trim();
    const userRole = ROLE_MAP[rawRole] || "KADER";

    const errors = {};
    if (!userName) errors.name = "Nama pengguna wajib diisi.";
    if (!userEmail) {
      errors.email = "Email pengguna wajib diisi.";
    } else if (!userEmail.includes("@")) {
      errors.email = "Format email tidak valid.";
    }

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        success: false,
        message: "Data pengguna tidak valid",
        errors,
      });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: userEmail },
    });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email sudah terdaftar. Gunakan email lain.",
      });
    }

    const plainPassword =
      password && String(password).trim().length >= 6
        ? String(password).trim()
        : generateTemporaryPassword();

    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    const validDusunId =
      dusunId && !Number.isNaN(Number(dusunId)) ? Number(dusunId) : null;

    const userIsActive =
      isActive !== undefined
        ? Boolean(isActive)
        : status
        ? String(status).trim().toUpperCase() !== "NONAKTIF"
        : true;
    const userStatus = userIsActive ? "AKTIF" : "NONAKTIF";

    const created = await prisma.user.create({
      data: {
        name: userName,
        email: userEmail,
        password: hashedPassword,
        role: userRole,
        isActive: userIsActive,
        status: userStatus,
        dusunId: userRole === "KADER" ? validDusunId : null,
      },
      include: {
        dusun: {
          select: {
            id: true,
            nama: true,
            namaSingkat: true,
            rw: true,
          },
        },
      },
    });

    return res.status(201).json({
      success: true,
      message: "Pengguna baru berhasil dibuat",
      data: {
        user: formatUserForResponse(created),
        temporaryPassword: plainPassword,
      },
    });
  } catch (err) {
    return next(err);
  }
}

// PUT /api/admin/users/:id
async function updateUser(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "ID pengguna tidak valid",
      });
    }

    const existingUser = await prisma.user.findUnique({
      where: { id },
    });
    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: "Pengguna tidak ditemukan",
      });
    }

    const {
      name,
      nama,
      email,
      role,
      peran,
      dusunId,
      isActive,
      status,
    } = req.body || {};

    const dataToUpdate = {};
    if (name || nama) {
      dataToUpdate.name = (name || nama).trim();
    }

    if (email) {
      const normalizedEmail = String(email).trim().toLowerCase();
      if (normalizedEmail !== existingUser.email) {
        const emailTaken = await prisma.user.findUnique({
          where: { email: normalizedEmail },
        });
        if (emailTaken) {
          return res.status(400).json({
            success: false,
            message: "Email sudah digunakan oleh akun lain.",
          });
        }
        dataToUpdate.email = normalizedEmail;
      }
    }

    if (role || peran) {
      const rawRole = (role || peran).trim();
      const mappedRole = ROLE_MAP[rawRole] || existingUser.role;
      if (["KADER", "APARATUR", "ADMIN"].includes(mappedRole)) {
        dataToUpdate.role = mappedRole;
      }
    }

    if (dusunId !== undefined) {
      dataToUpdate.dusunId =
        dusunId && !Number.isNaN(Number(dusunId)) ? Number(dusunId) : null;
    }

    if (isActive !== undefined || status !== undefined) {
      const newIsActive =
        isActive !== undefined
          ? Boolean(isActive)
          : String(status).trim().toUpperCase() !== "NONAKTIF";

      if (!newIsActive && req.user && req.user.id === id) {
        return res.status(400).json({
          success: false,
          message: "Tidak dapat menonaktifkan akun Anda sendiri yang sedang aktif.",
        });
      }

      dataToUpdate.isActive = newIsActive;
      dataToUpdate.status = newIsActive ? "AKTIF" : "NONAKTIF";
    }

    const updated = await prisma.user.update({
      where: { id },
      data: dataToUpdate,
      include: {
        dusun: {
          select: {
            id: true,
            nama: true,
            namaSingkat: true,
            rw: true,
          },
        },
      },
    });

    return res.status(200).json({
      success: true,
      message: "Data pengguna berhasil diperbarui",
      data: formatUserForResponse(updated),
    });
  } catch (err) {
    return next(err);
  }
}

// PATCH /api/admin/users/:id/status
async function updateUserStatus(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "ID pengguna tidak valid",
      });
    }

    const existingUser = await prisma.user.findUnique({
      where: { id },
    });
    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: "Pengguna tidak ditemukan",
      });
    }

    let targetIsActive;
    if (req.body?.isActive !== undefined) {
      targetIsActive = Boolean(req.body.isActive);
    } else if (req.body?.status !== undefined) {
      targetIsActive = String(req.body.status).trim().toUpperCase() !== "NONAKTIF";
    } else {
      const currentActive = existingUser.isActive && existingUser.status !== "NONAKTIF";
      targetIsActive = !currentActive;
    }

    if (!targetIsActive && req.user && req.user.id === id) {
      return res.status(400).json({
        success: false,
        message: "Tidak dapat menonaktifkan akun Anda sendiri yang sedang aktif.",
      });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        isActive: targetIsActive,
        status: targetIsActive ? "AKTIF" : "NONAKTIF",
      },
      include: {
        dusun: {
          select: {
            id: true,
            nama: true,
            namaSingkat: true,
            rw: true,
          },
        },
      },
    });

    const statusText = targetIsActive ? "diaktifkan" : "dinonaktifkan";

    return res.status(200).json({
      success: true,
      message: `Akun pengguna ${updated.name} berhasil ${statusText}`,
      data: formatUserForResponse(updated),
    });
  } catch (err) {
    return next(err);
  }
}

// PATCH /api/admin/users/:id/reset-password
async function resetPasswordUser(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "ID pengguna tidak valid",
      });
    }

    const user = await prisma.user.findUnique({
      where: { id },
    });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Pengguna tidak ditemukan",
      });
    }

    const { newPassword } = req.body || {};
    const temporaryPassword =
      newPassword && String(newPassword).trim().length >= 6
        ? String(newPassword).trim()
        : generateTemporaryPassword();

    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

    await prisma.user.update({
      where: { id },
      data: { password: hashedPassword },
    });

    return res.status(200).json({
      success: true,
      message: "Password pengguna berhasil direset",
      data: {
        userId: user.id,
        email: user.email,
        temporaryPassword,
        password: temporaryPassword,
      },
    });
  } catch (err) {
    return next(err);
  }
}

// DELETE /api/admin/users/:id
async function deleteUser(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "ID pengguna tidak valid",
      });
    }

    if (req.user && req.user.id === id) {
      return res.status(400).json({
        success: false,
        message: "Tidak dapat menghapus akun Anda sendiri yang sedang aktif.",
      });
    }

    const user = await prisma.user.findUnique({
      where: { id },
    });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Pengguna tidak ditemukan",
      });
    }

    await prisma.skriningStunting.updateMany({
      where: { kaderId: id },
      data: { kaderId: null },
    });

    await prisma.user.delete({
      where: { id },
    });

    return res.status(200).json({
      success: true,
      message: "Pengguna berhasil dihapus",
      data: null,
    });
  } catch (err) {
    return next(err);
  }
}

// -----------------------------------------------------------------------------
// 3. KELOLA DATASET SKRINING
// -----------------------------------------------------------------------------

// GET /api/admin/dataset
async function getDataset(req, res, next) {
  try {
    const {
      search = "",
      risiko = "",
      kategori = "",
      dusunId = "",
      page = "1",
      limit = "10",
      urutan = "id-asc",
      sortKey = "",
      sortDir = "asc",
    } = req.query;

    const currentPage = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.max(1, parseInt(limit, 10) || 10);

    const where = {};

    const riskParam = (risiko || kategori).trim().toUpperCase();
    if (riskParam && !riskParam.includes("SEMUA")) {
      if (["TINGGI", "SEDANG", "RENDAH"].includes(riskParam)) {
        where.statusRisiko = riskParam;
      }
    }

    if (dusunId && !Number.isNaN(Number(dusunId))) {
      where.dusunId = Number(dusunId);
    }

    const searchQuery = search.trim();
    if (searchQuery) {
      where.OR = [
        { kodeKeluarga: { contains: searchQuery } },
        { noKk: { contains: searchQuery } },
        { kepalaKeluarga: { contains: searchQuery } },
        { namaIbu: { contains: searchQuery } },
        { namaBalita: { contains: searchQuery } },
      ];

      const balitaIdMatch = searchQuery.match(/^(?:BLT-)?(\d+)$/i);
      if (balitaIdMatch) {
        where.OR.push({ id: Number(balitaIdMatch[1]) });
      }
    }

    let orderBy = { id: "asc" };
    if (urutan === "id-desc") {
      orderBy = { id: "desc" };
    } else if (urutan === "usia-asc") {
      orderBy = { usiaBulan: "asc" };
    } else if (urutan === "usia-desc") {
      orderBy = { usiaBulan: "desc" };
    } else if (sortKey) {
      const dir = sortDir.toLowerCase() === "desc" ? "desc" : "asc";
      if (sortKey === "usia") orderBy = { usiaBulan: dir };
      else if (sortKey === "berat") orderBy = { beratBadan: dir };
      else if (sortKey === "tinggi") orderBy = { tinggiBadan: dir };
      else if (sortKey === "createdAt") orderBy = { createdAt: dir };
      else orderBy = { id: dir };
    }

    const [total, records] = await Promise.all([
      prisma.skriningStunting.count({ where }),
      prisma.skriningStunting.findMany({
        where,
        include: {
          dusun: true,
          kader: { select: { id: true, name: true, email: true } },
        },
        orderBy,
        skip: (currentPage - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    const items = records.map((s) => {
      const sanitasiLayak =
        Boolean(s.kondisiSanitasi) &&
        s.kondisiSanitasi.toLowerCase().includes("layak") &&
        !s.kondisiSanitasi.toLowerCase().includes("tidak layak");

      const jk =
        s.jenisKelamin && s.jenisKelamin.toUpperCase().startsWith("P") ? "P" : "L";

      return {
        id: `BLT-${String(s.id).padStart(3, "0")}`,
        skriningId: s.id,
        kodeKeluarga: s.kodeKeluarga || `KK-SKM-${String(s.id).padStart(4, "0")}`,
        noKk: s.noKk || "-",
        kepalaKeluarga: s.kepalaKeluarga || "-",
        namaIbu: s.namaIbu || "-",
        namaBalita: s.namaBalita || "-",
        usia: s.usiaBulan,
        usiaBulan: s.usiaBulan,
        jk,
        jenisKelamin: s.jenisKelamin || (jk === "L" ? "Laki-laki" : "Perempuan"),
        berat: s.beratBadan !== null ? Number(s.beratBadan) : 0,
        tinggi: s.tinggiBadan !== null ? Number(s.tinggiBadan) : 0,
        sanitasi: s.kondisiSanitasi || "-",
        sanitasiLayak,
        air: s.sumberAir || "-",
        pendapatan: s.pendapatan || 0,
        statusSosialEkonomi: s.statusSosialEkonomi || "-",
        pendidikanIbu: s.pendidikanIbu || "-",
        usiaIbu: s.usiaIbu || null,
        asiEksklusif: s.asiEksklusif || "-",
        praktikMpasi: s.praktikMpasi || "-",
        tinggiBadanIbu: s.tinggiBadanIbu || null,
        beratLahirGram: s.beratLahirGram || null,
        risiko: toTitleCaseRisk(s.statusRisiko),
        statusRisiko: s.statusRisiko,
        dusun: s.dusun ? s.dusun.nama : "-",
        dusunId: s.dusunId,
        kader: s.kader ? s.kader.name : "Kader Posyandu",
        createdAt: s.createdAt,
      };
    });

    return res.status(200).json({
      success: true,
      message: "Data dataset balita berhasil diambil",
      data: {
        summary: {
          totalData: total,
          jumlahFitur: 8,
          statusDataset: "Siap Latih",
          pageSize,
        },
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

// POST /api/admin/dataset/import
async function importDataset(req, res, next) {
  try {
    let rows = [];
    if (Array.isArray(req.body)) {
      rows = req.body;
    } else if (Array.isArray(req.body?.rows)) {
      rows = req.body.rows;
    } else if (Array.isArray(req.body?.data)) {
      rows = req.body.data;
    } else if (typeof req.body?.csv === "string") {
      const lines = req.body.csv.trim().split(/\r?\n/);
      if (lines.length > 1) {
        const headers = lines[0].split(",").map((h) => h.trim());
        for (let i = 1; i < lines.length; i += 1) {
          const cols = lines[i].split(",").map((c) => c.trim());
          const obj = {};
          headers.forEach((h, idx) => {
            obj[h] = cols[idx];
          });
          rows.push(obj);
        }
      }
    }

    if (!rows || rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Tidak ada baris data valid untuk diimpor. Kirim array baris data.",
      });
    }

    const firstDusun = await prisma.dusun.findFirst({ orderBy: { id: "asc" } });
    if (!firstDusun) {
      return res.status(400).json({
        success: false,
        message: "Master data Dusun belum tersedia. Silakan jalankan seeder terlebih dahulu.",
      });
    }

    let insertedCount = 0;
    const errors = [];

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      try {
        const rawUsia = row.usia ?? row.usia_bulan ?? row.usiaBulan;
        const usiaBulan = Math.max(0, Math.min(59, parseInt(rawUsia, 10) || 12));

        const tb =
          row.tinggi ?? row.tinggi_badan ?? row.tinggiBadan
            ? parseFloat(row.tinggi ?? row.tinggi_badan ?? row.tinggiBadan)
            : 75.0;
        const bb =
          row.berat ?? row.berat_badan ?? row.beratBadan
            ? parseFloat(row.berat ?? row.berat_badan ?? row.beratBadan)
            : 8.5;

        const kepala =
          row.kepalaKeluarga ??
          row.nama_kepala_keluarga ??
          row.kepala ??
          `Keluarga Balita #${i + 1}`;
        const namaBalita =
          row.namaBalita ??
          row.nama_balita ??
          row.balita ??
          `Balita ${kepala.replace(/^Bpk\.\s*/i, "")}`;

        const rawJk = String(
          row.jk ?? row.jenis_kelamin ?? row.jenisKelamin ?? "L"
        ).toUpperCase();
        const jenisKelamin = rawJk.startsWith("P") ? "Perempuan" : "Laki-laki";

        const kondisiSanitasi =
          row.sanitasi ??
          row.sanitasi_jamban ??
          row.kondisiSanitasi ??
          "Jamban Pribadi Layak";
        const sumberAir =
          row.air ?? row.sumber_air ?? row.sumberAir ?? "PDAM / Perpipaan";

        let statusRisiko = "RENDAH";
        const rawRisk = String(
          row.risiko ?? row.status_risiko ?? row.statusRisiko ?? ""
        ).toUpperCase();
        if (rawRisk.includes("TINGGI")) statusRisiko = "TINGGI";
        else if (rawRisk.includes("SEDANG")) statusRisiko = "SEDANG";
        else if (rawRisk.includes("RENDAH")) statusRisiko = "RENDAH";
        else {
          if (
            kondisiSanitasi.toLowerCase().includes("tidak") ||
            sumberAir.toLowerCase().includes("sungai")
          ) {
            statusRisiko = "TINGGI";
          }
        }

        const kodeKeluarga =
          row.kodeKeluarga ??
          row.id_balita ??
          row.id ??
          `KK-IMP-${Date.now().toString().slice(-4)}${i + 1}`;

        await prisma.skriningStunting.create({
          data: {
            kodeKeluarga,
            kepalaKeluarga: kepala,
            namaBalita,
            jenisKelamin,
            usiaBulan,
            tinggiBadan: tb,
            beratBadan: bb,
            zScoreTb: statusRisiko === "TINGGI" ? -2.4 : statusRisiko === "SEDANG" ? -1.3 : 0.1,
            zScoreBb: statusRisiko === "TINGGI" ? -1.8 : statusRisiko === "SEDANG" ? -1.0 : 0.2,
            statusTb: statusRisiko === "TINGGI" ? "Di Bawah Standar (Pendek)" : "Normal",
            statusBb: statusRisiko === "TINGGI" ? "Kurang" : "Normal",
            pendapatan: row.pendapatan ? parseInt(row.pendapatan, 10) : 1800000,
            statusSosialEkonomi: row.statusSosialEkonomi || "Rentan Miskin / Bawah UMR",
            pendidikanIbu: row.pendidikanIbu || row.pendidikan || "SMA (Sekolah Menengah Atas)",
            usiaIbu: row.usiaIbu ? parseInt(row.usiaIbu, 10) : null,
            riwayatKehamilan: row.riwayatKehamilan || row.kek || "Tidak Pernah KEK",
            sumberAir,
            kondisiSanitasi,
            asiEksklusif: row.asiEksklusif || "Ya (ASI Eksklusif 0–6 Bulan / Masih Berjalan)",
            praktikMpasi: row.praktikMpasi || "Tepat Waktu & Gizi Seimbang (Protein Hewani)",
            noKk: row.noKk || null,
            namaIbu: row.namaIbu || null,
            tinggiBadanIbu: row.tinggiBadanIbu ? parseFloat(row.tinggiBadanIbu) : null,
            beratLahirGram: row.beratLahirGram ? parseInt(row.beratLahirGram, 10) : null,
            statusRisiko,
            keyakinanModel: 91.5,
            ambangKritis: 70,
            prioritas: statusRisiko === "TINGGI" ? "Prioritas 1" : "Aman",
            faktorDominan: "Sanitasi & Sumber Air",
            dusunId: firstDusun.id,
            kaderId: req.user?.id || null,
          },
        });

        insertedCount += 1;
      } catch (err) {
        errors.push({ row: i + 1, message: err.message });
      }
    }

    const totalData = await prisma.skriningStunting.count();

    return res.status(201).json({
      success: true,
      message: `Berhasil mengimpor ${insertedCount} data skrining balita ke dataset.`,
      data: {
        importedCount: insertedCount,
        failedCount: errors.length,
        totalData,
        errors: errors.slice(0, 5),
      },
    });
  } catch (err) {
    return next(err);
  }
}

// DELETE /api/admin/dataset/:id
async function deleteDataset(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "ID record dataset tidak valid",
      });
    }

    const record = await prisma.skriningStunting.findUnique({
      where: { id },
    });
    if (!record) {
      return res.status(404).json({
        success: false,
        message: "Data skrining balita tidak ditemukan",
      });
    }

    await prisma.skriningStunting.delete({
      where: { id },
    });

    return res.status(200).json({
      success: true,
      message: "Data skrining balita berhasil dihapus dari dataset",
      data: null,
    });
  } catch (err) {
    return next(err);
  }
}

// -----------------------------------------------------------------------------
// 4. MANAJEMEN DUSUN (CRUD & PENUGASAN WILAYAH)
// -----------------------------------------------------------------------------

// GET /api/admin/dusun
async function getDusunList(req, res, next) {
  try {
    const dusunList = await prisma.dusun.findMany({
      orderBy: { id: "asc" },
      include: {
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
            status: true,
          },
        },
        _count: {
          select: { skrining: true },
        },
      },
    });

    const items = dusunList.map((d) => ({
      id: d.id,
      nama: d.nama,
      namaSingkat: d.namaSingkat || d.nama.replace(/^Dusun\s*/i, ""),
      rw: d.rw,
      posyandu: d.posyandu || "-",
      kecamatan: d.kecamatan || "Kecamatan Sukamaju",
      kapasitasBalita: d.kapasitasBalita,
      zona: d.zona,
      totalBalitaTerdaftar: d._count.skrining,
      jumlahSkrining: d._count.skrining,
      kaderTerdaftar: d.users.map((u) => ({
        id: u.id,
        nama: u.name,
        name: u.name,
        email: u.email,
        role: u.role,
        isActive: u.isActive !== false && u.status !== "NONAKTIF",
        status: u.isActive !== false && u.status !== "NONAKTIF" ? "Aktif" : "Nonaktif",
      })),
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    }));

    return res.status(200).json({
      success: true,
      message: "Daftar dusun dan penugasan kader berhasil diambil",
      data: items,
    });
  } catch (err) {
    return next(err);
  }
}

// POST /api/admin/dusun
async function createDusun(req, res, next) {
  try {
    const {
      nama,
      namaSingkat,
      rw,
      posyandu,
      kecamatan,
      kapasitasBalita,
      zona,
      kaderIds,
      assignedUserIds,
    } = req.body || {};

    const dusunNama = (nama || "").trim();
    const dusunRw = (rw || "").trim();

    const errors = {};
    if (!dusunNama) errors.nama = "Nama dusun wajib diisi.";
    if (!dusunRw) errors.rw = "Nomor RW wajib diisi (contoh: RW 01).";

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        success: false,
        message: "Data dusun tidak valid",
        errors,
      });
    }

    const existing = await prisma.dusun.findUnique({
      where: { nama: dusunNama },
    });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Dusun dengan nama "${dusunNama}" sudah terdaftar.`,
      });
    }

    const validZona = ["MERAH", "KUNING", "HIJAU"].includes(
      String(zona || "").toUpperCase()
    )
      ? String(zona).toUpperCase()
      : "HIJAU";

    const singkat =
      namaSingkat && String(namaSingkat).trim()
        ? String(namaSingkat).trim()
        : dusunNama.replace(/^Dusun\s*/i, "");

    const kapasitas =
      kapasitasBalita && !Number.isNaN(Number(kapasitasBalita))
        ? parseInt(kapasitasBalita, 10)
        : 100;

    const createdDusun = await prisma.dusun.create({
      data: {
        nama: dusunNama,
        namaSingkat: singkat,
        rw: dusunRw,
        posyandu: posyandu ? String(posyandu).trim() : `Posyandu ${singkat}`,
        kecamatan: kecamatan ? String(kecamatan).trim() : "Kecamatan Sukamaju",
        kapasitasBalita: kapasitas,
        zona: validZona,
      },
    });

    const userIdsToAssign = Array.isArray(assignedUserIds)
      ? assignedUserIds
      : Array.isArray(kaderIds)
      ? kaderIds
      : [];

    if (userIdsToAssign.length > 0) {
      const numericIds = userIdsToAssign
        .map((id) => Number(id))
        .filter((id) => !Number.isNaN(id));

      if (numericIds.length > 0) {
        await prisma.user.updateMany({
          where: { id: { in: numericIds } },
          data: { dusunId: createdDusun.id },
        });
      }
    }

    const result = await prisma.dusun.findUnique({
      where: { id: createdDusun.id },
      include: {
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
            status: true,
          },
        },
        _count: { select: { skrining: true } },
      },
    });

    return res.status(201).json({
      success: true,
      message: `Dusun ${createdDusun.nama} berhasil ditambahkan`,
      data: {
        id: result.id,
        nama: result.nama,
        namaSingkat: result.namaSingkat,
        rw: result.rw,
        posyandu: result.posyandu,
        kecamatan: result.kecamatan,
        kapasitasBalita: result.kapasitasBalita,
        zona: result.zona,
        jumlahSkrining: result._count.skrining,
        kaderTerdaftar: result.users.map((u) => ({
          id: u.id,
          nama: u.name,
          email: u.email,
          role: u.role,
          isActive: u.isActive !== false && u.status !== "NONAKTIF",
        })),
      },
    });
  } catch (err) {
    return next(err);
  }
}

// PUT /api/admin/dusun/:id
async function updateDusun(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "ID dusun tidak valid",
      });
    }

    const existingDusun = await prisma.dusun.findUnique({
      where: { id },
    });
    if (!existingDusun) {
      return res.status(404).json({
        success: false,
        message: "Dusun tidak ditemukan",
      });
    }

    const {
      nama,
      namaSingkat,
      rw,
      posyandu,
      kecamatan,
      kapasitasBalita,
      zona,
      kaderIds,
      assignedUserIds,
    } = req.body || {};

    const dataToUpdate = {};
    if (nama && String(nama).trim()) {
      const trimmedNama = String(nama).trim();
      if (trimmedNama !== existingDusun.nama) {
        const taken = await prisma.dusun.findUnique({
          where: { nama: trimmedNama },
        });
        if (taken) {
          return res.status(400).json({
            success: false,
            message: `Nama dusun "${trimmedNama}" sudah digunakan.`,
          });
        }
        dataToUpdate.nama = trimmedNama;
      }
    }

    if (namaSingkat !== undefined) {
      dataToUpdate.namaSingkat = String(namaSingkat).trim();
    }
    if (rw !== undefined && String(rw).trim()) {
      dataToUpdate.rw = String(rw).trim();
    }
    if (posyandu !== undefined) {
      dataToUpdate.posyandu = String(posyandu).trim();
    }
    if (kecamatan !== undefined) {
      dataToUpdate.kecamatan = String(kecamatan).trim();
    }
    if (kapasitasBalita !== undefined && !Number.isNaN(Number(kapasitasBalita))) {
      dataToUpdate.kapasitasBalita = parseInt(kapasitasBalita, 10);
    }
    if (zona !== undefined) {
      const zUpper = String(zona).trim().toUpperCase();
      if (["MERAH", "KUNING", "HIJAU"].includes(zUpper)) {
        dataToUpdate.zona = zUpper;
      }
    }

    await prisma.dusun.update({
      where: { id },
      data: dataToUpdate,
    });

    const userIds = Array.isArray(assignedUserIds)
      ? assignedUserIds
      : Array.isArray(kaderIds)
      ? kaderIds
      : null;

    if (userIds !== null) {
      const numericIds = userIds
        .map((uid) => Number(uid))
        .filter((uid) => !Number.isNaN(uid));

      await prisma.user.updateMany({
        where: {
          dusunId: id,
          id: { notIn: numericIds },
        },
        data: { dusunId: null },
      });

      if (numericIds.length > 0) {
        await prisma.user.updateMany({
          where: { id: { in: numericIds } },
          data: { dusunId: id },
        });
      }
    }

    const updated = await prisma.dusun.findUnique({
      where: { id },
      include: {
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
            status: true,
          },
        },
        _count: { select: { skrining: true } },
      },
    });

    return res.status(200).json({
      success: true,
      message: `Data dusun ${updated.nama} berhasil diperbarui`,
      data: {
        id: updated.id,
        nama: updated.nama,
        namaSingkat: updated.namaSingkat,
        rw: updated.rw,
        posyandu: updated.posyandu,
        kecamatan: updated.kecamatan,
        kapasitasBalita: updated.kapasitasBalita,
        zona: updated.zona,
        jumlahSkrining: updated._count.skrining,
        kaderTerdaftar: updated.users.map((u) => ({
          id: u.id,
          nama: u.name,
          email: u.email,
          role: u.role,
          isActive: u.isActive !== false && u.status !== "NONAKTIF",
        })),
      },
    });
  } catch (err) {
    return next(err);
  }
}

// DELETE /api/admin/dusun/:id
async function deleteDusun(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "ID dusun tidak valid",
      });
    }

    const dusun = await prisma.dusun.findUnique({
      where: { id },
      include: {
        _count: { select: { skrining: true } },
      },
    });

    if (!dusun) {
      return res.status(404).json({
        success: false,
        message: "Dusun tidak ditemukan",
      });
    }

    if (dusun._count.skrining > 0) {
      return res.status(400).json({
        success: false,
        message: `Tidak dapat menghapus dusun ${dusun.nama} karena masih terdapat ${dusun._count.skrining} data skrining balita yang terhubung.`,
      });
    }

    await prisma.user.updateMany({
      where: { dusunId: id },
      data: { dusunId: null },
    });

    await prisma.dusun.delete({
      where: { id },
    });

    return res.status(200).json({
      success: true,
      message: `Dusun ${dusun.nama} berhasil dihapus`,
      data: null,
    });
  } catch (err) {
    return next(err);
  }
}

// -----------------------------------------------------------------------------
// 5. EVALUASI & RETRAIN MODEL ML
// -----------------------------------------------------------------------------

// GET /api/admin/ml/evaluasi
async function getEvaluasiModel(req, res, next) {
  try {
    const totalDataLatihRiil = await prisma.skriningStunting.count();

    let latestEval = await prisma.modelEvaluation.findFirst({
      orderBy: { createdAt: "desc" },
    });

    if (!latestEval) {
      const skriningList = await prisma.skriningStunting.findMany({
        select: {
          id: true,
          statusRisiko: true,
          kondisiSanitasi: true,
          sumberAir: true,
          pendapatan: true,
          statusSosialEkonomi: true,
          praktikMpasi: true,
          asiEksklusif: true,
          usiaIbu: true,
          pendidikanIbu: true,
        },
      });

      const trainResult = await trainRandomForest(skriningList);

      const metrics = [
        {
          key: "akurasi",
          label: "Akurasi (Accuracy)",
          value: `${trainResult.akurasi.toFixed(1).replace(".", ",")}%`,
          suffix: "scikit-learn RF",
          note: "Performa Klasifikasi Model Terlatih",
          icon: "Settings",
          tone: "bg-slate-100 text-slate-600",
        },
        {
          key: "presisi",
          label: "Presisi (Precision)",
          value: `${trainResult.presisi.toFixed(1).replace(".", ",")}%`,
          suffix: "Macro Avg",
          note: "Presisi Rata-Rata Multi-Kelas",
          icon: "Target",
          tone: "bg-sky-50 text-sky-700",
        },
        {
          key: "recall",
          label: "Recall (Sensitivitas)",
          value: `${trainResult.recall.toFixed(1).replace(".", ",")}%`,
          suffix: "Macro Avg",
          note: "Sensitivitas Deteksi Kasus Balita Stunting",
          icon: "ShieldCheck",
          tone: "bg-teal-50 text-teal-700",
        },
        {
          key: "f1",
          label: "F1-Score",
          value: `${trainResult.f1Score.toFixed(1).replace(".", ",")}%`,
          suffix: "Harmonic Mean",
          note: "Keseimbangan Model Klasifikasi Optimal",
          icon: "SlidersHorizontal",
          tone: "bg-indigo-50 text-indigo-600",
        },
      ];

      latestEval = await prisma.modelEvaluation.create({
        data: {
          versiModel: trainResult.versiModel,
          algoritma: trainResult.algoritma,
          totalDataLatih: trainResult.totalDataLatih,
          totalUji: trainResult.totalUji,
          tpTotal: trainResult.tpTotal,
          akurasi: trainResult.akurasi,
          presisi: trainResult.presisi,
          recall: trainResult.recall,
          f1Score: trainResult.f1Score,
          errorRate: trainResult.errorRate,
          metrics,
          confusionMatrix: trainResult.matrix,
          perKategori: trainResult.perKategori,
          featureImportance: trainResult.featureImportance,
          waktuTraining: new Date(),
          status: "COMPLETED",
          catatan: `Model evaluasi inisial scikit-learn. Total: ${trainResult.totalDataLatih} data.`,
        },
      });
    }

    const kelas = ["Rendah", "Sedang", "Tinggi"];

    return res.status(200).json({
      success: true,
      message: "Hasil evaluasi model Random Forest berhasil diambil",
      data: {
        versiModel: latestEval.versiModel,
        algoritma: latestEval.algoritma,
        totalDataLatih: latestEval.totalDataLatih,
        totalDataLatihRiil,
        totalUji: latestEval.totalUji,
        tpTotal: latestEval.tpTotal,
        errorRate: latestEval.errorRate,
        akurasi: latestEval.akurasi,
        presisi: latestEval.presisi,
        recall: latestEval.recall,
        f1Score: latestEval.f1Score,
        metrics: latestEval.metrics,
        kelas,
        matrix: latestEval.confusionMatrix,
        perKategori: latestEval.perKategori,
        featureImportance: latestEval.featureImportance,
        lastTrained: latestEval.waktuTraining || latestEval.createdAt,
      },
    });
  } catch (err) {
    return next(err);
  }
}

// POST /api/admin/ml/retrain
async function retrainModel(req, res, next) {
  try {
    // 1. Ambil seluruh data riil skrining dari database MySQL
    const [totalDataLatihRiil, skriningList] = await Promise.all([
      prisma.skriningStunting.count(),
      prisma.skriningStunting.findMany({
        select: {
          id: true,
          statusRisiko: true,
          kondisiSanitasi: true,
          sumberAir: true,
          pendapatan: true,
          statusSosialEkonomi: true,
          praktikMpasi: true,
          asiEksklusif: true,
          usiaIbu: true,
          pendidikanIbu: true,
        },
      }),
    ]);

    // 2. Jalankan pelatihan ulang Random Forest asli dengan scikit-learn
    const trainResult = await trainRandomForest(skriningList);

    const metrics = [
      {
        key: "akurasi",
        label: "Akurasi (Accuracy)",
        value: `${trainResult.akurasi.toFixed(1).replace(".", ",")}%`,
        suffix: "scikit-learn RF",
        note: "Performa Klasifikasi Model Terlatih",
        icon: "Settings",
        tone: "bg-slate-100 text-slate-600",
      },
      {
        key: "presisi",
        label: "Presisi (Precision)",
        value: `${trainResult.presisi.toFixed(1).replace(".", ",")}%`,
        suffix: "Macro Avg",
        note: "Presisi Rata-Rata Multi-Kelas",
        icon: "Target",
        tone: "bg-sky-50 text-sky-700",
      },
      {
        key: "recall",
        label: "Recall (Sensitivitas)",
        value: `${trainResult.recall.toFixed(1).replace(".", ",")}%`,
        suffix: "Macro Avg",
        note: "Sensitivitas Deteksi Kasus Balita Stunting",
        icon: "ShieldCheck",
        tone: "bg-teal-50 text-teal-700",
      },
      {
        key: "f1",
        label: "F1-Score",
        value: `${trainResult.f1Score.toFixed(1).replace(".", ",")}%`,
        suffix: "Harmonic Mean",
        note: "Keseimbangan Model Klasifikasi Optimal",
        icon: "SlidersHorizontal",
        tone: "bg-indigo-50 text-indigo-600",
      },
    ];

    const waktuTraining = new Date();
    const savedEval = await prisma.modelEvaluation.create({
      data: {
        versiModel: trainResult.versiModel,
        algoritma: trainResult.algoritma,
        totalDataLatih: trainResult.totalDataLatih,
        totalUji: trainResult.totalUji,
        tpTotal: trainResult.tpTotal,
        akurasi: trainResult.akurasi,
        presisi: trainResult.presisi,
        recall: trainResult.recall,
        f1Score: trainResult.f1Score,
        errorRate: trainResult.errorRate,
        metrics,
        confusionMatrix: trainResult.matrix,
        perKategori: trainResult.perKategori,
        featureImportance: trainResult.featureImportance,
        waktuTraining,
        status: "COMPLETED",
        catatan: `Pelatihan ulang sukses menggunakan scikit-learn RandomForestClassifier. Total data latih: ${trainResult.totalDataLatih} (${trainResult.dataLatihRiilMySQL} data riil MySQL + ${trainResult.dataLatihReferensi} data referensi desa).`,
      },
    });

    return res.status(200).json({
      success: true,
      message: `Model Random Forest berhasil dilatih ulang menggunakan scikit-learn (Akurasi Uji: ${trainResult.akurasi}%)`,
      data: {
        id: savedEval.id,
        versiModel: savedEval.versiModel,
        akurasi: savedEval.akurasi,
        akurasiBaru: savedEval.akurasi,
        presisi: savedEval.presisi,
        recall: savedEval.recall,
        f1Score: savedEval.f1Score,
        totalDataLatih: savedEval.totalDataLatih,
        dataLatihRiil: trainResult.dataLatihRiilMySQL,
        dataLatihReferensi: trainResult.dataLatihReferensi,
        retrainedAt: savedEval.waktuTraining,
        waktuTraining: savedEval.waktuTraining,
        engine: "scikit-learn RandomForestClassifier",
        featureImportance: trainResult.featureImportance,
        matrix: trainResult.matrix,
        perKategori: trainResult.perKategori,
      },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getDashboardAdmin,
  getUsers,
  createUser,
  updateUser,
  updateUserStatus,
  resetPasswordUser,
  deleteUser,
  getDataset,
  importDataset,
  deleteDataset,
  getEvaluasiModel,
  retrainModel,
  getDusunList,
  createDusun,
  updateDusun,
  deleteDusun,
};
