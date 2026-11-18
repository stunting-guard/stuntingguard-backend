function parseDateOnly(value, label) {
  if (value === undefined || value === null || value === "") {
    return { date: null, error: null };
  }

  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { date: null, error: `${label} harus menggunakan format YYYY-MM-DD.` };
  }

  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) {
    return { date: null, error: `${label} tidak valid.` };
  }

  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return { date: null, error: `${label} tidak valid.` };
  }

  return { date, error: null };
}

function parseDateRange(startDate, endDate) {
  const startResult = parseDateOnly(startDate, "Tanggal mulai");
  if (startResult.error) return { filter: null, error: startResult.error };

  const endResult = parseDateOnly(endDate, "Tanggal akhir");
  if (endResult.error) return { filter: null, error: endResult.error };

  const start = startResult.date;
  const end = endResult.date;
  if (start && end && start > end) {
    return {
      filter: null,
      error: "Tanggal mulai tidak boleh setelah tanggal akhir.",
    };
  }

  const filter = {};
  if (start) filter.gte = start;
  if (end) {
    const endExclusive = new Date(end);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    filter.lt = endExclusive;
  }

  return {
    filter: Object.keys(filter).length > 0 ? filter : null,
    error: null,
  };
}

module.exports = { parseDateRange };
