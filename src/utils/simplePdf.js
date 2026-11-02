/**
 * Small uncompressed PDF so a report can be downloaded without another library.
 * Text is WinAnsi. Characters outside that set are replaced.
 */

function pdfText(value) {
  return String(value ?? '')
    .replace(/[^\x20-\x7E]/g, '?')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function wrapLine(line, width) {
  const text = String(line ?? '');
  if (text.length <= width) return [text];
  const rows = [];
  for (let index = 0; index < text.length; index += width) {
    rows.push(text.slice(index, index + width));
  }
  return rows;
}

export function buildSimplePdf(lines, { title = 'Report' } = {}) {
  const pageWidth = 842;
  const pageHeight = 595;
  const margin = 36;
  const lineHeight = 11;
  const maxChars = 128;
  const body = [];
  wrapLine(title, maxChars).forEach((line) => body.push(line));
  body.push('');
  (lines || []).forEach((line) => {
    wrapLine(line, maxChars).forEach((part) => body.push(part));
  });

  const capacity = Math.floor((pageHeight - margin * 2) / lineHeight);
  const pages = [];
  for (let index = 0; index < body.length; index += capacity) {
    pages.push(body.slice(index, index + capacity));
  }
  if (!pages.length) pages.push(['']);

  const objects = [];
  const add = (text) => {
    objects.push(text);
    return objects.length;
  };

  const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageIds = [];
  const contentIds = [];

  pages.forEach((pageLines) => {
    const commands = ['BT', '/F1 8 Tf', `${margin} ${pageHeight - margin} Td`, `${lineHeight} TL`];
    pageLines.forEach((line, index) => {
      if (index > 0) commands.push('T*');
      commands.push(`(${pdfText(line)}) Tj`);
    });
    commands.push('ET');
    const stream = commands.join('\n');
    const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    contentIds.push(contentId);
    pageIds.push(null);
  });

  const pageObjectIds = pageIds.map((_, index) => {
    const id = add('PAGE');
    pageIds[index] = id;
    return id;
  });
  const pagesId = add('PAGES');
  const catalogId = add('<< /Type /Catalog /Pages PAGES_REF >>'.replace('PAGES_REF', `${pagesId} 0 R`));

  objects[pagesId - 1] = `<< /Type /Pages /Count ${pageObjectIds.length} /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] >>`;
  pageObjectIds.forEach((id, index) => {
    objects[id - 1] = `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${contentIds[index]} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`;
  });

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}
