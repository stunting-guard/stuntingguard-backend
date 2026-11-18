const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");

async function verifyToken(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (!token || scheme.toLowerCase() !== "bearer") {
    return res.status(401).json({
      success: false,
      message: "Token tidak ditemukan. Silakan login terlebih dahulu.",
    });
  }

  if (!process.env.JWT_SECRET) {
    return next(new Error("JWT_SECRET is not configured"));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Periksa status pengguna di database
    const dbUser = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        status: true,
        dusunId: true,
      },
    });

    if (!dbUser) {
      return res.status(401).json({
        success: false,
        message: "Akun pengguna tidak ditemukan atau telah dihapus.",
      });
    }

    if (dbUser.isActive === false || dbUser.status === "NONAKTIF") {
      return res.status(403).json({
        success: false,
        message: "Akun Anda telah dinonaktifkan oleh Administrator. Hubungi pihak admin desa.",
      });
    }

    req.user = dbUser;
    return next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: "Token tidak valid atau sudah kedaluwarsa",
    });
  }
}

function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Akses ditolak: user tidak terautentikasi",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Akses ditolak: role tidak memiliki izin",
      });
    }

    return next();
  };
}

module.exports = { verifyToken, authorizeRoles };
