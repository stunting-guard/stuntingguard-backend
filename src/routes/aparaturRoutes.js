const express = require("express");
const {
  getDashboardAparatur,
  getDataKeluargaAparatur,
  getPetaWilayahAparatur,
  getHasilPrediksiDetailAparatur,
  reclassifyHasilPrediksiAparatur,
  getLaporanAparatur,
  reclassifySkriningAparatur,
  batchProcessPrediksiAparatur,
} = require("../controllers/aparaturController");
const { verifyToken, authorizeRoles } = require("../middlewares/authMiddleware");

const router = express.Router();

router.get(
  "/dashboard",
  verifyToken,
  authorizeRoles("APARATUR", "ADMIN"),
  getDashboardAparatur
);

router.get(
  "/data-keluarga",
  verifyToken,
  authorizeRoles("APARATUR", "ADMIN"),
  getDataKeluargaAparatur
);

router.get(
  "/peta-wilayah",
  verifyToken,
  authorizeRoles("APARATUR", "ADMIN"),
  getPetaWilayahAparatur
);

router.get(
  "/hasil-prediksi/:id",
  verifyToken,
  authorizeRoles("APARATUR", "ADMIN"),
  getHasilPrediksiDetailAparatur
);

router.post(
  "/hasil-prediksi/:id/reclassify",
  verifyToken,
  authorizeRoles("APARATUR", "ADMIN"),
  reclassifyHasilPrediksiAparatur
);

router.get(
  "/laporan",
  verifyToken,
  authorizeRoles("APARATUR", "ADMIN"),
  getLaporanAparatur
);

router.post(
  "/klasifikasi-ulang/:id",
  verifyToken,
  authorizeRoles("APARATUR", "ADMIN"),
  reclassifySkriningAparatur
);

router.post(
  "/proses-prediksi",
  verifyToken,
  authorizeRoles("APARATUR", "ADMIN"),
  batchProcessPrediksiAparatur
);

module.exports = router;
