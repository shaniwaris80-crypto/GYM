function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-src="${src}"]`);
    if (existing && existing.dataset.loaded === 'true') {
      resolve();
      return;
    }
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.src = src;
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve();
    }, { once: true });
    script.addEventListener('error', reject, { once: true });
    document.head.appendChild(script);
  });
}

export async function exportReportPdf(report, programName = 'Rutina actual') {
  await loadScriptOnce('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const left = 42;
  const right = 553;
  let y = 46;

  const addLine = (label, value = '—') => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(label, left, y);
    y += 14;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    const lines = doc.splitTextToSize(String(value || '—'), right - left);
    doc.text(lines, left, y);
    y += lines.length * 14 + 10;
    if (y > 760) {
      doc.addPage();
      y = 46;
    }
  };

  doc.setFillColor(18, 22, 32);
  doc.roundedRect(left, 28, 511, 68, 16, 16, 'F');
  doc.setTextColor(245, 247, 251);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('CONTROL DE REPORTE SEMANAL', left + 18, 58);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(programName, left + 18, 78);
  doc.text(`Fecha: ${report.date || '—'}`, 420, 78);
  doc.setTextColor(20, 24, 35);
  y = 122;

  addLine('Peso actual', report.currentWeight);
  addLine('Peso semana pasada', report.previousWeight);
  addLine('Diferencia de peso', report.weightDelta);
  addLine('Fuerza', report.strength);
  addLine('Congestión', report.pump);
  addLine('Recuperación', report.recovery);
  addLine('Horas dormidas', report.sleepHours);
  addLine('Recuperación y descanso del día a día / estrés', report.dailyRecovery);
  addLine('Sesiones cardiovasculares', report.cardioSessions);
  addLine('Duración cardio', report.cardioDuration);
  addLine('Momento del día', report.cardioTime);
  addLine('Sesiones de esta semana', report.trainingSessions);
  addLine('Semana del sistema actual', report.systemWeek);
  addLine('Cumplimiento dieta', report.dietCompliance);
  addLine('Alimentos a cambiar', report.foodChanges);
  addLine('Nivel de apetito', report.appetite);
  addLine('Digestiones', report.digestion);
  addLine('Semana de terapia actual', report.therapyWeek);
  addLine('Semana de TPC actual', report.tpcWeek);
  addLine('Fotos reglamentarias', report.photosStatus);
  addLine('Fase menstrual', report.menstrualPhase);
  addLine('Notas extra', report.notes);

  const safeDate = (report.date || new Date().toISOString().slice(0, 10)).replace(/[^0-9-]/g, '');
  doc.save(`reporte-semanal-${safeDate}.pdf`);
}
