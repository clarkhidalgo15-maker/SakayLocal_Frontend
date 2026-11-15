import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

const COLORS = {
  navy: '102E4A',
  green: '087A50',
  paleGreen: 'EAF5EF',
  paleBlue: 'F1F5F8',
  line: 'D8E1E8',
  muted: '607080',
  white: 'FFFFFF',
};

const REPORT_TYPES = ['complaint', 'incident', 'assistance', 'feedback'];

function makeParagraph(text, options = {}) {
  const { bold = false, color = COLORS.navy, size = 20, ...paragraphOptions } = options;
  return new Paragraph({
    spacing: { after: 100 },
    ...paragraphOptions,
    children: [new TextRun({ text: String(text ?? ''), bold, color, size, font: 'Aptos' })],
  });
}

function makeCell(text, options = {}) {
  const {
    fill = COLORS.white,
    color = COLORS.navy,
    bold = false,
    width,
    align = AlignmentType.LEFT,
  } = options;
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: { fill, type: ShadingType.CLEAR },
    margins: { top: 100, bottom: 100, left: 120, right: 120 },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: COLORS.line },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: COLORS.line },
      left: { style: BorderStyle.SINGLE, size: 4, color: COLORS.line },
      right: { style: BorderStyle.SINGLE, size: 4, color: COLORS.line },
    },
    children: [
      new Paragraph({
        alignment: align,
        children: [new TextRun({ text: String(text ?? ''), bold, color, size: 18, font: 'Aptos' })],
      }),
    ],
  });
}

function makeTable(headers, rows, widths) {
  const heading = new TableRow({
    tableHeader: true,
    children: headers.map((header, index) => makeCell(header, {
      fill: COLORS.navy,
      color: COLORS.white,
      bold: true,
      width: widths[index],
    })),
  });
  const bodyRows = rows.length
    ? rows.map((row, rowIndex) => new TableRow({
      cantSplit: true,
      children: row.map((value, index) => makeCell(value, {
        fill: rowIndex % 2 === 0 ? COLORS.white : COLORS.paleBlue,
        width: widths[index],
      })),
    }))
    : [new TableRow({
      children: headers.map((_, index) => makeCell(index === 0 ? 'No records available.' : '', {
        fill: COLORS.paleBlue,
        color: COLORS.muted,
        width: widths[index],
      })),
    })];

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: widths,
    rows: [heading, ...bodyRows],
  });
}

function formatGeneratedAt(date) {
  return date.toLocaleString('en-PH', {
    dateStyle: 'long',
    timeStyle: 'short',
  });
}

