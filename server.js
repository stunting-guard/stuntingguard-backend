require("dotenv/config");

const express = require("express");
const cors = require("cors");
const prisma = require("./src/config/prisma");
const authRoutes = require("./src/routes/authRoutes");
const masterRoutes = require("./src/routes/masterRoutes");
const kaderRoutes = require("./src/routes/kaderRoutes");
const prediksiRoutes = require("./src/routes/prediksiRoutes");
const riwayatRoutes = require("./src/routes/riwayatRoutes");
const aparaturRoutes = require("./src/routes/aparaturRoutes");
const laporanRoutes = require("./src/routes/laporanRoutes");
const adminRoutes = require("./src/routes/adminRoutes");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/api/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    res.status(200).json({
      success: true,
      message: "StuntingGuard Desa API aktif dan terhubung ke database",
      data: {
        status: "UP",
        database: "CONNECTED",
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Koneksi database gagal",
      error: err.message,
    });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/master", masterRoutes);
app.use("/api/kader", kaderRoutes);
app.use("/api/prediksi", prediksiRoutes);
app.use("/api/riwayat", riwayatRoutes);
app.use("/api/aparatur", aparaturRoutes);
app.use("/api/laporan", laporanRoutes);
app.use("/api/admin", adminRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Endpoint tidak ditemukan",
  });
});

app.use((err, req, res, next) => {
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Terjadi kesalahan internal server",
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`StuntingGuard Desa API berjalan di http://localhost:${PORT}`);
  });
}

module.exports = app;
