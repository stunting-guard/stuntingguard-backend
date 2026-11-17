const express = require("express");
const { getDashboard } = require("../controllers/kaderController");
const {
  createPrediksi,
  getPrediksiById,
  getRiwayat,
} = require("../controllers/prediksiController");
const { verifyToken, authorizeRoles } = require("../middlewares/authMiddleware");

const router = express.Router();

router.get(
  "/dashboard",
  verifyToken,
  authorizeRoles("KADER", "ADMIN"),
  getDashboard
);

router.post(
  "/prediksi",
  verifyToken,
  authorizeRoles("KADER", "ADMIN"),
  createPrediksi
);

router.get(
  "/prediksi/:id",
  verifyToken,
  authorizeRoles("KADER", "ADMIN"),
  getPrediksiById
);

router.get(
  "/riwayat",
  verifyToken,
  authorizeRoles("KADER", "ADMIN"),
  getRiwayat
);

module.exports = router;
