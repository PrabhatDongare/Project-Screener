// Extracts the text layer of a PDF resume. Image-only (scanned) PDFs have no text and are rejected.
export const MIN_RESUME_CHARS = 200;

export async function extractResumeText(buffer) {
  if (!buffer || buffer.length < 5 || buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw new Error('That file is not a PDF. Please upload your resume as a .pdf file.');
  }
  const parse = (await import('pdf-parse/lib/pdf-parse.js')).default;
  let text;
  try {
    ({ text } = await parse(buffer));
  } catch (err) {
    throw new Error(`Could not read the PDF (${err.message}). Try re-exporting it.`);
  }
  text = (text || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  if (text.length < MIN_RESUME_CHARS) {
    throw new Error('No readable text found in this PDF. It looks scanned/image-based - upload a PDF whose text can be selected on screen.');
  }
  return text;
}
