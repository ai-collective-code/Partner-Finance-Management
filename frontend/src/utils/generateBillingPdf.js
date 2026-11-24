import jsPDF from 'jspdf';
import { INVOICE_LOGO } from './invoiceLogo';

// Builds the PDF for a billing document (Tax Invoice, Proforma, Estimate, Quotation)
// saved by /api/billing/docs. All numbers come from the server — nothing is recalculated here
// except the CGST/SGST split shown on the page.

export const DOC_TITLES = {
  INV: 'TAX INVOICE',
  PI: 'PROFORMA INVOICE',
  EST: 'ESTIMATE',
  QUO: 'QUOTATION',
};

export const formatINR = (n) =>
  Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n) {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`;
}
function threeDigits(n) {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', rest ? twoDigits(rest) : ''].filter(Boolean).join(' ');
}

// Indian numbering: crore, lakh, thousand
export function amountInWords(amount) {
  const total = Math.round(Number(amount || 0) * 100);
  let rupees = Math.floor(total / 100);
  const paise = total % 100;
  if (rupees === 0 && paise === 0) return 'Rupees Zero Only';

  const parts = [];
  const crore = Math.floor(rupees / 10000000); rupees %= 10000000;
  const lakh = Math.floor(rupees / 100000); rupees %= 100000;
  const thousand = Math.floor(rupees / 1000); rupees %= 1000;
  if (crore) parts.push(`${crore >= 100 ? threeDigits(crore) : twoDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (rupees) parts.push(threeDigits(rupees));

  let words = parts.length ? `Rupees ${parts.join(' ')}` : 'Rupees Zero';
  if (paise) words += ` and ${twoDigits(paise)} Paise`;
  return `${words} Only`;
}

const fmtDate = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('.') : '');

// Plain figures as on the company invoice: 80000, or 80000.50 when there are paise
const plain = (n) => {
  const v = Math.round(Number(n || 0) * 100) / 100;
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
};

// Company invoice layout: legal page, six ruled columns (points)
const PAGE_H = 1008;
const COL = [73, 142, 266, 317, 377, 452, 541]; // left edge of each column, then the right edge
const TOP = 114;
const BOTTOM = 960;
const NUMBER_LABEL = { INV: 'Inv No', PI: 'PI No', EST: 'Est No', QUO: 'Quote No' };
const LINE = 1.2; // line height, as a multiple of the font size
const MIN_FIT = 5.5; // smallest font size text is shrunk to

