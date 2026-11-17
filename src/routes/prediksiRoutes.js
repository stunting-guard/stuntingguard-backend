const express = require("express");
const {
  createPrediksi,
  getPrediksiById,
} = require("../controllers/prediksiController");
const { verifyToken, authorizeRoles } = require("../middlewares/authMiddleware");

const router = express.Router();

router.post("/", verifyToken, authorizeRoles("KADER", "ADMIN"), createPrediksi);
router.get(
  "/:id",
  verifyToken,
  authorizeRoles("KADER", "ADMIN"),
  getPrediksiById
);

module.exports = router;

