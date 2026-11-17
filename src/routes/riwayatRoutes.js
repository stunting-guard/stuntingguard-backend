const express = require("express");
const { getRiwayat } = require("../controllers/prediksiController");
const { verifyToken, authorizeRoles } = require("../middlewares/authMiddleware");

const router = express.Router();

router.get("/", verifyToken, authorizeRoles("KADER", "ADMIN"), getRiwayat);

module.exports = router;
