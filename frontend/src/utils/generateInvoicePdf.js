import jsPDF from 'jspdf';
import { amountInWords, formatINR } from './generateBillingPdf';
import { localToday } from './format';

// Builds a clean, professional invoice/receipt PDF from details typed into a form, for
// submitters who don't have a real invoice document to scan/upload. Returns a File
// object ready to be sent to the /api/invoices/upload endpoint (field name "invoice").
//
// Every field except fromName and amount is optional; whatever is provided is printed.
//   from        { name, company, address, phone, gstin }   (or legacy fromName / fromDetail)
//   to          { name, detail }                           (or legacy toName)
//   project     { name, code }                             AiC code shown in the header
//   lineItems   [{ label, amount }]                        defaults to one line: purpose = base amount
//   baseAmount  amount before GST; gstAmount + gstRate + gstMode ('CGST_SGST' | 'IGST') add GST rows
//   bank        { beneficiary, bankName, branch, accountNumber, ifsc, accountType }
//   invoiceNo   unique code from /api/invoices/reserve-code (falls back to a random reference)
export function generateInvoicePdf({
  title, fromName, fromDetail, from, toName, to, date, lineItems, amount, baseAmount,
  gstAmount, gstRate, gstMode, project, bank, purpose, invoiceNo,
}) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const L = 15;
  const R = 195;
  const W = R - L;
  let y = 18;

  const text = (s, x, yy, opts) => pdf.text(Array.isArray(s) ? s : String(s ?? ''), x, yy, opts);
  const ensureSpace = (needed) => { if (y + needed > 280) { pdf.addPage(); y = 20; } };

  const issuer = {
    name: from?.name || fromName || '—',
    company: from?.company || '',
    detail: from ? '' : (fromDetail || ''), // legacy callers pass e.g. "Employee ID: E001" here
    address: from?.address || '',
    phone: from?.phone || '',
    gstin: from?.gstin || '',
  };
  const billTo = { name: to?.name || toName || 'Ai Collective Finance', detail: to?.detail || '' };
  const issueDate = date || localToday();
  const total = Number(amount || 0);
  const gst = Number(gstAmount || 0);
  const base = baseAmount != null && baseAmount !== '' ? Number(baseAmount) : round2(total - gst);
  const ref = `REF-${issueDate.replace(/-/g, '').slice(0, 8)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  // ── Header: issuer (left), title + meta (right)
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.setTextColor(30, 30, 60);
  text(issuer.company || issuer.name, L, y);

  pdf.setFontSize(15);
  pdf.setTextColor(79, 70, 229);
  text(String(title || 'Invoice').toUpperCase(), R, y, { align: 'right' });

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  pdf.setTextColor(80);
  let cy = y + 5;
  [
    issuer.company ? issuer.name : '',
    issuer.detail,
    ...(issuer.address ? pdf.splitTextToSize(issuer.address, 90) : []),
    issuer.phone ? `Phone: ${issuer.phone}` : '',
    issuer.gstin ? `GSTIN: ${issuer.gstin}` : '',
  ].filter(Boolean).forEach(l => { text(l, L, cy); cy += 4; });

  let ry = y + 6;
  pdf.setFontSize(9);
  [
    invoiceNo ? ['Invoice No.', invoiceNo] : ['Ref.', ref],
    ['Date', fmtDate(issueDate)],
    project?.code ? ['AiC Code', project.code] : null,
  ].filter(Boolean).forEach(([k, v]) => {
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
  text('BILL TO', L, y);
  if (project?.name) text('PROJECT', 120, y);
  y += 5;
  pdf.setFontSize(10); pdf.setTextColor(30);
  text(billTo.name, L, y);
  const projLines = project?.name ? pdf.splitTextToSize(project.name, R - 120) : [];
  if (projLines.length) text(projLines, 120, y);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); pdf.setTextColor(80);
  let by = y + 4.5;
  if (billTo.detail) { const d = pdf.splitTextToSize(billTo.detail, 95); text(d, L, by); by += 4 * d.length; }
  y = Math.max(by, y + 4.5 * Math.max(1, projLines.length)) + 5;

  // ── Items table
  const header = () => {
    pdf.setFillColor(238, 240, 255);
    pdf.rect(L, y - 5, W, 8, 'F');
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5); pdf.setTextColor(50);
    text('#', L + 2, y);
    text('Description', L + 10, y);
    text('Amount (Rs.)', R - 2, y, { align: 'right' });
    y += 8;
  };
  header();

  const items = lineItems && lineItems.length ? lineItems : [{ label: purpose || 'Professional services', amount: base }];
  pdf.setFont('helvetica', 'normal'); pdf.setTextColor(30);
  items.forEach((it, i) => {
    pdf.setFontSize(9);
    const desc = pdf.splitTextToSize(String(it.label || ''), 140);
    const h = 5 * desc.length + 2;
    if (y + h > 270) { pdf.addPage(); y = 20; header(); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(30); pdf.setFontSize(9); }
    text(i + 1, L + 2, y);
    text(desc, L + 10, y);
    text(formatINR(it.amount), R - 2, y, { align: 'right' });
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
    text(`Rs. ${formatINR(value)}`, R - 2, y, { align: 'right' });
    y += bold ? 7 : 5.5;
  };
  if (gst > 0) {
    totalRow('Subtotal', base);
    const rate = Number(gstRate || 0);
    if (gstMode === 'CGST_SGST') {
      const half = round2(gst / 2);
      totalRow(`CGST${rate ? ` @ ${rate / 2}%` : ''}`, half);
      totalRow(`SGST${rate ? ` @ ${rate / 2}%` : ''}`, round2(gst - half));
    } else {
      totalRow(`${gstMode === 'IGST' ? 'IGST' : 'GST'}${rate ? ` @ ${rate}%` : ''}`, gst);
    }
    pdf.setDrawColor(180);
    pdf.line(110, y - 3.5, R, y - 3.5);
    y += 1;
  }
  totalRow('Total', total, true);

  pdf.setFont('helvetica', 'italic'); pdf.setFontSize(8.5); pdf.setTextColor(70);
  const words = pdf.splitTextToSize(`Amount in words: ${amountInWords(total)}`, W);
  text(words, L, y);
  y += 4.5 * words.length + 4;

  // ── Bank details
  const bankLines = bank ? [
    bank.beneficiary ? `Beneficiary: ${bank.beneficiary}` : '',
    [bank.bankName, bank.branch].filter(Boolean).join(', '),
    bank.accountNumber ? `A/c No.: ${bank.accountNumber}${bank.accountType ? ` (${bank.accountType})` : ''}` : '',
    bank.ifsc ? `IFSC: ${bank.ifsc}` : '',
  ].filter(Boolean) : [];
  if (bankLines.length) {
    ensureSpace(8 + 4 * bankLines.length);
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5); pdf.setTextColor(110);
    text('BANK DETAILS FOR PAYMENT', L, y); y += 4.5;
    pdf.setFont('helvetica', 'normal'); pdf.setTextColor(60);
    bankLines.forEach(l => { text(l, L, y); y += 4; });
    y += 4;
  }

  // ── Signature
  ensureSpace(25);
  y += 6;
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(60);
  text(`For ${issuer.company || issuer.name}`, R, y, { align: 'right' });
  y += 14;
  text('Authorised Signatory', R, y, { align: 'right' });

  pdf.setFontSize(7.5); pdf.setTextColor(150);
  text('Generated from submitted details on the Ai Collective Finance portal.', L, 290);

  const blob = pdf.output('blob');
  const fileTag = invoiceNo ? String(invoiceNo).replace(/[^A-Za-z0-9-]+/g, '-') : `generated_invoice_${Date.now()}`;
  return new File([blob], `${fileTag}.pdf`, { type: 'application/pdf' });
}

function round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }

function fmtDate(iso) {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(String(iso || ''));
  if (!m) return String(iso || '');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return m[3] ? `${m[3]} ${months[Number(m[2]) - 1]} ${m[1]}` : `${months[Number(m[2]) - 1]} ${m[1]}`;
}
