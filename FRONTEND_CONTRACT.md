# FRONTEND_CONTRACT.md

Kontrak integrasi antara frontend **StuntingGuard Desa** (`../frontend`, React 19 + Vite) dan backend Express/Prisma ini.

Sumber: pemindaian `../frontend/src` (Auth, Kader, Aparatur). Saat ini **frontend belum punya API client** — semua halaman memakai `const MOCK_*`, `SAVED_ACCOUNTS`, dan `OPTIONS` statis; belum ada `fetch`/`axios`, belum ada `.env` `VITE_*`, dan `vite.config.js` belum punya proxy. File ini menjadi acuan wajib untuk semua task backend berikutnya.

---

## 0. Konvensi Global

| Item | Aturan |
| --- | --- |
| Base URL | `/api` (mis. `http://localhost:5000/api`) |
| Content-Type | `application/json` |
| Auth | `Authorization: Bearer <jwt>` untuk semua endpoint kecuali login |
| Role | Enum Prisma: `KADER`, `APARATUR`, `ADMIN` (uppercase) |
| Sukses | `{ "success": true, "message": "...", "data": ... }` |
| Error | `{ "success": false, "message": "..." }` (+ `errors` opsional untuk validasi) |
| Paginasi | Query `page` (1-based) & `limit`; response `data.items` + `data.meta { page, limit, total, totalPages }` |
| Tanggal | ISO 8601 di payload. Tampilan `"24 Okt 2024"` / `"09:15 WIB"` diformat di frontend (zona `Asia/Jakarta`) |
| CORS | Wajib diaktifkan untuk origin Vite (`cors` sudah ada di `package.json`); tidak ada proxy Vite |
| Binary | Khusus endpoint export (`xlsx`/`pdf`), response bukan envelope JSON |

### Catatan nilai yang tidak konsisten di frontend (ikuti kontrak ini)

- Login mock memakai role lowercase (`kader`/`aparatur`/`admin`), tetapi schema memakai uppercase. Backend mengirim `role` **uppercase** + `redirectTo`; frontend menyesuaikan.
- Hasil klasifikasi memakai key status **lowercase** (`tinggi|sedang|rendah`) karena dipakai sebagai key `STATUS_STYLE`.
- Tabel riwayat/prioritas memakai label risiko **Title Case** (`Tinggi|Sedang|Rendah`) karena `RiskBadge`.
- `zona` Dusun memakai enum `MERAH|KUNING|HIJAU`; peta frontend memakai lowercase `merah|kuning|hijau` dan pseudo-zona `aman` (padanan `HIJAU`).

---

## 1. Autentikasi

### 1.1 Login — `LoginPage.jsx`

| Method | Endpoint | Role |
| --- | --- | --- |
| POST | `/api/auth/login` | Public |

Request body (field form: `email`, `password`; `remember` hanya client-side):

```json
{ "email": "posyandu@posyandu.go.id", "password": "password123" }
```

Response 200:

```json
{
  "success": true,
  "message": "Login berhasil",
  "data": {
    "token": "<jwt>",
    "user": {
      "id": 1,
      "name": "Bidan Sri Wahyuni",
      "email": "posyandu@posyandu.go.id",
      "role": "KADER"
    },
    "redirectTo": "/kader/dashboard"
  }
}
```

Response 401:

```json
{ "success": false, "message": "Email atau password salah. Periksa kembali lalu coba lagi." }
```

`redirectTo` mengikuti role: `KADER → /kader/dashboard`, `APARATUR → /aparatur/dashboard`, `ADMIN → /admin/dashboard`.

### 1.2 Profil sesi — `DashboardLayout.jsx` (`user.name`, `user.role`)

| Method | Endpoint | Role |
| --- | --- | --- |
| GET | `/api/auth/me` | KADER, APARATUR, ADMIN |

Response 200:

```json
{
  "success": true,
  "message": "Profil berhasil diambil",
  "data": { "id": 1, "name": "Bidan Sri Wahyuni", "email": "posyandu@posyandu.go.id", "role": "KADER" }
}
```

### 1.3 Logout — `DashboardLayout.jsx` (TODO hapus token / endpoint logout)

| Method | Endpoint | Role |
| --- | --- | --- |
| POST | `/api/auth/logout` | KADER, APARATUR, ADMIN |

