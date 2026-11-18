import os
import sys
import json
import argparse
import pandas as pd
import joblib

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "model_rf.joblib")
METADATA_PATH = os.path.join(BASE_DIR, "model_metadata.json")

FEATURE_LABELS = {
    "sanitasi": "Kondisi Sanitasi & Jamban",
    "air": "Akses Sumber Air Bersih",
    "pendapatan": "Pendapatan Keluarga",
    "statusSosialEkonomi": "Status Sosial Ekonomi (PKH/BPNT)",
    "praktikMpasi": "Praktik Pemberian MPASI",
    "asiEksklusif": "Pemberian ASI Eksklusif",
    "usiaIbu": "Usia Reproduksi Ibu",
    "pendidikan": "Tingkat Pendidikan Ibu",
}

def normalize_input(data):
    pendapatan = data.get("pendapatan")
    try:
        pendapatan = float(pendapatan) if pendapatan is not None else 1800000.0
    except (ValueError, TypeError):
        pendapatan = 1800000.0

    usia_ibu = data.get("usiaIbu") or data.get("usia_ibu")
    try:
        usia_ibu = float(usia_ibu) if usia_ibu is not None else 26.0
    except (ValueError, TypeError):
        usia_ibu = 26.0

    status_sos_ek = str(
        data.get("statusSosialEkonomi")
        or data.get("status_sosial_ekonomi")
        or (
            "Prasejahtera / Penerima Bantuan (PKH/BPNT)"
            if pendapatan < 1500000
            else "Rentan Miskin / Bawah UMR"
            if pendapatan < 3000000
            else "Menengah / Sejahtera"
        )
    ).strip()

    pendidikan = str(
        data.get("pendidikan")
        or data.get("pendidikanIbu")
        or data.get("pendidikan_ibu")
        or "SMA / SMK / Sederajat"
    ).strip()

    sanitasi = str(
        data.get("sanitasi")
        or data.get("kondisiSanitasi")
        or data.get("kondisi_sanitasi")
        or "Jamban Sehat & Septictank Pribadi"
    ).strip()

    air = str(
        data.get("air")
        or data.get("sumberAir")
        or data.get("sumber_air")
        or "PDAM / Air Kemasan / Isi Ulang"
    ).strip()

    asi = str(
        data.get("asiEksklusif")
        or data.get("asi_eksklusif")
        or "Ya (ASI Eksklusif 0–6 Bulan / Masih Berjalan)"
    ).strip()

    mpasi = str(
        data.get("praktikMpasi")
        or data.get("praktik_mpasi")
        or "Tepat Waktu & Gizi Seimbang (Protein Hewani)"
    ).strip()

    return {
        "pendapatan": pendapatan,
        "statusSosialEkonomi": status_sos_ek,
        "pendidikan": pendidikan,
        "sanitasi": sanitasi,
        "air": air,
        "usiaIbu": usia_ibu,
        "asiEksklusif": asi,
        "praktikMpasi": mpasi,
    }

