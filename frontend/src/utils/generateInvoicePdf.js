import jsPDF from 'jspdf';

// Builds a simple, self-authored invoice/receipt PDF from typed form details, for
// submitters who don't have a real invoice document to scan/upload. Returns a File
// object ready to be sent to the /api/invoices/upload endpoint (field name "invoice").
export function generateInvoicePdf({ title, fromName, fromDetail, toName, date, lineItems, amount, purpose }) {
  const doc = new jsPDF();
  const marginX = 20;
  let y = 20;

  doc.setFontSize(18);
  doc.setFont(undefined, 'bold');
  doc.text(title || 'Invoice', marginX, y);
  y += 10;

  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.text(`Date: ${date || new Date().toISOString().slice(0, 10)}`, marginX, y);
  y += 10;

  doc.setFont(undefined, 'bold');
  doc.text('From:', marginX, y);
  doc.setFont(undefined, 'normal');
  doc.text(String(fromName || '—'), marginX + 20, y);
  y += 6;
  if (fromDetail) {
    doc.text(String(fromDetail), marginX + 20, y);
    y += 6;
  }
  y += 4;

  doc.setFont(undefined, 'bold');
  doc.text('To:', marginX, y);
  doc.setFont(undefined, 'normal');
  doc.text(String(toName || 'Ai Collective Finance'), marginX + 20, y);
  y += 12;

  doc.setDrawColor(200);
  doc.line(marginX, y, 190, y);
  y += 8;

  doc.setFont(undefined, 'bold');
  doc.text('Description', marginX, y);
  doc.text('Amount', 170, y);
  y += 4;
  doc.line(marginX, y, 190, y);
  y += 8;

  doc.setFont(undefined, 'normal');
  (lineItems && lineItems.length ? lineItems : [{ label: purpose || 'Payment', amount }]).forEach(item => {
    const wrapped = doc.splitTextToSize(String(item.label || ''), 120);
    doc.text(wrapped, marginX, y);
    doc.text(`Rs. ${Number(item.amount || 0).toFixed(2)}`, 170, y);
    y += 6 * wrapped.length + 2;
  });

  y += 6;
  doc.line(marginX, y, 190, y);
  y += 8;
  doc.setFont(undefined, 'bold');
  doc.text('Total:', 140, y);
  doc.text(`Rs. ${Number(amount || 0).toFixed(2)}`, 170, y);
  y += 16;

  doc.setFontSize(8);
  doc.setFont(undefined, 'italic');
  doc.setTextColor(120);
  doc.text('Auto-generated from submitted details — no scanned invoice was provided.', marginX, y);

  const blob = doc.output('blob');
  return new File([blob], `generated_invoice_${Date.now()}.pdf`, { type: 'application/pdf' });
}
