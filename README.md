# StuntingGuard - Backend REST API 🛡️

RESTful API backend untuk **StuntingGuard Desa** (Sistem Terpadu Penanganan Stunting & Bantuan Sosial Desa). Dibuat menggunakan Node.js dan Express.js untuk melayani modul Posyandu (Kader), Dasbor Eksekutif (Aparatur Desa), dan Konsol Pengelola Data (Admin & AI).

---

## 🛠️ Tech Stack & Library Utama
- **Runtime:** Node.js (v18+)
- **Framework:** Express.js
- **Database:** MySQL / PostgreSQL
- **Otentikasi:** JSON Web Token (JWT) & Bcrypt.js
- **ML Integration:** Axios (menghubungkan ke API Python Model Random Forest)

---

## 📁 Struktur Folder Project

```text
stuntingguard-backend/
├── config/          # Konfigurasi Database & Environment
├── controllers/     # Logika Bisnis per Role (kader, aparatur, admin)
├── middleware/      # Otentikasi (JWT) & Role Access Control (RBAC)
├── models/          # Skema & Relasi Tabel Database
├── routes/          # Router Endpoint REST API
├── services/        # Service eksternal (Koneksi ke API Python ML)
├── utils/           # Helper functions & Error Handler
├── .env.example     # Template variabel lingkungan
├── server.js        # Entry point server utama
└── README.md