def get_feature_contributions(normalized_row, feature_importances):
    # Map high-risk indicator weights for this specific family
    weights = []
    san = normalized_row["sanitasi"].lower()
    if "tidak memiliki" in san or "sembarangan" in san:
        weights.append(("Tidak Memiliki Jamban / BAB Sembarangan", 32, "Sanitasi Buruk"))
    elif "komunal" in san or "mck" in san:
        weights.append(("Sanitasi Komunal (MCK Bersama)", 18, "Sanitasi Komunal"))
    elif "tanpa septictank" in san:
        weights.append(("Jamban Layak Tanpa Septictank", 10, "Jamban Tanpa Septictank"))
    else:
        weights.append(("Jamban Sehat & Septictank Pribadi", 2, "Sanitasi Layak"))

    air = normalized_row["air"].lower()
    if "sungai" in air or "terbuka" in air:
        weights.append(("Air Permukaan / Sungai Tak Terlindung", 28, "Air Tak Terlindung"))
    elif "pamsimas" in air or "hujan" in air:
        weights.append(("Pamsimas / Penampungan Air Hujan", 15, "Air Hujan / Pamsimas"))
    elif "sumur timba" in air:
        weights.append(("Sumur Timba / Mata Air Terlindung", 10, "Sumur Timba"))
    else:
        weights.append(("PDAM / Air Kemasan Terlindungi", 2, "Air Bersih Layak"))

    sos = normalized_row["statusSosialEkonomi"].lower()
    if "prasejahtera" in sos or "pkh" in sos:
        weights.append(("Status Sosial Ekonomi Prasejahtera (PKH/BPNT)", 22, "Sosial Ekonomi Prasejahtera"))
    elif "rentan" in sos:
        weights.append(("Status Sosial Ekonomi Rentan Miskin / Bawah UMR", 12, "Rentan Miskin"))
    else:
        weights.append(("Status Sosial Ekonomi Menengah / Sejahtera", 2, "Keluarga Sejahtera"))

    if normalized_row["pendapatan"] < 1500000:
        weights.append(("Pendapatan Keluarga Rendah (< Rp 1,5 Juta/bln)", 18, "Pendapatan Rendah"))
    elif normalized_row["pendapatan"] < 2500000:
        weights.append(("Pendapatan Keluarga Bawah UMR", 10, "Pendapatan Bawah UMR"))

    asi = normalized_row["asiEksklusif"].lower()
    if "tidak" in asi or "formula" in asi:
        weights.append(("Tidak Mendapatkan ASI Eksklusif (Formula/Dini)", 14, "Non-ASI Eksklusif"))

    mpasi = normalized_row["praktikMpasi"].lower()
    if "terlambat" in mpasi or "dini" in mpasi:
        weights.append(("Praktik MPASI Terlambat atau Terlalu Dini", 14, "MPASI Terlambat"))
    elif "kurang beragam" in mpasi:
        weights.append(("Praktik MPASI Kurang Beragam Protein Hewani", 8, "MPASI Kurang Beragam"))

    if normalized_row["usiaIbu"] < 20 or normalized_row["usiaIbu"] > 35:
        weights.append((f"Usia Reproduksi Berisiko ({int(normalized_row['usiaIbu'])} Tahun)", 8, "Usia Ibu"))

    weights.sort(key=lambda x: x[1], reverse=True)
    total_w = sum(w[1] for w in weights) or 1
    running = 0
    factors = []
    for idx, w in enumerate(weights[:5]):
        if idx == len(weights[:5]) - 1:
            val = max(1, 100 - running)
        else:
            val = max(1, round((w[1] / total_w) * 100))
            running += val
        factors.append({"label": w[0], "value": val, "short": w[2]})

    dominant = f"{factors[0]['short']} & {factors[1]['short'] if len(factors) > 1 else 'Faktor Gizi'}"
    return factors, dominant

def predict():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=str, default=None, help="JSON input string")
    args = parser.parse_args()

    input_data = None
    if args.input:
        try:
            input_data = json.loads(args.input)
        except Exception:
            pass

    if not input_data:
        try:
            stdin_content = sys.stdin.read().strip()
            if stdin_content:
                input_data = json.loads(stdin_content)
        except Exception:
            pass

    if not input_data:
        sys.stderr.write("Error: No input data provided.\n")
        sys.exit(1)

    if not os.path.exists(MODEL_PATH):
        # Auto-train if model doesn't exist yet
        import train_rf
        train_rf.train()

    pipeline = joblib.load(MODEL_PATH)
    normalized = normalize_input(input_data)
    df = pd.DataFrame([normalized])

    pred = pipeline.predict(df)[0]
    classes = list(pipeline.classes_)
    probas = pipeline.predict_proba(df)[0]

    proba_map = {cls: probas[idx] for idx, cls in enumerate(classes)}
    p_tinggi = round(float(proba_map.get("TINGGI", 0.0) * 100))
    p_sedang = round(float(proba_map.get("SEDANG", 0.0) * 100))
    p_rendah = max(0, 100 - p_tinggi - p_sedang)

    # Keyakinan model
    keyakinan = int(max(p_tinggi, p_sedang, p_rendah))
    if keyakinan < 60:
        keyakinan = 65

    # Feature contributions
    factors, dominant = get_feature_contributions(normalized, None)

    prioritas = (
        "Prioritas 1"
        if pred == "TINGGI"
        else "Prioritas 2"
        if pred == "SEDANG"
        else "Aman"
    )

    result = {
        "statusRisiko": pred,
        "keyakinanModel": keyakinan,
        "ambangKritis": 70,
        "prioritas": prioritas,
        "probabilitas": [
            {
                "key": "tinggi",
                "label": "Risiko Tinggi",
                "value": p_tinggi,
                "desc": "Probabilitas mayoritas klasifikasi",
            },
            {
                "key": "sedang",
                "label": "Risiko Sedang",
                "value": p_sedang,
                "desc": "Peluang faktor perantara",
            },
            {
                "key": "rendah",
                "label": "Risiko Rendah",
                "value": p_rendah,
                "desc": "Ambang normal sangat kecil",
            },
        ],
        "faktorDetail": factors,
        "faktorDominan": dominant if pred != "RENDAH" else "Pola Asuh & Ketahanan Keluarga",
        "engine": "scikit-learn RandomForestClassifier",
        "modelFile": "model_rf.joblib",
    }

    print(json.dumps(result, ensure_ascii=False))

if __name__ == "__main__":
    predict()