export function generateBillingPdf(doc, company = {}) {
  const pdf = new jsPDF({ unit: 'pt', format: [612, PAGE_H] });
  const isInvoice = doc.doc_type === 'INV' || doc.doc_type === 'PI';
  const stage = doc.doc_type === 'INV' ? (doc.billing_stage || 'FULL') : 'FULL';
  const isAdvance = stage === 'ADVANCE';
  const advances = stage === 'FINAL' ? (doc.adjusted_advances || []) : [];
  const items = doc.items || [];
  const companyName = company.name || 'AI Collective';
  let y = TOP;

  pdf.setDrawColor(0);
  pdf.setTextColor(0);
  pdf.setLineWidth(1);
  pdf.addImage(INVOICE_LOGO, 'PNG', 73, 72, 63, 41);

  // A cell: { c: column, span, t: text, b: bold, s: size, a: align, v: 'top' | 'middle' | 'bottom', fit: shrink to one line }
  const layout = (cell) => {
    const x0 = COL[cell.c];
    const x1 = COL[cell.c + (cell.span || 1)];
    const padX = cell.fit && cell.a ? 4 : 8;
    let size = cell.s || 9;
    pdf.setFont('helvetica', cell.b ? 'bold' : 'normal');
    pdf.setFontSize(size);
    const t = String(cell.t ?? '').replace(/\r\n/g, '\n');
    if (cell.fit) {
      while (size > MIN_FIT && pdf.getTextWidth(t) > x1 - x0 - padX * 2) { size -= 0.25; pdf.setFontSize(size); }
    }
    const lines = pdf.splitTextToSize(t, x1 - x0 - padX * 2);
    return { x0, x1, padX, size, lines, h: lines.length * size * LINE };
  };

  const drawCell = (cell, top, h) => {
    if (cell.t === undefined || cell.t === null || cell.t === '') return;
    const m = layout(cell);
    const padY = 6;
    const start = cell.v === 'top' ? top + padY : cell.v === 'bottom' ? top + h - padY - m.h : top + (h - m.h) / 2;
    const align = cell.a || 'left';
    const x = align === 'right' ? m.x1 - m.padX : align === 'center' ? (m.x0 + m.x1) / 2 : m.x0 + m.padX;
    m.lines.forEach((l, i) => pdf.text(l, x, start + m.size * (0.95 + i * LINE), { align }));
  };

  const heightOf = (minH, cells) => Math.max(minH, ...cells.filter(c => c.t).map(c => layout(c).h + 12));

  // Draws one ruled row; it grows past minH when its text needs the room.
  // Columns covered by a span share one cell.
  const row = (minH, cells = [], onNewPage) => {
    const h = heightOf(minH, cells);
    if (y + h > BOTTOM) {
      pdf.addPage([612, PAGE_H]);
      y = 60;
      if (onNewPage) onNewPage();
    }
    for (let c = 0; c < 6;) {
      const cell = cells.find(k => k.c === c);
      const span = cell?.span || 1;
      pdf.rect(COL[c], y, COL[c + span] - COL[c], h);
      c += span;
    }
    cells.forEach(cell => drawCell(cell, y, h));
    y += h;
  };
  const label = (t, b) => ({ c: 0, t, b });
  const meta = (t, value) => (value || isInvoice
    ? [{ c: 3, t, b: true, s: 8.5 }, { c: 4, t: value, fit: true, s: 10, a: 'center' }] : []);

  // ── Title, company and document details
  const title = isAdvance ? 'ADVANCE INVOICE' : (DOC_TITLES[doc.doc_type] || doc.doc_type);
  row(29, [{ c: 1, t: title, b: true, s: 12, a: 'center', fit: true }]);
  row(22, [label('Bill From', true)]);
  row(37, [label('Company Name:'), { c: 1, t: companyName.toUpperCase(), s: 9.5 }, ...meta(NUMBER_LABEL[doc.doc_type] || 'No', doc.doc_number)]);
  row(64, [label('Address:'), { c: 1, t: company.address }, ...meta('Date', fmtDate(doc.issue_date))]);
  row(22, [label('GSTIN:'), { c: 1, t: company.gstin, fit: true },
    ...(doc.due_date ? meta(isInvoice ? 'Due Date' : 'Valid Until', fmtDate(doc.due_date)) : [])]);
  row(36, meta('Ref No', doc.ref_no));
  row(33, [label('Bill\nTo/Ship TO', true), ...meta('Ref Date', fmtDate(doc.ref_date))]);
  row(46, [label('Customer Name:'), { c: 1, t: doc.client_name }, ...meta('Purchase Order No.', doc.po_number)]);
  row(52, [label('Address:'), { c: 1, t: doc.client_address, s: 8.5 },
    ...(doc.project_code ? [{ c: 3, t: 'AiC Code', b: true, s: 8.5 }, { c: 4, span: 2, t: doc.project_code, fit: true, a: 'center' }] : [])]);
  row(26, [label('GSTIN:'), { c: 1, t: doc.client_gstin, fit: true },
    ...(doc.client_state ? [{ c: 3, t: 'Place of Supply', b: true, s: 8.5 }, { c: 4, span: 2, t: doc.client_state, fit: true, a: 'center' }] : [])]);
  row(22);

  // ── Items. Column 3 is blank on the company invoice; it holds Qty when a line needs one.
  const showQty = items.some(it => Number(it.qty) !== 1);
  const itemHeader = () => row(22, [
    { c: 0, t: 'Sr No', b: true, a: 'center' }, { c: 1, t: 'Description', b: true, a: 'center' },
    ...(showQty ? [{ c: 2, t: 'Qty', b: true, a: 'center' }] : []),
    { c: 3, t: 'Rate', b: true, a: 'center' }, { c: 4, t: 'GST %', b: true, a: 'center' }, { c: 5, t: 'Amount', b: true, a: 'center' },
  ]);
  itemHeader();
  const gstRate = Number(doc.tax_rate);
  const gstPct = isAdvance || doc.tax_mode === 'NONE' ? '-'
    : doc.tax_mode === 'CGST_SGST' && gstRate ? `${gstRate / 2}% + ${gstRate / 2}%` : `${gstRate}%`;
  items.forEach((it, i) => {
    const desc = String(it.description || '') + (it.sac ? `\nSAC: ${it.sac}` : '');
    row(items.length === 1 ? 60 : 30, [
      { c: 0, t: String(i + 1), a: 'center' },
      { c: 1, t: desc, s: 9.5, v: items.length === 1 ? 'top' : 'middle' },
      ...(showQty ? [{ c: 2, t: plain(it.qty), a: 'center', fit: true, s: 10 }] : []),
      { c: 3, t: plain(it.rate), a: 'right', fit: true, s: 10.5 },
      { c: 4, t: gstPct, a: 'center', fit: true, s: 10.5 },
      { c: 5, t: plain(it.amount), a: 'right', fit: true, s: 10.5 },
    ], itemHeader);
  });
  // Blank rows as on the company invoice, given up when advances need the space
  for (let i = items.length + advances.length * 2; i < 3; i++) row(22);

  // ── Totals
  const total = (t, value, minH = 24) => row(minH, [
    { c: 4, t, b: true, s: 8.5 }, { c: 5, t: typeof value === 'string' ? value : plain(value), a: 'right', fit: true, s: 10.5 },
  ]);
  total('Sub Total', doc.subtotal);
  total('GST Amount', isAdvance ? 'In final invoice' : doc.tax_amount, 30);
  if (isAdvance) total('Advance Amount', doc.total, 30);
  else total('Grand Total', doc.total, 30);
  // Final invoice: GST on the full value above, then each advance already invoiced
  if (advances.length) {
    advances.forEach(a => row(30, [
      { c: 1, span: 2, t: `Advance invoice ${a.doc_number} dated ${fmtDate(a.issue_date)}`, s: 8.5 },
      { c: 4, t: 'Less: Advance', b: true, s: 8.5 }, { c: 5, t: `- ${plain(a.amount)}`, a: 'right', fit: true, s: 10.5 },
    ]));
    total('Balance Due', doc.balance_due, 30);
  }
  row(22);

  // ── Detail of taxes
  if (isAdvance) {
    row(40, [label('Detail of Taxes'), {
      c: 1, span: 5, s: 8.5,
      t: 'GST is not charged on this advance. GST on the full project value is charged in the final invoice, which deducts this advance.',
    }]);
  } else if (doc.tax_mode !== 'NONE') {
    // Heading, column names and figures stay on one page
    if (y + 34 + 35 + 26 > BOTTOM) { pdf.addPage([612, PAGE_H]); y = 60; }
    row(34, [label('Detail of Taxes')]);
    const half = Math.round(Number(doc.tax_amount) * 50) / 100;
    const taxes = doc.tax_mode === 'CGST_SGST'
      ? [[`CGST ${gstRate / 2}%`, half], [`SGST ${gstRate / 2}%`, Number(doc.tax_amount) - half]]
      : [[`IGST ${gstRate}%`, doc.tax_amount]];
    row(35, [{ c: 1, t: 'Taxable Value', a: 'center' }, ...taxes.map(([t], i) => ({ c: 2 + i, t, a: 'center' })), { c: 4, t: 'Total', a: 'center' }]);
    row(26, [{ c: 1, t: plain(doc.subtotal), a: 'center', s: 10.5 },
      ...taxes.map(([, v], i) => ({ c: 2 + i, t: plain(v), a: 'center', fit: true, s: 10.5 })),
      { c: 4, t: plain(doc.total), a: 'center', fit: true, s: 10.5 }]);
  }

  // ── Payment term box, and room for the signature and stamp beside it
  const term = { c: 1, t: doc.payment_terms };
  const boxH = heightOf(66, [term]);
  if (y + boxH > BOTTOM) { pdf.addPage([612, PAGE_H]); y = 60; }
  pdf.rect(COL[1], y, COL[2] - COL[1], boxH);
  drawCell({ c: 0, t: 'Payment Term:-' }, y, boxH);
  drawCell(term, y, boxH);
  drawCell({ c: 2, span: 4, t: `For ${companyName}`, a: 'right', v: 'top', s: 8.5 }, y, boxH);
  drawCell({ c: 2, span: 4, t: 'Authorised Signatory', a: 'right', v: 'bottom', s: 8.5 }, y, boxH);
  y += boxH + 14;

  // ── Bank details and notes, only when there are any
  const block = (heading, body) => {
    if (!body) return;
    pdf.setFontSize(8.5);
    pdf.setFont('helvetica', 'normal');
    const lines = pdf.splitTextToSize(String(body).replace(/\r\n/g, '\n'), COL[6] - COL[0]);
    const lineH = 8.5 * LINE;
    if (y + lineH * 2 > PAGE_H - 24) { pdf.addPage([612, PAGE_H]); y = 60; }
    pdf.setFont('helvetica', 'bold');
    pdf.text(heading, COL[0], y);
    pdf.setFont('helvetica', 'normal');
    lines.forEach((l) => {
      y += lineH;
      if (y > PAGE_H - 24) { pdf.addPage([612, PAGE_H]); y = 60; }
      pdf.text(l, COL[0], y);
    });
    y += lineH + 8;
  };
  if (isInvoice) block('Bank Details', company.bank);
  block('Notes', doc.notes);

  return pdf;
}

export function downloadBillingPdf(doc, company) {
  const pdf = generateBillingPdf(doc, company);
  pdf.save(`${String(doc.doc_number).replace(/[\\/]/g, '-')}_${doc.project_code || ''}.pdf`);
}
