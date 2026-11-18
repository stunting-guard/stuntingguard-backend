const express = require("express");
const {
  getDashboardAdmin,
  getUsers,
  createUser,
  updateUser,
  updateUserStatus,
  resetPasswordUser,
  deleteUser,
  getDataset,
  importDataset,
  deleteDataset,
  getEvaluasiModel,
  retrainModel,
  getDusunList,
  createDusun,
  updateDusun,
  deleteDusun,
} = require("../controllers/adminController");
const { verifyToken, authorizeRoles } = require("../middlewares/authMiddleware");

const router = express.Router();

// Seluruh route di bawah /api/admin diproteksi hanya untuk role ADMIN
router.use(verifyToken, authorizeRoles("ADMIN"));

// 1. Dashboard Admin
router.get("/dashboard", getDashboardAdmin);

// 2. Manajemen Pengguna (Users)
router.get("/users", getUsers);
router.post("/users", createUser);
router.put("/users/:id", updateUser);
router.patch("/users/:id/status", updateUserStatus);
router.patch("/users/:id/reset-password", resetPasswordUser);
router.delete("/users/:id", deleteUser);

// 3. Manajemen Dusun & Penugasan Wilayah
router.get("/dusun", getDusunList);
router.post("/dusun", createDusun);
router.put("/dusun/:id", updateDusun);
router.delete("/dusun/:id", deleteDusun);

// 4. Kelola Dataset Skrining
router.get("/dataset", getDataset);
router.post("/dataset/import", importDataset);
router.delete("/dataset/:id", deleteDataset);

// 5. Evaluasi & Retrain Model ML
router.get("/ml/evaluasi", getEvaluasiModel);
router.post("/ml/retrain", retrainModel);

module.exports = router;
