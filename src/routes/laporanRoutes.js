const express = require("express");
const { exportLaporan } = require("../controllers/laporanController");
const { verifyToken, authorizeRoles } = require("../middlewares/authMiddleware");

const router = express.Router();

router.get(
  "/export",
  verifyToken,
  authorizeRoles("KADER", "APARATUR", "ADMIN"),
  exportLaporan
);

module.exports = router;