JWT stateless: response cukup `{ "success": true, "message": "Logout berhasil", "data": null }`; frontend tetap menghapus token lokal.

> Link `/auth/forgot-password` ada di UI tetapi halamannya belum dibuat. Tidak dipetakan.

---

## 2. Master Data (dropdown/filter)

### 2.1 Opsi formulir — `InputDataKeluarga.jsx` (`OPTIONS`)

| Method | Endpoint | Role |
| --- | --- | --- |
| GET | `/api/master/form-options` | KADER |

Response 200 (key & nilai harus sama persis dengan `OPTIONS` frontend):

```json
{
  "success": true,
  "message": "Opsi formulir berhasil diambil",
  "data": {
    "pendidikan": [
      "Tidak Sekolah",
      "SD (Sekolah Dasar / Sederajat)",
      "SMP (Sekolah Menengah Pertama)",
      "SMA (Sekolah Menengah Atas)",
      "Perguruan Tinggi"
    ],
    "kek": ["Pernah KEK (Kurang Energi Kronis)", "Tidak Pernah KEK"],
    "air": [
      "PDAM / Perpipaan",
      "Sumur Bor / Pompa",
      "Sumur Gali Terlindung",
      "Mata Air Tidak Terlindung",
      "Sungai / Air Permukaan"
    ],
    "sanitasi": [
      "Jamban Pribadi Layak",
      "MCK Komunal",
      "Jamban Tidak Layak",
      "Tidak Ada Jamban"
    ]
  }
}
```

### 2.2 Filter wilayah — `DashboardAnalitik.jsx`, `RiwayatPrediksi.jsx`

| Method | Endpoint | Role |
| --- | --- | --- |
| GET | `/api/master/wilayah` | KADER, APARATUR |

Response 200:

```json
{
  "success": true,
  "message": "Data wilayah berhasil diambil",
  "data": {
    "dusun": [
      { "id": 1, "nama": "Dusun Melati", "rw": "RW 01", "posyandu": "Posyandu Melati Indah" }
    ],
    "rw": ["RW 01", "RW 02", "RW 03", "RW 04", "RW 05"],
    "kecamatan": ["Kec. Cibadak", "Kec. Cikalong"],
    "desa": ["Desa Sukamaju", "Desa Sukamulya"],
    "periode": ["Maret 2025", "Februari 2025", "Januari 2025"]
  }
}
```

> `kecamatan`, `desa`, dan `periode` **belum ada di schema** (lihat G5/G6). Untuk sementara backend boleh mengembalikan array kosong; frontend wajib menangani opsi kosong.

---

## 3. Modul Kader Posyandu

### 3.1 Dashboard Analitik — `DashboardAnalitik.jsx`

| Method | Endpoint | Role |
| --- | --- | --- |
| GET | `/api/kader/dashboard?kecamatan=&desa=&start_date=&end_date=&page=1&limit=5` | KADER |

Query mengikuti state filter: `kecamatan`, `desa`, `start_date`, `end_date`, `page`, `limit` (`PAGE_SIZE = 5`). Tanggal memakai format `YYYY-MM-DD`; tanggal mulai dan akhir bersifat inklusif, dan tanggal akhir mencakup seluruh hari. Salah satu tanggal boleh dikosongkan. Jika keduanya kosong, semua periode ditampilkan. Filter tanggal lama `periode`, `bulan`, dan `tahun` tetap didukung untuk kompatibilitas.

Response 200 (key mengikuti `SUMMARY`, `PRIORITAS`, `FAKTOR`, `SEBARAN_RW`):

```json
{
  "success": true,
  "message": "Data dashboard berhasil diambil",
  "data": {
    "summary": { "totalKK": 1420, "tinggi": 218, "persenTinggi": 15.3 },
    "prioritas": {
      "items": [
        {
          "id": "KK-SKM-0142",
          "skriningId": 42,
          "kodeKeluarga": "KK-SKM-0142",
          "kepala": "Bpk. Slamet Riyadi",
          "balita": "Aditya Pratama",
          "usia": "18 Bulan",
          "rw": "RW 03",
          "status": "Tinggi",
          "faktor": ["Sanitasi Buruk", "Air Tak Terlindung"]
        }
      ],
      "meta": { "page": 1, "limit": 5, "total": 218, "totalPages": 44 }
    },
    "faktorDominan": [
      { "label": "Sanitasi Buruk / Tidak Layak", "value": 38.5 },
      { "label": "Air Minum Tidak Terlindungi", "value": 27.2 }
    ],
    "sebaranRw": [
      {
        "rw": "RW 01",
        "kk": 320,
        "persenTinggi": 6.8,
        "kategori": "Rendah",
        "segmen": { "tinggi": 6.8, "sedang": 22, "rendah": 71.2 }
      }
    ]
  }
}
```

