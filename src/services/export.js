'use strict';

const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const config = require('../config');
const { formatMoney } = require('../utils/helpers');

const COLUMNS = [
  { key: 'reference', header: 'Reference', width: 14 },
  { key: 'first_name', header: 'First Name', width: 16 },
  { key: 'last_name', header: 'Last Name', width: 16 },
  { key: 'email', header: 'Email', width: 28 },
  { key: 'phone', header: 'WhatsApp', width: 16 },
  { key: 'gender', header: 'Gender', width: 9 },
  { key: 'is_worker', header: 'Worker', width: 8 },
  { key: 'department', header: 'Department', width: 16 },
  { key: 'group_name', header: 'Group', width: 14 },
  { key: 'fee_tier', header: 'Fee Tier', width: 12 },
  { key: 'fee_amount', header: 'Expected', width: 11 },
  { key: 'amount_paid', header: 'Paid', width: 11 },
  { key: 'payment_status', header: 'Payment Status', width: 18 },
  { key: 'checked_in', header: 'Checked In', width: 11 },
  { key: 'created_at', header: 'Registered At', width: 20 },
];

function fmtDate(d) {
  if (!d) return '';
  try { return new Date(d).toISOString().slice(0, 19).replace('T', ' '); } catch { return String(d); }
}

function flat(p) {
  return {
    ...p,
    is_worker: p.is_worker ? 'Yes' : 'No',
    checked_in: p.checked_in ? 'Yes' : 'No',
    department: p.department || '',
    amount_paid: p.amount_paid != null ? p.amount_paid : '',
    created_at: fmtDate(p.created_at),
  };
}

async function toXlsx(rows) {
  const wb = new ExcelJS.Workbook();
  wb.creator = config.event.name;
  wb.created = new Date();
  const ws = wb.addWorksheet('Registrations', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  ws.columns = COLUMNS.map((c) => ({ key: c.key, header: c.header, width: c.width }));
  // header styling
  ws.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1437' } };
    cell.alignment = { vertical: 'middle' };
  });
  rows.forEach((p) => ws.addRow(flat(p)));
  ws.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + COLUMNS.length)}1` };
  return wb.xlsx.writeBuffer();
}

function csvCell(v) {
  const s = v == null ? '' : String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function toCsv(rows) {
  const header = COLUMNS.map((c) => c.header).join(',');
  const lines = rows.map((p) => {
    const f = flat(p);
    return COLUMNS.map((c) => csvCell(f[c.key])).join(',');
  });
  return '﻿' + [header, ...lines].join('\r\n'); // BOM for Excel UTF-8
}

function toPdf(rows, { title } = {}) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 28 });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const sym = config.event.currencySymbol;

  // Title
  doc.fillColor('#0b1437').font('Helvetica-Bold').fontSize(16).text(config.event.name, { align: 'left' });
  doc.fillColor('#e7b43b').font('Helvetica-Bold').fontSize(10).text('LIGHT BEARERS — REGISTRATION RECORDS', { align: 'left' });
  doc.moveDown(0.2);
  doc.fillColor('#6b7280').font('Helvetica').fontSize(8)
    .text(`${title || 'All participants'}  •  ${rows.length} record(s)  •  generated ${new Date().toLocaleString()}`);
  doc.moveDown(0.5);

  const cols = [
    { h: 'Reference', k: 'reference', w: 70 },
    { h: 'Name', k: 'name', w: 120 },
    { h: 'Email', k: 'email', w: 150 },
    { h: 'Phone', k: 'phone', w: 85 },
    { h: 'Group', k: 'group_name', w: 70 },
    { h: 'Tier', k: 'fee_tier', w: 55 },
    { h: 'Expected', k: 'fee_amount', w: 60 },
    { h: 'Status', k: 'payment_status', w: 95 },
    { h: 'In', k: 'checked', w: 28 },
  ];
  const startX = doc.page.margins.left;
  let y = doc.y;

  function row(cells, { header = false } = {}) {
    const h = 16;
    if (y + h > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    let x = startX;
    if (header) {
      doc.rect(startX, y, cols.reduce((a, c) => a + c.w, 0), h).fill('#0b1437');
    }
    doc.font(header ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5)
      .fillColor(header ? '#ffffff' : '#1c2340');
    cols.forEach((c, i) => {
      doc.text(String(cells[i] == null ? '' : cells[i]), x + 3, y + 4, { width: c.w - 6, ellipsis: true, lineBreak: false });
      x += c.w;
    });
    y += h;
    if (!header) {
      doc.moveTo(startX, y).lineTo(x, y).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
    }
  }

  row(cols.map((c) => c.h), { header: true });
  rows.forEach((p) => {
    row([
      p.reference,
      `${p.first_name} ${p.last_name}`,
      p.email,
      p.phone,
      p.group_name,
      p.fee_tier === 'early_bird' ? 'Early' : 'Regular',
      formatMoney(p.fee_amount, sym),
      p.payment_status.replace(/_/g, ' '),
      p.checked_in ? '✓' : '',
    ]);
  });

  doc.end();
  return done;
}

module.exports = { toXlsx, toCsv, toPdf, COLUMNS };
