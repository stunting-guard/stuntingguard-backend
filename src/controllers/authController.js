const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");

const REDIRECT_BY_ROLE = {
  KADER: "/kader/dashboard",
  APARATUR: "/aparatur/dashboard",
  ADMIN: "/admin/dashboard",
};

const DUSUN_SELECT = {
  id: true,
  nama: true,
  namaSingkat: true,
  rw: true,
  kecamatan: true,
  posyandu: true,
  zona: true,
};

function toPublicUser(user) {
  const isActive = user.isActive !== false && user.status !== "NONAKTIF";
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive,
    status: isActive ? "Aktif" : "Nonaktif",
    dusun: user.dusun
      ? {
          id: user.dusun.id,
          nama: user.dusun.nama,
          namaSingkat: user.dusun.namaSingkat,
          rw: user.dusun.rw,
          kecamatan: user.dusun.kecamatan,
          posyandu: user.dusun.posyandu,
          zona: user.dusun.zona,
        }
      : null,
  };
}

async function login(req, res) {
  const { email, password, remember } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "Email dan password wajib diisi.",
    });
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      name: true,
      email: true,
      password: true,
      role: true,
      isActive: true,
      status: true,
      dusun: { select: DUSUN_SELECT },
    },
  });

  if (!user) {
    return res.status(401).json({
      success: false,
      message: "Email atau password salah. Periksa kembali lalu coba lagi.",
    });
  }

  if (user.isActive === false || user.status === "NONAKTIF") {
    return res.status(403).json({
      success: false,
      message: "Akun Anda telah dinonaktifkan oleh Administrator. Silakan hubungi pihak admin desa.",
    });
  }

  const passwordMatches = await bcrypt.compare(password, user.password);

  if (!passwordMatches) {
    return res.status(401).json({
      success: false,
      message: "Email atau password salah. Periksa kembali lalu coba lagi.",
    });
  }

  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  const rememberMe = remember === true || remember === "true";
  const expiresIn = rememberMe ? "30d" : "1d";

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn }
  );

  return res.status(200).json({
    success: true,
    message: "Login berhasil",
    data: {
      token,
      user: toPublicUser(user),
      redirectTo: REDIRECT_BY_ROLE[user.role] || "/login",
    },
  });
}

async function getMe(req, res) {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      status: true,
      dusun: { select: DUSUN_SELECT },
    },
  });

  if (!user) {
    return res.status(401).json({
      success: false,
      message: "Sesi tidak valid: user tidak ditemukan",
    });
  }

  if (user.isActive === false || user.status === "NONAKTIF") {
    return res.status(403).json({
      success: false,
      message: "Akun Anda telah dinonaktifkan oleh Administrator. Hubungi pihak admin desa.",
    });
  }

  return res.status(200).json({
    success: true,
    message: "Profil berhasil diambil",
    data: toPublicUser(user),
  });
}

async function logout(req, res) {
  return res.status(200).json({
    success: true,
    message: "Logout berhasil",
    data: null,
  });
}

module.exports = { login, getMe, logout };