Catatan:
- Frontend saat ini merender array statis `PRIORITAS`, `FAKTOR`, `SEBARAN_RW`. Integrasi: `data.prioritas.items`, `data.faktorDominan`, `data.sebaranRw`.
- `PRIORITAS_TOTAL` = `data.prioritas.meta.total`.
- Tombol **Unduh Laporan** memakai endpoint export (bagian 6).

### 3.2 Form Input Data Keluarga — `InputDataKeluarga.jsx`

| Method | Endpoint | Role |
| --- | --- | --- |
| POST | `/api/prediksi` | KADER |

Request body — key form frontend dipertahankan, ditambah field wajib schema:

```json
{
  "wilayah": "Desa Sukamaju, RW 03",
  "dusunId": 1,
  "kodeKeluarga": "KK-SKM-0142",
  "kepalaKeluarga": "Bpk. Slamet Riyadi",
  "namaBalita": "Ananda Yusuf",
  "nikBalita": "3204128492040002",
  "jenisKelamin": "Laki-laki",
  "usia": 14,
  "tinggiBadan": 80.5,
  "beratBadan": 9.8,
  "pendapatan": 1500000,
  "pendidikan": "SMA (Sekolah Menengah Atas)",
  "kek": "Tidak Pernah KEK",
  "air": "Sumur Bor / Pompa",
  "sanitasi": "Jamban Pribadi Layak"
}
```

Validasi frontend: `usia` 0–59, `pendapatan` digit saja, semua field wajib terisi.

Pemetaan ke schema (lihat §7):
`wilayah → Dusun`, `usia → usiaBulan`, `pendidikan → pendidikanIbu`, `kek → riwayatKehamilan`, `air → sumberAir`, `sanitasi → kondisiSanitasi`.

Response 201 (bentuk sama dengan halaman Hasil Klasifikasi):

```json
{
  "success": true,
  "message": "Prediksi risiko berhasil dibuat",
  "data": {
    "id": 42,
    "kodeKeluarga": "KK-SKM-0142",
    "keluarga": "Bpk. Slamet & Balita: Ananda Yusuf (24 bln) • RW 03",
    "status": "tinggi",
    "keyakinan": 92,
    "probabilitas": [
      { "key": "tinggi", "label": "Risiko Tinggi", "value": 68, "desc": "Probabilitas mayoritas klasifikasi" },
      { "key": "sedang", "label": "Risiko Sedang", "value": 24, "desc": "Peluang faktor perantara" },
      { "key": "rendah", "label": "Risiko Rendah", "value": 8, "desc": "Ambang normal sangat kecil" }
    ],
    "faktor": [
      { "label": "Sanitasi Tidak Layak", "value": 42 },
      { "label": "Sumber Air Tak Terlindungi (Sumur Terbuka)", "value": 26 }
    ],
    "rekomendasi": {
      "teks": "Segera jadwalkan rujukan perbaikan jamban sehat ke Sanitarian Puskesmas ...",
      "batas": "3 Hari Kerja",
      "penerima": "Puskesmas Melati"
    }
  }
}
```

Response 400 (validasi):

```json
{
  "success": false,
  "message": "Data tidak valid",
  "errors": { "usia": "Usia balita harus antara 0 sampai 59 bulan." }
}
```

### 3.3 Hasil Klasifikasi — `HasilKlasifikasi.jsx`

| Method | Endpoint | Role |
| --- | --- | --- |
| GET | `/api/prediksi/:id` | KADER |

Response 200: identik dengan `data` pada §3.2 (`id`, `kodeKeluarga`, `keluarga`, `status`, `keyakinan`, `probabilitas[]`, `faktor[]`, `rekomendasi {}`).

