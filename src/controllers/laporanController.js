const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const prisma = require("../config/prisma");
const { parseDateRange } = require("../utils/dateRange");
const { parseZonaFilter } = require("../utils/zonaFilter");

function toTitleCaseRisk(statusRisiko) {
  if (statusRisiko === "TINGGI") return "Tinggi";
  if (statusRisiko === "SEDANG") return "Sedang";
  return "Rendah";
}

async function exportLaporan(req, res, next) {
  try {
    const {
      module = "laporan",
      format = "xlsx",
      rw = "",
      risiko = "",
      search = "",
      start_date = "",
      end_date = "",
      zona: zonaQuery = "",
    } = req.query;

    const lowerFormat = String(format).toLowerCase();
    if (lowerFormat !== "xlsx" && lowerFormat !== "excel" && lowerFormat !== "pdf") {
      return res.status(400).json({
        success: false,
        message: "Format export tidak didukung. Gunakan format 'xlsx' atau 'pdf'.",
      });
    }

    const dateRange = parseDateRange(start_date, end_date);
    if (dateRange.error) {
      return res.status(400).json({
        success: false,
        message: dateRange.error,
      });
    }

    const zonaFilter = parseZonaFilter(zonaQuery);
    if (zonaFilter.error) {
      return res.status(400).json({
        success: false,
        message: zonaFilter.error,
      });
    }

    const where = dateRange.filter ? { createdAt: dateRange.filter } : {};
    const dusunWhere = {};
    if (zonaFilter.zona) {
      dusunWhere.zona = zonaFilter.zona;
      where.statusRisiko = zonaFilter.statusRisiko;
    }
    if (rw && !rw.toLowerCase().includes("semua")) {
      dusunWhere.rw = String(rw).trim();
    }
    if (Object.keys(dusunWhere).length > 0) {
      where.dusun = dusunWhere;
    }
    const dusunListWhere = { ...dusunWhere };
    if (zonaFilter.statusRisiko) {
      dusunListWhere.skrining = {
        some: { statusRisiko: zonaFilter.statusRisiko },
      };
    }
    if (risiko && !risiko.toLowerCase().includes("semua")) {
      const rUpper = risiko.toUpperCase();
      if (["TINGGI", "SEDANG", "RENDAH"].includes(rUpper)) {
        if (zonaFilter.statusRisiko && rUpper !== zonaFilter.statusRisiko) {
          return res.status(400).json({
            success: false,
            message: "Filter risiko tidak sesuai dengan zona yang dipilih.",
          });
        }
        where.statusRisiko = rUpper;
      }
    }
    if (search && search.trim()) {
      const s = search.trim();
      where.OR = [
        { kepalaKeluarga: { contains: s } },
        { namaBalita: { contains: s } },
        { kodeKeluarga: { contains: s } },
      ];
    }

    const [skriningList, dusunList] = await Promise.all([
      prisma.skriningStunting.findMany({
        where,
        include: { dusun: true },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      }),
      prisma.dusun.findMany({
        where: dusunListWhere,
        orderBy: { id: "asc" },
      }),
    ]);

    const timestamp = new Date().toISOString().slice(0, 10);
    const sanitizedModule = String(module).replace(/[^a-zA-Z0-9_-]/g, "");

    // 1. Export XLSX via ExcelJS
    if (lowerFormat === "xlsx" || lowerFormat === "excel") {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "StuntingGuard Desa";
      workbook.created = new Date();

      const worksheet = workbook.addWorksheet("Data Skrining");
      worksheet.columns = [
        { header: "No", key: "no", width: 6 },
        { header: "Kode Keluarga", key: "kodeKeluarga", width: 16 },
        { header: "Kepala Keluarga", key: "kepalaKeluarga", width: 22 },
        { header: "Nama Balita", key: "namaBalita", width: 20 },
        { header: "Usia (Bulan)", key: "usiaBulan", width: 14 },
        { header: "Dusun", key: "dusun", width: 18 },
        { header: "RW", key: "rw", width: 10 },
        { header: "Status Risiko", key: "statusRisiko", width: 16 },
        { header: "Faktor Dominan", key: "faktorDominan", width: 28 },
        { header: "Rencana Intervensi", key: "rencanaIntervensi", width: 35 },
      ];

      // Styling Header baris pertama
      worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      worksheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1E40AF" }, // Blue-800
      };

      skriningList.forEach((row, idx) => {
        worksheet.addRow({
          no: idx + 1,
          kodeKeluarga: row.kodeKeluarga || `KK-SKM-${String(row.id).padStart(4, "0")}`,
          kepalaKeluarga: row.kepalaKeluarga || "-",
          namaBalita: row.namaBalita || "-",
          usiaBulan: row.usiaBulan,
          dusun: row.dusun?.nama || "-",
          rw: row.dusun?.rw || "-",
          statusRisiko: toTitleCaseRisk(row.statusRisiko),
          faktorDominan: row.faktorDominan || "-",
          rencanaIntervensi: row.rencanaIntervensi || "-",
        });
      });

      // Sheet 2: Rekapitulasi Wilayah
      const rekapSheet = workbook.addWorksheet("Rekap Wilayah");
      rekapSheet.columns = [
        { header: "No", key: "no", width: 6 },
        { header: "Nama Dusun", key: "nama", width: 20 },
        { header: "RW", key: "rw", width: 10 },
        { header: "Zona Risiko", key: "zona", width: 14 },
        { header: "Kapasitas Balita", key: "kapasitas", width: 18 },
        { header: "Fokus Prioritas", key: "prioritas", width: 35 },
      ];
      rekapSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      rekapSheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF065F46" }, // Emerald-800
      };
      dusunList.forEach((d, idx) => {
        rekapSheet.addRow({
          no: idx + 1,
          nama: d.nama,
          rw: d.rw,
          zona: d.zona,
          kapasitas: d.kapasitasBalita,
          prioritas: d.prioritas || "-",
        });
      });

      const filename = `Laporan-StuntingGuard-${sanitizedModule}-${timestamp}.xlsx`;
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );

      await workbook.xlsx.write(res);
      return res.end();
    }

    // 2. Export PDF via PDFKit
    if (lowerFormat === "pdf") {
      const doc = new PDFDocument({ margin: 40, size: "A4" });
      const filename = `Laporan-StuntingGuard-${sanitizedModule}-${timestamp}.pdf`;

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );

      doc.pipe(res);

      // Header Laporan
      doc
        .fontSize(18)
        .font("Helvetica-Bold")
        .text("STUNTINGGUARD DESA", { align: "center" });
      doc
        .fontSize(12)
        .font("Helvetica")
        .text(`Laporan Eksekutif Stunting & Penanganan Sosial Desa - Modul: ${sanitizedModule}`, {
          align: "center",
        });
      doc
        .fontSize(9)
        .text(`Tanggal Cetak: ${new Date().toLocaleDateString("id-ID")} WIB`, {
          align: "center",
        });
      doc.moveDown();

      // Ringkasan Eksekutif
      const totalKK = skriningList.length;
      const countTinggi = skriningList.filter((s) => s.statusRisiko === "TINGGI").length;
      const countSedang = skriningList.filter((s) => s.statusRisiko === "SEDANG").length;
      const countRendah = skriningList.filter((s) => s.statusRisiko === "RENDAH").length;

      doc
        .fontSize(11)
        .font("Helvetica-Bold")
        .text("I. RINGKASAN DATA KELUARGA TERDATA");
      doc.font("Helvetica").fontSize(9);
      doc.text(`- Total Keluarga Skrining: ${totalKK}`);
      doc.text(`- Balita Risiko Tinggi: ${countTinggi} Kasus`);
      doc.text(`- Balita Risiko Sedang: ${countSedang} Kasus`);
      doc.text(`- Balita Risiko Rendah (Aman): ${countRendah} Kasus`);
      doc.moveDown();

      // Rekap Wilayah
      doc
        .fontSize(11)
        .font("Helvetica-Bold")
        .text("II. REKAPITULASI DUSUN & ZONA RISIKO");
      doc.font("Helvetica").fontSize(9);
      dusunList.forEach((d) => {
        doc.text(
          `• ${d.nama} (${d.rw}) - Zona: ${d.zona} | Kapasitas: ${d.kapasitasBalita} Balita | Prioritas: ${d.prioritas || "-"}`
        );
      });
      doc.moveDown();

      // Tabel 10 Data Balita Prioritas Utama
      doc
        .fontSize(11)
        .font("Helvetica-Bold")
        .text("III. DAFTAR BALITA PRIORITAS PENANGANAN UTAMA");
      doc.font("Helvetica").fontSize(8);

      const tableData = skriningList.slice(0, 15);
      tableData.forEach((item, idx) => {
        const textRow = `${idx + 1}. [${item.kodeKeluarga || `KK-${item.id}`}] ${item.namaBalita || "Balita"} (${item.usiaBulan} bln) - Dusun: ${item.dusun?.nama || "-"} | Status: ${toTitleCaseRisk(item.statusRisiko)} | Intervensi: ${item.rencanaIntervensi || "-"}`;
        doc.text(textRow);
      });

      doc.moveDown();
      doc
        .fontSize(8)
        .font("Helvetica-Oblique")
        .text("* Dokumen ini digenerate secara otomatis oleh Sistem Terpadu StuntingGuard Desa.", {
          align: "right",
        });

      doc.end();
      return;
    }
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  exportLaporan,
};
