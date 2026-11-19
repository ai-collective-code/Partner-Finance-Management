import jsPDF from 'jspdf';

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

const fmtDate = (iso) => {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d} ${months[Number(m) - 1]} ${y}`;
};

export function generateBillingPdf(doc, company = {}) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const L = 15;
  const R = 195;
  const W = R - L;
  let y = 18;

  // Arrays (from splitTextToSize) are passed through so jsPDF draws them as separate lines
  const text = (s, x, yy, opts) => pdf.text(Array.isArray(s) ? s : String(s ?? ''), x, yy, opts);
  const ensureSpace = (needed) => {
    if (y + needed > 280) { pdf.addPage(); y = 20; }
  };

  // ── Header: company (left), document title + number (right)
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.setTextColor(30, 30, 60);
  text(company.name || 'AI Collective', L, y);

  pdf.setFontSize(15);
  pdf.setTextColor(79, 70, 229);
  text(DOC_TITLES[doc.doc_type] || doc.doc_type, R, y, { align: 'right' });

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  pdf.setTextColor(80);
  let cy = y + 5;
  const companyLines = [
    ...(company.address ? pdf.splitTextToSize(company.address, 95) : []),
    company.gstin ? `GSTIN: ${company.gstin}` : '',
    company.pan ? `PAN: ${company.pan}` : '',
    company.state ? `State: ${company.state}` : '',
    [company.email, company.phone].filter(Boolean).join('  |  '),
  ].filter(Boolean);
  companyLines.forEach(l => { text(l, L, cy); cy += 4; });

  let ry = y + 6;
  pdf.setFontSize(9);
  const metaRows = [
    ['No.', doc.doc_number],
    ['Date', fmtDate(doc.issue_date)],
    doc.due_date ? [doc.doc_type === 'INV' || doc.doc_type === 'PI' ? 'Due Date' : 'Valid Until', fmtDate(doc.due_date)] : null,
    ['AiC Code', doc.project_code],
  ].filter(Boolean);
  metaRows.forEach(([k, v]) => {
    pdf.setFont('helvetica', 'normal'); pdf.setTextColor(110);
    text(`${k}:`, 112, ry);
    pdf.setFont('helvetica', 'bold'); pdf.setTextColor(30);
    text(v, R, ry, { align: 'right' });
    ry += 5;
  });

  y = Math.max(cy, ry) + 4;
  pdf.setDrawColor(210);
  pdf.line(L, y, R, y);
  y += 7;

  // ── Bill To + Project
  pdf.setFontSize(8.5);
  pdf.setFont('helvetica', 'bold'); pdf.setTextColor(110);
  text(doc.doc_type === 'INV' || doc.doc_type === 'PI' ? 'BILL TO' : 'PREPARED FOR', L, y);
  text('PROJECT', 120, y);
  y += 5;

  pdf.setFontSize(10); pdf.setTextColor(30);
  text(doc.client_name, L, y);
  const projLines = pdf.splitTextToSize(doc.project_name || '', R - 120);
  text(projLines, 120, y);

  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); pdf.setTextColor(80);
  let by = y + 4.5;
  const clientLines = [
    ...(doc.client_address ? pdf.splitTextToSize(doc.client_address, 95) : []),
    doc.client_gstin ? `GSTIN: ${doc.client_gstin}` : '',
    doc.client_state ? `State / Place of supply: ${doc.client_state}` : '',
    [doc.client_email, doc.client_phone].filter(Boolean).join('  |  '),
  ].filter(Boolean);
  clientLines.forEach(l => { text(l, L, by); by += 4; });
  y = Math.max(by, y + 4.5 * projLines.length) + 5;

  // ── Items table
  const cols = { no: L + 2, desc: L + 10, sac: 118, qty: 140, rate: 165, amt: R - 2 };
  const header = () => {
    pdf.setFillColor(238, 240, 255);
    pdf.rect(L, y - 5, W, 8, 'F');
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5); pdf.setTextColor(50);
    text('#', cols.no, y);
    text('Description', cols.desc, y);
    text('SAC', cols.sac, y);
    text('Qty', cols.qty, y, { align: 'right' });
    text('Rate (Rs.)', cols.rate, y, { align: 'right' });
    text('Amount (Rs.)', cols.amt, y, { align: 'right' });
    y += 8;
  };
  header();

  pdf.setFont('helvetica', 'normal'); pdf.setTextColor(30);
  (doc.items || []).forEach((it, i) => {
    pdf.setFontSize(9); // set before measuring so the wrap width matches what is drawn
    const desc = pdf.splitTextToSize(String(it.description || ''), cols.sac - cols.desc - 6);
    const h = 5 * desc.length + 2;
    if (y + h > 270) { pdf.addPage(); y = 20; header(); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(30); pdf.setFontSize(9); }
    text(i + 1, cols.no, y);
    text(desc, cols.desc, y);
    text(it.sac || '', cols.sac, y);
    text(it.qty, cols.qty, y, { align: 'right' });
    text(formatINR(it.rate), cols.rate, y, { align: 'right' });
    text(formatINR(it.amount), cols.amt, y, { align: 'right' });
    y += h;
    pdf.setDrawColor(235);
    pdf.line(L, y - 3, R, y - 3);
  });

  // ── Totals
  ensureSpace(40);
  y += 3;
  const totalRow = (label, value, bold) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.setFontSize(bold ? 10.5 : 9);
    pdf.setTextColor(bold ? 20 : 70);
    text(label, 150, y, { align: 'right' });
    text(`Rs. ${formatINR(value)}`, cols.amt, y, { align: 'right' });
    y += bold ? 7 : 5.5;
  };
  totalRow('Subtotal', doc.subtotal);
  if (doc.tax_mode === 'CGST_SGST') {
    const half = Math.round(Number(doc.tax_amount) * 50) / 100;
    totalRow(`CGST @ ${Number(doc.tax_rate) / 2}%`, half);
    totalRow(`SGST @ ${Number(doc.tax_rate) / 2}%`, Number(doc.tax_amount) - half);
  } else if (doc.tax_mode === 'IGST') {
    totalRow(`IGST @ ${Number(doc.tax_rate)}%`, doc.tax_amount);
  }
  pdf.setDrawColor(180);
  pdf.line(110, y - 3.5, R, y - 3.5);
  y += 1;
  totalRow('Total', doc.total, true);

  pdf.setFont('helvetica', 'italic'); pdf.setFontSize(8.5); pdf.setTextColor(70);
  const words = pdf.splitTextToSize(`Amount in words: ${amountInWords(doc.total)}`, W);
  text(words, L, y);
  y += 4.5 * words.length + 4;

  // ── Bank details / notes
  const block = (title, body) => {
    if (!body) return;
    const lines = pdf.splitTextToSize(String(body), W);
    ensureSpace(8 + 4 * lines.length);
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5); pdf.setTextColor(110);
    text(title, L, y); y += 4.5;
    pdf.setFont('helvetica', 'normal'); pdf.setTextColor(60);
    text(lines, L, y); y += 4 * lines.length + 4;
  };
  if (doc.doc_type === 'INV' || doc.doc_type === 'PI') block('BANK DETAILS', company.bank);
  block('NOTES / TERMS', doc.notes);

  // ── Signature
  ensureSpace(25);
  y += 6;
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(60);
  text(`For ${company.name || 'AI Collective'}`, R, y, { align: 'right' });
  y += 14;
  text('Authorised Signatory', R, y, { align: 'right' });

  pdf.setFontSize(7.5); pdf.setTextColor(150);
  text('This is a computer-generated document.', L, 290);

  return pdf;
}

export function downloadBillingPdf(doc, company) {
  const pdf = generateBillingPdf(doc, company);
  pdf.save(`${String(doc.doc_number).replace(/[\\/]/g, '-')}_${doc.project_code || ''}.pdf`);
}