> Alur frontend saat ini memakai `location.state.input` dari form. Integrasi: setelah POST sukses, arahkan ke `/kader/hasil` dengan `state.prediksi = response.data`, atau panggil GET ini dengan `id`.

### 3.4 Riwayat Prediksi — `RiwayatPrediksi.jsx`

| Method | Endpoint | Role |
| --- | --- | --- |
| GET | `/api/riwayat?search=&rw=&risiko=&page=1&limit=6` | KADER |

Query:
- `search` — cocokkan `kepala` atau `balita`
- `rw` — nilai persis (`RW 03`); kosong/`Semua RW` = semua
- `risiko` — `Tinggi|Sedang|Rendah`; kosong/`Semua Risiko` = semua
- `page`, `limit` (`PAGE_SIZE = 6`)

Response 200 (key mengikuti objek `RIWAYAT`):

```json
{
  "success": true,
  "message": "Riwayat prediksi berhasil diambil",
  "data": {
    "items": [
      {
        "id": 1,
        "kodeKeluarga": "KK-SKM-0142",
        "tanggal": "24 Okt 2024",
        "jam": "09:15 WIB",
        "kepala": "Bpk. Slamet Riyadi",
        "balita": "Yusuf (11 bln)",
        "rw": "RW 03",
        "rt": "RT 02",
        "risiko": "Tinggi",
        "faktor": "Sanitasi & Sumber Air Minum"
      }
    ],
    "meta": { "page": 1, "limit": 6, "total": 12, "totalPages": 2 }
  }
}
```

Catatan: `tanggal`/`jam`/`balita`/`rt` adalah field tampilan turunan (lihat G1, G3, G13).

---

## 4. Modul Aparatur Desa

### 4.1 Dashboard Aparatur — `DashboardAparatur.jsx`

| Method | Endpoint | Role |
| --- | --- | --- |
| GET | `/api/aparatur/dashboard?periode=` | APARATUR |

Response 200 (key mengikuti objek `DUSUN`):

```json
{
  "success": true,
  "message": "Data dashboard aparatur berhasil diambil",
  "data": {
    "dusun": [
      {
        "id": 1,
        "nama": "Dusun Melati",
        "namaSingkat": "Melati",
        "zona": "Merah",
        "kasus": 24,
        "balita": 120,
        "prioritas": "PMT Ekstra"
      }
    ],
    "summary": { "totalBalita": 438, "totalKasus": 54, "persenKasus": 12.3, "dusunAman": 2 }
  }
}
```

- Frontend menghitung ringkasan dari `dusun[]`; `summary` disediakan agar konsisten.
- `namaSingkat` dipakai karena UI merender `Dusun {d.nama}`; jangan kirim prefix ganda.
- `zona` Title Case (`Merah|Kuning|Hijau`) sesuai `ZONA_STYLE`; konversi dari enum `MERAH|KUNING|HIJAU`.

### 4.2 Data Keluarga — `DataKeluarga.jsx`

| Method | Endpoint | Role |
| --- | --- | --- |
| GET | `/api/aparatur/data-keluarga?search=&zona=` | APARATUR |

Response 200 (key mengikuti `MOCK_DUSUN` & `MOCK_FAKTOR`):

```json
{
  "success": true,
  "message": "Ringkasan data keluarga berhasil diambil",
  "data": {
    "dusun": [
      { "id": 1, "nama": "Dusun Melati", "total": 340, "tinggi": 48, "sedang": 82, "rendah": 210 }
    ],
    "faktor": [
      {
        "id": "pendapatan",
        "judul": "Pendapatan & Ketahanan Pangan",
        "deskripsi": "Daya beli pangan hewani dan gizi seimbang terbatas",
        "persen": 38
      }
    ]
  }
}
```

`zona` menerima `Semua`, `Merah`, `Kuning`, atau `Hijau`. Zona spesifik hanya mengembalikan dusun yang memiliki skrining pada zona tersebut dan skrining yang cocok: Merah/TINGGI, Kuning/SEDANG, Hijau/RENDAH. Total/rendah/sedang/tinggi serta faktor dihitung dari skrining yang sama; faktor bernilai 0 bila tidak ada data cocok. Ringkasan kartu dihitung frontend dari `dusun[]`. Tombol **Cetak** = `window.print()` (client-side); **Unduh Laporan** = §6 dan mengirim zona aktif.