function formatStatus(status) {
  return String(status || 'unknown').replaceAll('_', ' ');
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadDashboardDocx({
  account,
  dashboard,
  pendingRoutes = [],
  pendingRouteCount = 0,
}) {
  const generatedAt = new Date();
  const typeRows = REPORT_TYPES.map(type => {
    const count = Number(dashboard?.by_type?.[type]) || 0;
    const total = Number(dashboard?.total) || 0;
    const share = total ? `${Math.round((count / total) * 100)}%` : '0%';
    return [type[0].toUpperCase() + type.slice(1), count, share];
  });
  const recentRows = (dashboard?.recent || []).map(report => [
    report.reference_code,
    report.subject,
    report.report_type,
    report.contact_name,
    formatStatus(report.status),
  ]);
  const routeRows = pendingRoutes.slice(0, 5).map(route => [
    route.name,
    `${route.origin} to ${route.destination}`,
    route.vehicle,
    'Needs approval',
  ]);
  const children = [
    new Paragraph({
      spacing: { after: 80 },
      children: [new TextRun({ text: 'SAKAY', bold: true, color: COLORS.green, size: 34, font: 'Aptos Display' }),
        new TextRun({ text: 'LOKAL', bold: true, color: COLORS.navy, size: 34, font: 'Aptos Display' })],
    }),
    makeParagraph('ADMINISTRATIVE REPORT', { bold: true, color: COLORS.green, size: 16 }),
    makeParagraph('Dashboard Summary', { bold: true, size: 36, spacing: { before: 80, after: 80 } }),
    makeParagraph('Passenger reports and operational overview', { color: COLORS.muted, size: 21 }),
    makeParagraph(`Prepared for: ${account?.full_name || 'Administrator'} · ${account?.role === 'staff' ? `Staff, ${account.assigned_city || 'area not assigned'}` : 'Administrator'}`, { color: COLORS.muted, size: 18 }),
    makeParagraph(`Generated: ${formatGeneratedAt(generatedAt)}`, { color: COLORS.muted, size: 18, spacing: { after: 280 } }),
    new Paragraph({
      heading: 'Heading2',
      spacing: { before: 200, after: 100 },
      children: [new TextRun({ text: 'REPORT STATUS', bold: true, color: COLORS.navy, size: 23, font: 'Aptos Display' })],
    }),
    makeTable(
      ['Pending review', 'In progress', 'Resolved', 'Total reports'],
      [[
        Number(dashboard?.pending) || 0,
        Number(dashboard?.in_progress) || 0,
        Number(dashboard?.resolved) || 0,
        Number(dashboard?.total) || 0,
      ]],
      [2520, 2520, 2520, 2520],
    ),
    new Paragraph({
      heading: 'Heading2',
      spacing: { before: 280, after: 100 },
      children: [new TextRun({ text: 'REPORTS BY TYPE', bold: true, color: COLORS.navy, size: 23, font: 'Aptos Display' })],
    }),
    makeTable(['Report type', 'Reports', 'Share'], typeRows, [5000, 2540, 2540]),
    new Paragraph({
      heading: 'Heading2',
      spacing: { before: 280, after: 100 },
      children: [new TextRun({ text: 'RECENT SUBMISSIONS', bold: true, color: COLORS.navy, size: 23, font: 'Aptos Display' })],
    }),
    makeTable(['Reference', 'Subject', 'Type', 'Submitted by', 'Status'], recentRows, [1550, 3000, 1400, 2200, 1930]),
  ];

  if (account?.role === 'admin') {
    children.push(
      new Paragraph({
        heading: 'Heading2',
        spacing: { before: 280, after: 100 },
        children: [new TextRun({ text: `ROUTES AWAITING APPROVAL (${Number(pendingRouteCount) || 0})`, bold: true, color: COLORS.navy, size: 23, font: 'Aptos Display' })],
      }),
      makeTable(['Route', 'Origin to destination', 'Vehicle', 'Review status'], routeRows, [2200, 3900, 1800, 2180]),
    );
    if (pendingRouteCount > routeRows.length) {
      children.push(makeParagraph(`Showing ${routeRows.length} of ${pendingRouteCount} routes awaiting approval.`, {
        color: COLORS.muted,
        size: 16,
        spacing: { before: 80 },
      }));
    }
  }

  children.push(
    new Paragraph({
      spacing: { before: 320 },
      border: { top: { style: BorderStyle.SINGLE, size: 6, color: COLORS.green, space: 8 } },
      children: [new TextRun({
        text: 'SakayLokal · Oriental Mindoro transport service report',
        color: COLORS.muted,
        size: 16,
        font: 'Aptos',
      })],
    }),
  );

  const document = new Document({
    creator: 'SakayLokal',
    title: 'SakayLokal Dashboard Summary',
    subject: 'Passenger reports and operations overview',
    styles: { default: { document: { run: { font: 'Aptos', size: 20, color: COLORS.navy } } } },
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 900, right: 1080, bottom: 900, left: 1080 },
        },
      },
      children,
    }],
  });
  const blob = await Packer.toBlob(document);
  const date = generatedAt.toISOString().slice(0, 10);
  downloadBlob(blob, `SakayLokal-Dashboard-${date}.docx`);
}
