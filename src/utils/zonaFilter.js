const RISIKO_BY_ZONA = {
  MERAH: "TINGGI",
  KUNING: "SEDANG",
  HIJAU: "RENDAH",
};

function parseZonaFilter(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.toLowerCase() === "semua") {
    return { zona: null, statusRisiko: null, error: null };
  }

  const zona = raw.toUpperCase();
  if (!Object.prototype.hasOwnProperty.call(RISIKO_BY_ZONA, zona)) {
    return {
      zona: null,
      statusRisiko: null,
      error: "Zona tidak valid. Pilih Merah, Kuning, Hijau, atau Semua.",
    };
  }

  return { zona, statusRisiko: RISIKO_BY_ZONA[zona], error: null };
}

module.exports = { parseZonaFilter };