### 4.3 Peta Wilayah — `PetaWilayah.jsx`

| Method | Endpoint | Role |
| --- | --- | --- |
| GET | `/api/aparatur/peta-wilayah?zona=&dusunId=` | APARATUR |

Response 200 (key mengikuti `MOCK_DUSUN`):

```json
{
  "success": true,
  "message": "Data peta wilayah berhasil diambil",
  "data": {
    "dusun": [
      {
        "id": 1,
        "nama": "Dusun Melati",
        "zona": "merah",
        "rw": "RW 01",
        "posyandu": "Posyandu Melati Indah",
        "kapasitas": 120,
        "prevalensi": 20.0,
        "prevalensiLabel": "Prevalensi Stunting",
        "kasus": 24,
        "stat1": { "nilai": "24 Balita", "label": "Kasus Risiko Tinggi" },
        "stat2": { "nilai": "14 Rumah", "label": "Sanitasi Kurang Layak" },
        "polygon": "110,105 400,100 410,230 330,300 100,215",
        "pusat": { "x": 255, "y": 175 },
        "labelPos": { "x": 255, "y": 330 }
      }
    ]
  }
}
```

`zona` di sini lowercase; `aman` = alias frontend untuk `HIJAU`. Ikon `stat1.icon`/`stat2.icon` tetap di frontend (tidak dikirim backend). Lihat G7 untuk gap geometri.

### 4.4 Hasil Prediksi (detail) — `HasilPrediksi.jsx`

| Method | Endpoint | Role |
| --- | --- | --- |
| GET | `/api/aparatur/hasil-prediksi/:id` | APARATUR |

Response 200 (key mengikuti `MOCK_HASIL`):

```json
{
  "success": true,
  "message": "Detail hasil prediksi berhasil diambil",
  "data": {
    "id": 42,
    "status": "Tinggi",
    "judul": "Balita Terindikasi Berisiko Tinggi Stunting",
    "deskripsi": "Balita memerlukan pendampingan gizi intensif dan pemantauan berkala oleh Bidan Desa Sukamaju.",
    "prioritas": 1,
    "keyakinan": 89,
    "ambangKritis": 70,
    "balita": {
      "nama": "Muhammad Rizky",
      "nik": "3204128492040002",
      "jenisKelamin": "Laki-laki",
      "usiaBulan": 24
    },
    "tinggiBadan": { "nilai": 80.5, "zScore": -2.35, "status": "Di Bawah Standar (Pendek)" },
    "beratBadan": { "nilai": 9.8, "zScore": -1.72, "status": "Kurang" },
    "lingkungan": {
      "dusun": "Dusun Melati",
      "rtRw": "RT 02 / RW 03",
      "kepalaKeluarga": "Ahmad Fauzi",
      "jamban": "Jamban Bersama",
      "sumberAir": "Air Sumur Gali"
    },
    "intervensi": [
      {
        "id": 1,
        "judul": "Kunjungan Rutin Kader & Bidan",
        "tag": "Setiap 2 Pekan",
        "deskripsi": "Bidan Desa Sukamaju dan Kader Posyandu melakukan pengecekan ...",
        "footer": "Mulai Pelaksanaan: Pekan Pertama Bulan Ini"
      }
    ]
  }
}
```

`tone`, `footerIcon`, dan `icon` adalah styling frontend, tidak dikirim. Lihat G2/G3/G8/G9.

### 4.5 Laporan Ringkasan — `Laporan.jsx`

| Method | Endpoint | Role |
| --- | --- | --- |
| GET | `/api/aparatur/laporan?periode=` | APARATUR |

Response 200 (key mengikuti `MOCK_RINGKASAN`, `MOCK_WILAYAH`, `MOCK_BALITA_PRIORITAS`):

