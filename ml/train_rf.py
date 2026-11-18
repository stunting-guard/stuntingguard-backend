import os
import sys
import json
import argparse
import numpy as np
import pandas as pd
import joblib

from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.impute import SimpleImputer
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import StratifiedKFold, cross_val_predict, train_test_split
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    confusion_matrix,
    classification_report,
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
REFERENCE_PATH = os.path.join(BASE_DIR, "dataset_referensi.json")
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

CLASSES = ["RENDAH", "SEDANG", "TINGGI"]

def normalize_row(row):
    # Mapping field aliases
    pendapatan = row.get("pendapatan")
    try:
        pendapatan = float(pendapatan) if pendapatan is not None else 1800000.0
    except (ValueError, TypeError):
        pendapatan = 1800000.0

    usia_ibu = row.get("usiaIbu") or row.get("usia_ibu")
    try:
        usia_ibu = float(usia_ibu) if usia_ibu is not None else 26.0
    except (ValueError, TypeError):
        usia_ibu = 26.0

    status_sos_ek = str(
        row.get("statusSosialEkonomi")
        or row.get("status_sosial_ekonomi")
        or "Rentan Miskin / Bawah UMR"
    ).strip()

    pendidikan = str(
        row.get("pendidikan")
        or row.get("pendidikanIbu")
        or row.get("pendidikan_ibu")
        or "SMA / SMK / Sederajat"
    ).strip()

    sanitasi = str(
        row.get("sanitasi")
        or row.get("kondisiSanitasi")
        or row.get("kondisi_sanitasi")
        or "Jamban Sehat & Septictank Pribadi"
    ).strip()

    air = str(
        row.get("air")
        or row.get("sumberAir")
        or row.get("sumber_air")
        or "PDAM / Air Kemasan / Isi Ulang"
    ).strip()

    asi = str(
        row.get("asiEksklusif")
        or row.get("asi_eksklusif")
        or "Ya (ASI Eksklusif 0–6 Bulan / Masih Berjalan)"
    ).strip()

    mpasi = str(
        row.get("praktikMpasi")
        or row.get("praktik_mpasi")
        or "Tepat Waktu & Gizi Seimbang (Protein Hewani)"
    ).strip()

    raw_label = str(row.get("statusRisiko") or row.get("risiko") or "RENDAH").strip().toUpperCase() if hasattr(str, "toUpperCase") else str(row.get("statusRisiko") or row.get("risiko") or "RENDAH").strip().upper()
    if "TINGGI" in raw_label:
        label = "TINGGI"
    elif "SEDANG" in raw_label:
        label = "SEDANG"
    else:
        label = "RENDAH"

    return {
        "pendapatan": pendapatan,
        "statusSosialEkonomi": status_sos_ek,
        "pendidikan": pendidikan,
        "sanitasi": sanitasi,
        "air": air,
        "usiaIbu": usia_ibu,
        "asiEksklusif": asi,
        "praktikMpasi": mpasi,
        "statusRisiko": label,
    }

def load_data(db_data_path=None):
    all_rows = []
    # 1. Load baseline reference dataset
    if os.path.exists(REFERENCE_PATH):
        try:
            with open(REFERENCE_PATH, "r", encoding="utf-8") as f:
                ref_rows = json.load(f)
                for r in ref_rows:
                    all_rows.append(normalize_row(r))
        except Exception as e:
            sys.stderr.write(f"Warning: Failed to load reference dataset: {e}\n")

    ref_count = len(all_rows)

    # 2. Load DB records if provided
    db_count = 0
    if db_data_path and os.path.exists(db_data_path):
        try:
            with open(db_data_path, "r", encoding="utf-8") as f:
                db_rows = json.load(f)
                if isinstance(db_rows, list):
                    for r in db_rows:
                        all_rows.append(normalize_row(r))
                        db_count += 1
        except Exception as e:
            sys.stderr.write(f"Warning: Failed to load db records: {e}\n")

    return all_rows, ref_count, db_count

