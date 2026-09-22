import { jsPDF } from 'jspdf';
import type { SchoolWithDistance } from '../types/school';
import { formatDistance } from './distance';

interface GeneratePdfOptions {
  applicantAddress: string;
  radiusMeters: number;
  schools: SchoolWithDistance[];
  generatedDate?: string;
}

/**
 * Generates a clean, official, locally viewable PDF report
 * containing ONLY the applicant address and the verified nearest schools.
 */
export function generateAdmissionReportPdf({
  applicantAddress,
  radiusMeters,
  schools,
  generatedDate,
}: GeneratePdfOptions): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  let y = margin;

  const dateStr =
    generatedDate ||
    new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

  // Top header banner background
  doc.setFillColor(21, 44, 107); // Brand Primary Navy (#152C6B)
  doc.rect(margin, y, contentWidth, 24, 'F');

  // School Title in Banner
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text("ST. CECILIA'S GIRLS' COLLEGE", margin + 6, y + 9);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(220, 230, 250);
  doc.text('Grade 1 Admission - Nearest Schools Verification Report', margin + 6, y + 16);

  // Date on the right of banner
  doc.setFontSize(8.5);
  doc.text(`Date: ${dateStr}`, pageWidth - margin - 6, y + 16, { align: 'right' });

  y += 29;

  // Applicant Address Box
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(203, 213, 225); // slate-300
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, contentWidth, 22, 2, 2, 'FD');

  // Address label & value
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59); // slate-800
  doc.text('Applicant Residence Address:', margin + 4, y + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85); // slate-700
  const cleanAddress = applicantAddress.trim() || 'Selected Location';
  // Split address if too long
  const addressLines = doc.splitTextToSize(cleanAddress, contentWidth - 60);
  doc.text(addressLines, margin + 54, y + 6);

  // Radius & Total info
  doc.setFont('helvetica', 'bold');
  doc.text('Verification Radius:', margin + 4, y + 15);
  doc.setFont('helvetica', 'normal');
  doc.text(formatDistance(radiusMeters), margin + 38, y + 15);

  doc.setFont('helvetica', 'bold');
  doc.text('Total Schools Identified:', margin + 70, y + 15);
  doc.setFont('helvetica', 'normal');
  doc.text(String(schools.length), margin + 114, y + 15);

  y += 28;

  // Section Header: Nearest Schools
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text('Verified Nearest Schools', margin, y);

  y += 4;

  // Table Header
  const colIndexX = margin;
  const colIndexW = 12;
  const colDistW = 48;
  const colNameX = colIndexX + colIndexW;
  const colNameW = contentWidth - colIndexW - colDistW;

  doc.setFillColor(241, 245, 249); // slate-100
  doc.rect(margin, y, contentWidth, 8, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.line(margin, y + 8, pageWidth - margin, y + 8);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.text('#', colIndexX + 4, y + 5.5);
  doc.text('School Name & Address', colNameX + 2, y + 5.5);
  doc.text('Straight-line / Driving', pageWidth - margin - 4, y + 5.5, { align: 'right' });

  y += 8;

  if (schools.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text('No schools found within the specified radius.', margin + 4, y + 10);
    y += 16;
  } else {
    // Render school rows
    schools.forEach((school, index) => {
      // Calculate row height based on text lines
      const name = school.name || 'Unnamed School';
      const address = school.address || '';
      const straightLineStr = `Straight: ${formatDistance(school.straightLineDistance)}`;
      const drivingStr = `Driving: ${school.drivingDistanceText || 'Pending'}`;
      const durationStr = school.drivingDurationText ? `Time: ~${school.drivingDurationText}` : '';

      const nameLines = doc.splitTextToSize(name, colNameW - 4);
      const addressLines = address ? doc.splitTextToSize(address, colNameW - 4) : [];

      const textHeight = nameLines.length * 4.2 + addressLines.length * 3.6 + 15;
      const rowHeight = Math.max(textHeight, 16);

      // Check if row fits on current page
      if (y + rowHeight > pageHeight - 20) {
        // Add footer on current page
        renderFooter(doc, pageWidth, pageHeight, margin);
        doc.addPage();
        y = margin;

        // Re-render table header on next page
        doc.setFillColor(241, 245, 249);
        doc.rect(margin, y, contentWidth, 8, 'F');
        doc.setDrawColor(203, 213, 225);
        doc.line(margin, y + 8, pageWidth - margin, y + 8);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(51, 65, 85);
        doc.text('#', colIndexX + 4, y + 5.5);
        doc.text('School Name & Address (cont.)', colNameX + 2, y + 5.5);
        doc.text('Straight-line / Driving', pageWidth - margin - 4, y + 5.5, { align: 'right' });
        y += 8;
      }

      // Alternating row background
      if (index % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y, contentWidth, rowHeight, 'F');
      }

      // Bottom border for row
      doc.setDrawColor(226, 232, 240); // slate-200
      doc.setLineWidth(0.2);
      doc.line(margin, y + rowHeight, pageWidth - margin, y + rowHeight);

      // Row Number
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      doc.text(String(index + 1), colIndexX + 4, y + 5.5);

      // School Name
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      let textY = y + 5;
      doc.text(nameLines, colNameX + 2, textY);
      textY += nameLines.length * 4.2;

      // School Address
      if (addressLines.length > 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text(addressLines, colNameX + 2, textY);
      }

      // Straight-line and driving measurements
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);
      const distanceX = pageWidth - margin - 4;
      doc.text(straightLineStr, distanceX, y + 5, { align: 'right' });
      doc.setTextColor(37, 99, 235);
      doc.text(drivingStr, distanceX, y + 9, { align: 'right' });
      if (durationStr) {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text(durationStr, distanceX, y + 13, { align: 'right' });
      }

      y += rowHeight;
    });
  }

  // Footer on final page
  renderFooter(doc, pageWidth, pageHeight, margin);

  // Download directly to local machine
  const filename = `St_Cecilias_Nearest_Schools_${dateStr.replace(/\s+/g, '_')}.pdf`;
  doc.save(filename);
}

function renderFooter(
  doc: jsPDF,
  pageWidth: number,
  pageHeight: number,
  margin: number
): void {
  const footerY = pageHeight - 10;
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.line(margin, footerY - 3, pageWidth - margin, footerY - 3);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("St. Cecilia's Girls' College - Grade 1 Admission System", margin, footerY);
  doc.text('Developed by Tradiq Zium Tech', pageWidth - margin, footerY, { align: 'right' });
}