```json
{
  "success": true,
  "message": "Laporan ringkasan berhasil diambil",
  "data": {
    "ringkasan": {
      "totalSasaran": 438,
      "berisiko": 54,
      "paketPmt": 54,
      "targetEliminasi": 2025
    },
    "wilayah": [
      {
        "id": 1,
        "dusun": "Dusun Melati",
        "tag": "Prioritas 1",
        "kasus": 24,
        "catatan": "Prevalensi tinggi • Fokus PMT telur & susu harian",
        "tone": "merah"
      }
    ],
    "balitaPrioritas": [
      {
        "id": 1,
        "nama": "Muhammad Rizky",
        "dusun": "Dusun Melati",
        "usia": 18,
        "risiko": "Tinggi",
        "intervensi": "Paket PMT Telur & Susu 90 Hari"
      }
    ]
  }
}
```

`tone` dapat diturunkan dari `tag`/`risiko`; `aksen` murni UI.

---

## 5. Admin

### 5.1 Kelola Pengguna — `pages/admin/KelolaPengguna.jsx`

Seluruh endpoint berikut memerlukan `Authorization: Bearer <jwt>` dan role `ADMIN`.

| Method | Endpoint | Query / body |
| --- | --- | --- |
| GET | `/api/admin/users` | `search`, `role`, `status`, `page`, `limit`, `sortKey`, `sortDir` |
| POST | `/api/admin/users` | `{ name, email, password?, role, dusunId? }` |
| PUT | `/api/admin/users/:id` | `{ name?, email?, role?, dusunId? }` |
| PATCH | `/api/admin/users/:id/reset-password` | `{}` atau `{ newPassword }` |
| DELETE | `/api/admin/users/:id` | — |

`GET` merespons `data.items`, `data.meta { page, limit, total, totalPages }`, dan
`data.summary { total, aktif, nonaktif, peran }`. Role request memakai enum
`ADMIN|APARATUR|KADER`; item juga menyertakan label `peran`. `username` diturunkan
dari bagian email sebelum `@`, bukan kolom yang dapat diubah terpisah.

Schema `User` saat ini tidak mempunyai kolom status akun; respons menandai seluruh
akun sebagai `Aktif`. Filter `status=Nonaktif` karena itu menghasilkan daftar kosong,
bukan akun nonaktif yang tersimpan. Perubahan status akun memerlukan dukungan schema
dan backend yang terpisah.

`POST` dapat mengembalikan `data.temporaryPassword` ketika sandi dibuat otomatis.
`PATCH` mengembalikan sandi sementara tersebut di `data.temporaryPassword`.

---

## 6. Export Laporan (PDF/Excel)

| Method | Endpoint | Role |
| --- | --- | --- |
| GET | `/api/laporan/export?module=&format=&kecamatan=&desa=&periode=&rw=&risiko=&zona=&start_date=&end_date=` | KADER, APARATUR |

- `module`: `kader-dashboard` | `data-keluarga` | `laporan`
- `format`: `xlsx` | `pdf`
- `zona` (opsional): `Merah` | `Kuning` | `Hijau`; membatasi dusun dan skrining secara eksklusif sesuai pemetaan zona ke status risiko.
- `start_date` dan `end_date` (opsional): format `YYYY-MM-DD`; bila dikirim, ekspor dibatasi ke rentang tanggal inklusif yang sama dengan Dashboard Analitik.
- Response **binary** (`Content-Disposition: attachment; filename="..."`), bukan envelope JSON.
- Error tetap memakai envelope JSON.
- Titik pemakaian: `DashboardAnalitik.jsx` (`Unduh Laporan`), `DataKeluarga.jsx` (`Unduh Laporan`), `Laporan.jsx` (`Ekspor Excel (.xlsx)`). Tombol `Cetak` memakai `window.print()` dan tidak butuh endpoint.

> Generator file belum ada di backend; tandai sebagai task terpisah (G12).

---

## 7. Pemetaan Field Form → Schema

