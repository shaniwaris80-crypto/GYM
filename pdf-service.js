(function () {
  async function loadJsPdf() {
    if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
    await new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-jspdf="1"]');
      if (existing && window.jspdf && window.jspdf.jsPDF) return resolve();
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
      script.async = true;
      script.dataset.jspdf = '1';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
    return window.jspdf && window.jspdf.jsPDF;
  }

  function safe(value) {
    return String(value == null ? '' : value);
  }

  function fallbackPrint(report, programName) {
    const popup = window.open('', '_blank');
    if (!popup) return alert('No se pudo abrir la ventana para imprimir el PDF.');
    const rows = [
      ['Fecha', report.date],
      ['Peso actual', report.currentWeight],
      ['Peso semana pasada', report.previousWeight],
      ['Diferencia', report.weightDelta],
      ['Fuerza', report.strength],
      ['Congestión', report.pump],
      ['Recuperación', report.recovery],
      ['Horas dormidas', report.sleepHours],
      ['Recuperación y estrés', report.dailyRecovery],
      ['Cardio semanal', report.cardioSessions],
      ['Duración cardio', report.cardioDuration],
      ['Momento del cardio', report.cardioTime],
      ['Sesiones de entreno', report.trainingSessions],
      ['Semana del sistema', report.systemWeek],
      ['Cumplimiento dieta', report.dietCompliance],
      ['Alimentos a cambiar', report.foodChanges],
      ['Apetito', report.appetite],
      ['Digestiones', report.digestion],
      ['Semana terapia', report.therapyWeek],
      ['Semana TPC', report.tpcWeek],
      ['Fotos reglamentarias', report.photosStatus],
      ['Fase menstrual', report.menstrualPhase],
      ['Notas', report.notes]
    ].map(([label, value]) => `<tr><td style="padding:8px;border:1px solid #ddd;font-weight:700;vertical-align:top;width:32%">${label}</td><td style="padding:8px;border:1px solid #ddd;">${safe(value) || '-'}</td></tr>`).join('');

    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Reporte semanal</title></head><body style="font-family:Arial,sans-serif;padding:24px;">
      <h1 style="margin:0 0 6px;">Reporte semanal</h1>
      <p style="margin:0 0 18px;color:#555;">${safe(programName) || 'Rutina activa'}</p>
      <table style="width:100%;border-collapse:collapse;">${rows}</table>
      <script>window.onload = () => window.print();<\/script>
    </body></html>`);
    popup.document.close();
  }

  async function exportReportPdf(report, programName) {
    try {
      const jsPDF = await loadJsPdf();
      if (!jsPDF) return fallbackPrint(report, programName);

      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 42;
      const usableWidth = pageWidth - margin * 2;
      let y = 46;

      doc.setFillColor(15, 17, 21);
      doc.roundedRect(margin, y, usableWidth, 74, 16, 16, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.text('REPORTE SEMANAL', margin + 18, y + 28);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.text(safe(programName) || 'Rutina activa', margin + 18, y + 48);
      doc.text(`Fecha: ${safe(report.date) || '-'}`, margin + 18, y + 66);
      y += 96;

      const sections = [
        ['Peso', [
          ['Peso actual', report.currentWeight],
          ['Peso semana pasada', report.previousWeight],
          ['Diferencia', report.weightDelta]
        ]],
        ['Sensaciones entrenamiento', [
          ['Fuerza', report.strength],
          ['Congestión', report.pump],
          ['Recuperación', report.recovery]
        ]],
        ['Descanso', [
          ['Horas dormidas', report.sleepHours],
          ['Recuperación y estrés', report.dailyRecovery]
        ]],
        ['Cardio', [
          ['Sesiones semanales', report.cardioSessions],
          ['Duración', report.cardioDuration],
          ['Momento del día', report.cardioTime]
        ]],
        ['Entrenamiento', [
          ['Sesiones de esta semana', report.trainingSessions],
          ['Semana del sistema actual', report.systemWeek]
        ]],
        ['Alimentación', [
          ['Cumplimiento dieta', report.dietCompliance],
          ['Alimentos a cambiar', report.foodChanges],
          ['Nivel de apetito', report.appetite],
          ['Digestiones', report.digestion]
        ]],
        ['Otros', [
          ['Semana de terapia actual', report.therapyWeek],
          ['Semana de TPC actual', report.tpcWeek],
          ['Fotos reglamentarias', report.photosStatus],
          ['Fase menstrual', report.menstrualPhase],
          ['Notas', report.notes]
        ]]
      ];

      function pageBreakIfNeeded(spaceNeeded) {
        if (y + spaceNeeded <= pageHeight - 46) return;
        doc.addPage();
        y = 46;
      }

      sections.forEach(([title, rows], sectionIndex) => {
        pageBreakIfNeeded(70);
        doc.setDrawColor(220, 224, 229);
        doc.setFillColor(sectionIndex % 2 ? 247 : 242, 248, 244);
        doc.roundedRect(margin, y, usableWidth, 30, 12, 12, 'FD');
        doc.setTextColor(17, 20, 24);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text(title, margin + 14, y + 20);
        y += 40;

        rows.forEach(([label, value]) => {
          const text = safe(value) || '-';
          const labelLines = doc.splitTextToSize(label, usableWidth * 0.3);
          const valueLines = doc.splitTextToSize(text, usableWidth * 0.62);
          const lineCount = Math.max(labelLines.length, valueLines.length);
          const rowHeight = Math.max(34, lineCount * 14 + 16);
          pageBreakIfNeeded(rowHeight + 4);

          doc.setDrawColor(230, 233, 238);
          doc.roundedRect(margin, y, usableWidth, rowHeight, 10, 10, 'S');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10);
          doc.text(labelLines, margin + 12, y + 18);
          doc.setFont('helvetica', 'normal');
          doc.text(valueLines, margin + usableWidth * 0.34, y + 18);
          y += rowHeight + 6;
        });

        y += 8;
      });

      const fileName = `reporte-semanal-${safe(report.date).replace(/[^\w-]+/g, '-') || 'sin-fecha'}.pdf`;
      doc.save(fileName);
    } catch (error) {
      console.error(error);
      fallbackPrint(report, programName);
    }
  }

  window.exportReportPdf = exportReportPdf;
})();