def train():
    parser = argparse.ArgumentParser()
    parser.add_argument("--db-data", type=str, default=None, help="Path to JSON file containing real MySQL screening records")
    args = parser.parse_args()

    rows, ref_count, db_count = load_data(args.db_data)
    if len(rows) < 30:
        sys.stderr.write("Error: Insufficient dataset to train Random Forest.\n")
        sys.exit(1)

    df = pd.DataFrame(rows)

    feature_cols = [
        "pendapatan",
        "statusSosialEkonomi",
        "pendidikan",
        "sanitasi",
        "air",
        "usiaIbu",
        "asiEksklusif",
        "praktikMpasi",
    ]
    X = df[feature_cols]
    y = df["statusRisiko"]

    numeric_features = ["pendapatan", "usiaIbu"]
    categorical_features = [
        "statusSosialEkonomi",
        "pendidikan",
        "sanitasi",
        "air",
        "asiEksklusif",
        "praktikMpasi",
    ]

    numeric_transformer = Pipeline(steps=[
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler()),
    ])

    categorical_transformer = Pipeline(steps=[
        ("imputer", SimpleImputer(strategy="most_frequent")),
        ("encoder", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
    ])

    preprocessor = ColumnTransformer(transformers=[
        ("num", numeric_transformer, numeric_features),
        ("cat", categorical_transformer, categorical_features),
    ])

    rf = RandomForestClassifier(
        n_estimators=100,
        max_depth=12,
        criterion="gini",
        random_state=42,
        class_weight="balanced",
    )

    pipeline = Pipeline(steps=[
        ("preprocessor", preprocessor),
        ("classifier", rf),
    ])

    # 5-Fold Stratified Cross-Validation for honest real performance
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    y_cv_pred = cross_val_predict(pipeline, X, y, cv=cv)

    # Compute genuine metrics
    acc = float(accuracy_score(y, y_cv_pred) * 100)
    prec = float(precision_score(y, y_cv_pred, labels=CLASSES, average="macro", zero_division=0) * 100)
    rec = float(recall_score(y, y_cv_pred, labels=CLASSES, average="macro", zero_division=0) * 100)
    f1 = float(f1_score(y, y_cv_pred, labels=CLASSES, average="macro", zero_division=0) * 100)
    cm = confusion_matrix(y, y_cv_pred, labels=CLASSES)

    # Train final pipeline on entire data
    pipeline.fit(X, y)

    # Extract Feature Importances mapped to the 8 journal features
    fitted_rf = pipeline.named_steps["classifier"]
    fitted_prep = pipeline.named_steps["preprocessor"]
    cat_feature_names = fitted_prep.named_transformers_["cat"].named_steps["encoder"].get_feature_names_out(categorical_features)
    all_feature_names = numeric_features + list(cat_feature_names)

    raw_importances = fitted_rf.feature_importances_
    grouped_importance = {f: 0.0 for f in feature_cols}

    for name, imp in zip(all_feature_names, raw_importances):
        found = False
        for orig in feature_cols:
            if name == orig or name.startswith(orig + "_"):
                grouped_importance[orig] += imp
                found = True
                break
        if not found:
            # check num / cat prefix
            for orig in feature_cols:
                if orig in name:
                    grouped_importance[orig] += imp
                    break

    total_imp = sum(grouped_importance.values()) or 1.0
    feature_importance_list = []
    for k, v in grouped_importance.items():
        feature_importance_list.append({
            "fitur": FEATURE_LABELS.get(k, k),
            "bobot": round(float((v / total_imp) * 100), 1),
            "rawKey": k,
        })
    feature_importance_list.sort(key=lambda x: x["bobot"], reverse=True)

    # Build Confusion Matrix representation
    matrix_cells = []
    total_test = int(len(y))
    tp_total = 0

    class_title_map = {"RENDAH": "Rendah", "SEDANG": "Sedang", "TINGGI": "Tinggi"}

    for i, actual_cls in enumerate(CLASSES):
        cells = []
        actual_total = int(sum(cm[i]))
        for j, pred_cls in enumerate(CLASSES):
            count = int(cm[i][j])
            is_diag = (i == j)
            if is_diag:
                tp_total += count
                pct = round((count / actual_total * 100), 1) if actual_total > 0 else 0
                lbl = f"True Positive ({pct}%)"
            else:
                lbl = f"Deviasi {class_title_map[pred_cls]}"

            cells.append({
                "n": count,
                "label": lbl,
                "diagonal": is_diag,
            })
        matrix_cells.append({
            "aktual": class_title_map[actual_cls],
            "cells": cells,
        })

    error_rate = round(float(((total_test - tp_total) / total_test) * 100), 1)

    # Per-category metrics
    per_kategori = []
    tone_map = {"RENDAH": "bg-teal-600", "SEDANG": "bg-amber-500", "TINGGI": "bg-red-500"}
    label_full_map = {
        "RENDAH": "Risiko Rendah (Normal)",
        "SEDANG": "Risiko Sedang (Stunted)",
        "TINGGI": "Risiko Tinggi (Severely Stunted)",
    }

    report = classification_report(y, y_cv_pred, labels=CLASSES, output_dict=True, zero_division=0)
    for cls in CLASSES:
        cls_data = report.get(cls, {})
        per_kategori.append({
            "label": label_full_map[cls],
            "dot": tone_map[cls],
            "sampel": int(cls_data.get("support", 0)),
            "presisi": round(float(cls_data.get("precision", 0) * 100), 1),
            "recall": round(float(cls_data.get("recall", 0) * 100), 1),
            "f1": round(float(cls_data.get("f1-score", 0) * 100), 1),
        })

    # Save trained model to disk
    joblib.dump(pipeline, MODEL_PATH)

    metadata = {
        "versiModel": "Random Forest Classifier v2.0 (scikit-learn)",
        "algoritma": "Random Forest (n_estimators=100, max_depth=12, criterion='gini', balanced)",
        "totalDataLatih": int(len(df)),
        "dataLatihRiilMySQL": db_count,
        "dataLatihReferensi": ref_count,
        "totalUji": total_test,
        "tpTotal": tp_total,
        "akurasi": round(acc, 1),
        "presisi": round(prec, 1),
        "recall": round(rec, 1),
        "f1Score": round(f1, 1),
        "errorRate": error_rate,
        "featureImportance": feature_importance_list,
        "matrix": matrix_cells,
        "perKategori": per_kategori,
        "classes": CLASSES,
        "engine": "scikit-learn RandomForestClassifier",
    }

    with open(METADATA_PATH, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)

    # Output to stdout as JSON
    print(json.dumps(metadata, ensure_ascii=False))

if __name__ == "__main__":
    train()