| Field frontend | Kolom schema | Tipe schema | Catatan |
| --- | --- | --- | --- |
| `wilayah` (free text) | `Dusun.nama` + `Dusun.rw` via `dusunId` | relation | Tidak ada kolom teks bebas; perlu pilih `dusunId` |
| `usia` | `SkriningStunting.usiaBulan` | `Int` | Validasi 0–59 |
| `pendapatan` | `pendapatan` | `Int` | Frontend mengirim string digit |
| `pendidikan` | `pendidikanIbu` | `String` | Tidak ada master/enum |
| `kek` | `riwayatKehamilan` | `String` | Tidak ada master/enum |
| `air` | `sumberAir` | `String` | Tidak ada master/enum |
| `sanitasi` | `kondisiSanitasi` | `String` | Tidak ada master/enum |
| `status` (lowercase) | `statusRisiko` | `String` | Tidak memakai enum `ZonaRisiko` |
| `keyakinan` | `keyakinanModel` | `Float` | Skala persen 0–100 |
| `faktor[]` | `faktorDominan` | `String?` | Frontend butuh array berbobot |
| `rekomendasi.teks` | `rencanaIntervensi` | `String?` | — |
| `rekomendasi.batas`, `rekomendasi.penerima` | — | — | **Tidak ada kolom** |
| `probabilitas[]` | — | — | **Tidak ada kolom** |
| `rt` | — | — | **Tidak ada kolom** |
| `dusun`, `rw`, `posyandu`, `kapasitas` | `Dusun.nama`, `.rw`, `.posyandu`, `.kapasitasBalita` | — | Nama key beda |
| `zona` | `Dusun.zona` | `ZonaRisiko` | Enum uppercase; frontend lowercase/`aman` |
| `tinggiBadan`, `beratBadan` | `tinggiBadan`, `beratBadan` | `Float?` | — |
| `tinggiBadan.zScore`, `beratBadan.zScore` | `zScoreTb`, `zScoreBb` | `Float?` | Key nested di frontend |
| `tinggiBadan.status`, `beratBadan.status` | — | — | **Tidak ada kolom** |
| `jamban` | `kondisiSanitasi` | `String` | Nama key beda |
| `jenisKelamin`, `nik`, `nama` | `jenisKelamin`, `nikBalita`, `namaBalita` | `String?` | Nama key beda |
| `kepalaKeluarga` | `kepalaKeluarga` | `String?` | — |
| `id` (dashboard) | `kodeKeluarga` | `String` | API mengirim `id` = kodeKeluarga; PK numerik sebagai `skriningId` |
| `id` (riwayat/balita) | `SkriningStunting.id` | `Int` | PK numerik |

---

## 8. Kesenjangan Schema (wajib ditandai sebelum implementasi)

Prioritas: **CRITICAL** = memblokir alur utama; **HIGH** = data tidak bisa ditampilkan; **MEDIUM** = perlu tabel/kolom pendukung.

