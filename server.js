require("dotenv/config");

const express = require("express");
const cors = require("cors");
const prisma = require("./src/config/prisma");

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

// Placeholder route untuk task berikutnya:
// app.use("/api/auth", authRoutes);
// app.use("/api/master", masterRoutes);
// app.use("/api/kader", kaderRoutes);
// app.use("/api/aparatur", aparaturRoutes);
// app.use("/api/admin", adminRoutes);

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
