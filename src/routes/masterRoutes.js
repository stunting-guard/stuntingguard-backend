const express = require("express");
const { getFormOptions, getWilayah } = require("../controllers/masterController");
const { verifyToken, authorizeRoles } = require("../middlewares/authMiddleware");

const router = express.Router();

router.get(
  "/form-options",
  verifyToken,
  authorizeRoles("KADER", "APARATUR", "ADMIN"),
  getFormOptions
);

router.get(
  "/wilayah",
  verifyToken,
  authorizeRoles("KADER", "APARATUR", "ADMIN"),
  getWilayah
);

module.exports = router;
