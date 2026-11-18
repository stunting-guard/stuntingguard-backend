import json
import random

# Reproducible random seed
random.seed(42)

STATUS_SOSIAL_EKONOMI = [
    ("Prasejahtera / Penerima Bantuan (PKH/BPNT)", 0.35),
    ("Rentan Miskin / Bawah UMR", 0.40),
    ("Menengah / Sejahtera", 0.25),
]

PENDIDIKAN = [
    ("Tidak Tamat SD", 0.08),
    ("SD / Sederajat", 0.22),
    ("SMP / Sederajat", 0.35),
    ("SMA / SMK / Sederajat", 0.28),
    ("Diploma / Sarjana (D3/S1+)", 0.07),
]

SANITASI = [
    ("Jamban Sehat & Septictank Pribadi", 0.45),
    ("Jamban Layak Tanpa Septictank", 0.20),
    ("Sanitasi Komunal / MCK Bersama", 0.18),
    ("Tidak Memiliki Jamban / BAB Sembarangan", 0.17),
]

AIR = [
    ("PDAM / Air Kemasan / Isi Ulang", 0.35),
    ("Sumur Pompa / Sumur Bor Terlindung", 0.25),
    ("Sumur Timba / Mata Air Terlindung", 0.18),
    ("Pamsimas / Penampungan Air Hujan", 0.12),
    ("Air Sungai / Sumur Terbuka Tidak Terlindung", 0.10),
]

ASI_EKSKLUSIF = [
    ("Ya (ASI Eksklusif 0–6 Bulan / Masih Berjalan)", 0.65),
    ("Tidak (Diberi Susu Formula / Makanan Dini)", 0.35),
]

PRAKTIK_MPASI = [
    ("Tepat Waktu & Gizi Seimbang (Protein Hewani)", 0.45),
    ("Tepat Waktu Namun Kurang Beragam", 0.28),
    ("Terlambat / Terlalu Dini (< 6 Bulan)", 0.20),
    ("Belum Usia MPASI (< 6 Bulan)", 0.07),
]

def pick_weighted(options):
    items, weights = zip(*options)
    return random.choices(items, weights=weights, k=1)[0]

def determine_label(row):
    score = 0
    # Sanitasi (bobot tertinggi menurut jurnal Atmadji & Nugraha 2025)
    if "Tidak Memiliki" in row["sanitasi"]:
        score += 35
    elif "Komunal" in row["sanitasi"]:
        score += 18
    elif "Tanpa Septictank" in row["sanitasi"]:
        score += 10
    else:
        score += 2

    # Air Bersih
    if "Sungai" in row["air"] or "Terbuka" in row["air"]:
        score += 30
    elif "Pamsimas" in row["air"] or "Hujan" in row["air"]:
        score += 16
    elif "Sumur Timba" in row["air"]:
        score += 12
    elif "Sumur Pompa" in row["air"]:
        score += 5
    else:
        score += 2

    # Sosial Ekonomi & Pendapatan
    if "Prasejahtera" in row["statusSosialEkonomi"]:
        score += 22
    elif "Rentan" in row["statusSosialEkonomi"]:
        score += 12
    else:
        score += 2

    if row["pendapatan"] < 1500000:
        score += 18
    elif row["pendapatan"] < 2500000:
        score += 10
    elif row["pendapatan"] < 3500000:
        score += 4

    # ASI & MPASI (Ayue et al., 2025)
    if "Tidak" in row["asiEksklusif"]:
        score += 14
    if "Terlambat" in row["praktikMpasi"]:
        score += 14
    elif "Kurang Beragam" in row["praktikMpasi"]:
        score += 8

    # Usia & Pendidikan Ibu
    if row["usiaIbu"] < 20 or row["usiaIbu"] > 35:
        score += 8
    if "Tidak Tamat" in row["pendidikan"]:
        score += 10
    elif "SD" in row["pendidikan"]:
        score += 6
    elif "SMP" in row["pendidikan"]:
        score += 3

    # Add realistic noise/variance (+- 5)
    score += random.randint(-5, 5)

    if score >= 50:
        return "TINGGI"
    elif score >= 28:
        return "SEDANG"
    else:
        return "RENDAH"

def generate_dataset(n=350):
    dataset = []
    for _ in range(n):
        sos_ek = pick_weighted(STATUS_SOSIAL_EKONOMI)
        if "Prasejahtera" in sos_ek:
            pendapatan = random.randint(750000, 1800000)
        elif "Rentan" in sos_ek:
            pendapatan = random.randint(1800000, 3200000)
        else:
            pendapatan = random.randint(3200000, 6500000)

        usia_ibu = random.randint(18, 42)
        pendidikan = pick_weighted(PENDIDIKAN)
        sanitasi = pick_weighted(SANITASI)
        air = pick_weighted(AIR)
        asi = pick_weighted(ASI_EKSKLUSIF)
        mpasi = pick_weighted(PRAKTIK_MPASI)

        row = {
            "pendapatan": pendapatan,
            "statusSosialEkonomi": sos_ek,
            "pendidikan": pendidikan,
            "sanitasi": sanitasi,
            "air": air,
            "usiaIbu": usia_ibu,
            "asiEksklusif": asi,
            "praktikMpasi": mpasi,
        }
        row["statusRisiko"] = determine_label(row)
        dataset.append(row)

    return dataset

if __name__ == "__main__":
    data = generate_dataset(360)
    with open("ml/dataset_referensi.json", "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"Generated {len(data)} reference screening rows in ml/dataset_referensi.json")