| ID | Prioritas | Kesenjangan | Dampak / Rekomendasi |
| --- | --- | --- | --- |
| G1 | CRITICAL | `SkriningStunting.kodeKeluarga @unique` | Satu keluarga hanya boleh punya satu skrining; halaman Riwayat/Prediksi berulang tidak mungkin. Hapus `@unique` atau pindahkan ke model `Keluarga` dengan relasi 1-N |
| G2 | CRITICAL | Form hanya 7 field; schema mewajibkan `kodeKeluarga`, `dusunId`, `pendapatan`, `pendidikanIbu`, `riwayatKehamilan`, `sumberAir`, `kondisiSanitasi`, `usiaBulan`, `statusRisiko` | Form harus menambah `kodeKeluarga`, `dusunId`, dan identitas balita; atau backend membuat default + validasi |
| G3 | HIGH | Tidak ada `rt` | UI menampilkan `RW / RT`; tambah `rt` di `Dusun`/`SkriningStunting` atau simpan di `Dusun.nama` |
| G4 | HIGH | `statusRisiko` free-form `String`; tidak ada enum level risiko | Nilai tidak konsisten (`Tinggi`, `tinggi`, `MERAH`). Tambah enum `StatusRisiko = TINGGI | SEDANG | RENDAH` |
| G5 | HIGH | Tidak ada entitas/kolom `kecamatan` | Filter Dashboard Kader tidak bisa dipenuhi; tambah model `Kecamatan`/`Desa` atau kolom di `Dusun` |
| G6 | MEDIUM | Tidak ada dimensi `periode` (bulan/tahun) | Filter periode harus diturunkan dari `createdAt`; tidak ada agregat historis |
| G7 | HIGH | Tidak ada geometri peta: `polygon`, `pusat.x/y`, `labelPos`, `prevalensi`, `stat1`, `stat2`, `prioritas` | Peta Wilayah tidak bisa dirender dari DB; tambah kolom geo/agregat atau simpan statis di frontend |
| G8 | HIGH | Output ML tidak lengkap: `probabilitas[]` per kelas, `faktor[]` berbobot, `ambangKritis`, `prioritas`, `judul`, `deskripsi`, status kategori TB/BB | Hanya `keyakinanModel`, `faktorDominan` (string), `rencanaIntervensi` (string) yang ada. Perlu kolom JSON (`probabilitas Json?`, `faktorJson Json?`) atau tabel relasi |
| G9 | HIGH | `rekomendasi.batas` & `rekomendasi.penerima` tidak ada | Hanya `rencanaIntervensi`; tambah `batasWaktu`, `penerimaRujukan` |
| G10 | MEDIUM | Tidak ada master `pendidikan`, `riwayatKehamilan`, `sumberAir`, `kondisiSanitasi` | Nilai bebas rawan tidak konsisten; buat tabel master atau enum/const backend |
| G11 | MEDIUM | Tidak ada tabel agregat/faktor desa: `total`, `tinggi`, `sedang`, `rendah`, `faktor{judul,deskripsi,persen}`, `tag`, `catatan`, `intervensi`, `paketPmt`, `targetEliminasi` | Data Keluarga & Laporan harus dihitung on-the-fly; teks naratif tidak punya tempat |
| G12 | MEDIUM | Belum ada generator export `xlsx`/`pdf` | Tombol unduh belum bisa berfungsi; perlu library & endpoint |
| G13 | MEDIUM | Tidak ada `tanggal`/`jam` terformat | Gunakan `createdAt` + format `Asia/Jakarta` |
| G14 | MEDIUM | `User` tidak terhubung ke `Dusun`/posyandu | Kader tidak bisa di-scope ke wilayah; filter RW hanya dari data |
| G15 | LOW | `Dusun.nama` unik, frontend butuh `nama` & `namaSingkat` | Simpan nama lengkap; turunkan `namaSingkat` di API |
| G16 | LOW | `Dusun.kapasitasBalita` vs frontend `kapasitas`; `zona` enum vs lowercase/`aman` | Normalisasi di layer API |

---

## 9. Ringkasan Endpoint

| # | Method | Path | Role | Frontend |
| --- | --- | --- | --- | --- |
| 1 | POST | `/api/auth/login` | Public | LoginPage |
| 2 | GET | `/api/auth/me` | KADER/APARATUR/ADMIN | DashboardLayout |
| 3 | POST | `/api/auth/logout` | KADER/APARATUR/ADMIN | DashboardLayout |
| 4 | GET | `/api/master/form-options` | KADER | InputDataKeluarga |
| 5 | GET | `/api/master/wilayah` | KADER/APARATUR | DashboardAnalitik, RiwayatPrediksi, PetaWilayah |
| 6 | GET | `/api/kader/dashboard` | KADER | DashboardAnalitik |
| 7 | POST | `/api/prediksi` | KADER | InputDataKeluarga |
| 8 | GET | `/api/prediksi/:id` | KADER | HasilKlasifikasi |
| 9 | GET | `/api/riwayat` | KADER | RiwayatPrediksi |
| 10 | GET | `/api/aparatur/dashboard` | APARATUR | DashboardAparatur |
| 11 | GET | `/api/aparatur/data-keluarga` | APARATUR | DataKeluarga |
| 12 | GET | `/api/aparatur/peta-wilayah` | APARATUR | PetaWilayah |
| 13 | GET | `/api/aparatur/hasil-prediksi/:id` | APARATUR | HasilPrediksi |
| 14 | GET | `/api/aparatur/laporan` | APARATUR | Laporan |
| 15 | GET | `/api/laporan/export` | KADER/APARATUR | DashboardAnalitik, DataKeluarga, Laporan |
| 16 | GET | `/api/admin/users` | ADMIN | KelolaPengguna |
| 17 | POST | `/api/admin/users` | ADMIN | KelolaPengguna |
| 18 | PUT | `/api/admin/users/:id` | ADMIN | KelolaPengguna |
| 19 | PATCH | `/api/admin/users/:id/reset-password` | ADMIN | KelolaPengguna |
| 20 | DELETE | `/api/admin/users/:id` | ADMIN | KelolaPengguna |
