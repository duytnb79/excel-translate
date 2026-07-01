import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import * as pdfjsLib from 'pdfjs-dist';
import { PdfDocumentData } from './pdfParser';

/**
 * Strips Vietnamese accents from a string
 */
function stripAccents(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/**
 * Sanitizes a string for standard Helvetica (WinAnsi) font rendering.
 * Replaces any character that cannot be encoded in WinAnsi (code point > 255) with a space or alternative.
 */
function sanitizeForHelvetica(str: string): string {
  const stripped = stripAccents(str);
  let result = '';
  for (let i = 0; i < stripped.length; i++) {
    const code = stripped.charCodeAt(i);
    // WinAnsi (ISO-8859-1 extended) is safe up to 255
    if (code <= 255) {
      result += stripped[i];
    } else {
      result += ' '; // Replace unsupported characters (e.g. Japanese center dots, quotes, etc.) with space
    }
  }
  return result;
}

/**
 * Helper to convert Hex string to RGB fraction components for pdf-lib
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  if (!hex || hex.length < 7) return { r: 1, g: 1, b: 1 };
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return { r, g, b };
}

/**
 * Calculates a safe maximum bounding box width for font size scaling,
 * preventing layout-related PDF.js width parsing errors from shrinking text excessively.
 */
function getSafeMaxWidth(item: { str: string; fontSize: number; width: number }): number {
  const originalStr = item.str || '';
  const fontSize = item.fontSize || 12;
  const parsedWidth = item.width || 0;

  let expectedWidth = 0;
  for (let i = 0; i < originalStr.length; i++) {
    const code = originalStr.charCodeAt(i);
    // Check if character is CJK (Japanese/Chinese/Korean)
    if (code >= 0x3000 && code <= 0x9fff) {
      expectedWidth += fontSize * 0.9;
    } else {
      expectedWidth += fontSize * 0.52;
    }
  }

  // If parsed width is extremely small (e.g. less than 50% of the expected width),
  // it is likely an invalid bounding box width from PDF.js. Fallback to expected width!
  if (parsedWidth < expectedWidth * 0.5) {
    return expectedWidth;
  }
  return parsedWidth;
}

/**
 * Converts RGB components to Hex color string
 */
function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (val: number) => Math.max(0, Math.min(255, val));
  return '#' + [clamp(r), clamp(g), clamp(b)].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

/**
 * Detects background and text color from canvas pixels within the text boundary box.
 * Fills empty space by scanning column by column from the left edge.
 */
function detectColors(
  canvas: HTMLCanvasElement, 
  x: number, 
  y: number, 
  w: number, 
  h: number
): { bg: string; text: string } {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { bg: '#ffffff', text: '#000000' };

  try {
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    const getPixelColor = (px: number, py: number): { r: number; g: number; b: number } => {
      const cx = Math.max(0, Math.min(canvasWidth - 1, Math.round(px)));
      const cy = Math.max(0, Math.min(canvasHeight - 1, Math.round(py)));
      const imgData = ctx.getImageData(cx, cy, 1, 1).data;
      return { r: imgData[0] ?? 0, g: imgData[1] ?? 0, b: imgData[2] ?? 0 };
    };

    // Sample background color outside text box corners
    const samples = [
      getPixelColor(x - 2, y - 2),
      getPixelColor(x + w + 2, y - 2),
      getPixelColor(x - 2, y + h + 2),
      getPixelColor(x + w + 2, y + h + 2)
    ];

    let sumR = 0, sumG = 0, sumB = 0;
    samples.forEach(s => {
      sumR += s.r;
      sumG += s.g;
      sumB += s.b;
    });
    const avgR = Math.round(sumR / samples.length);
    const avgG = Math.round(sumG / samples.length);
    const avgB = Math.round(sumB / samples.length);

    const bgHex = rgbToHex(avgR, avgG, avgB);

    // Scan column by column from left to right (within a reasonable width, e.g. up to 80px or w)
    // to find the first pixel that differs significantly from the background.
    const scanLimit = Math.min(w, 80);
    let maxDist = -1;
    let textR = 0, textG = 0, textB = 0;

    for (let dx = 2; dx < scanLimit; dx += 4) {
      for (let dy = 2; dy < h; dy += 3) {
        const c = getPixelColor(x + dx, y + dy);
        const dist = Math.sqrt(
          Math.pow(c.r - avgR, 2) + 
          Math.pow(c.g - avgG, 2) + 
          Math.pow(c.b - avgB, 2)
        );

        if (dist > maxDist) {
          maxDist = dist;
          textR = c.r;
          textG = c.g;
          textB = c.b;
        }
      }
      // If we found a very strong text pixel (dist > 80), break early
      if (maxDist > 80) {
        break;
      }
    }

    const brightness = (avgR * 299 + avgG * 587 + avgB * 114) / 1000;
    let textHex = rgbToHex(textR, textG, textB);
    
    if (maxDist < 30) {
      textHex = brightness > 128 ? '#000000' : '#ffffff';
    }

    return { bg: bgHex, text: textHex };
  } catch (e) {
    console.error('Error detecting pixel colors in compiler:', e);
    return { bg: '#ffffff', text: '#000000' };
  }
}

/**
 * Downloads the Roboto font from reliable CDNs with fallback options
 */
async function downloadUnicodeFont(): Promise<ArrayBuffer> {
  const fontUrls = [
    'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Regular.ttf',
    'https://cdn.jsdelivr.net/npm/pdfmake@0.2.7/fonts/Roboto/Roboto-Regular.ttf',
    'https://unpkg.com/pdfmake@0.2.7/fonts/Roboto/Roboto-Regular.ttf',
    'https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxK.ttf'
  ];

  let lastError: any = null;
  for (const url of fontUrls) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return await response.arrayBuffer();
      }
      console.warn(`Font fetch failed at ${url} with status ${response.status}`);
    } catch (e: any) {
      lastError = e;
      console.warn(`Failed to fetch font from ${url}:`, e);
    }
  }
  throw new Error(`Failed to download Unicode font from all CDNs. Last error: ${lastError?.message || 'Unknown'}`);
}

/**
 * Compiles a new PDF with translated text overlaid on top of original pages
 */
export async function compileTranslatedPdf(
  originalPdfBuffer: ArrayBuffer,
  pdfData: PdfDocumentData,
  translationMap: Map<string, string>,
  detectedColors?: Map<string, { bg: string; text: string }>
): Promise<ArrayBuffer> {
  const pdfDoc = await PDFDocument.load(originalPdfBuffer.slice(0));
  pdfDoc.registerFontkit(fontkit);

  let customFont: any = null;
  try {
    const fontBytes = await downloadUnicodeFont();
    customFont = await pdfDoc.embedFont(fontBytes);
  } catch (err) {
    console.warn('Failed to embed custom Unicode font, falling back to Helvetica with sanitized characters.', err);
  }

  // Load default standard font for safe fallback
  const defaultFont = await pdfDoc.embedStandardFont(StandardFonts.Helvetica);
  const fontToUse = customFont || defaultFont;

  // Load the PDF via PDF.js to render offscreen and extract colors
  let pdfDocJs: any = null;
  try {
    pdfDocJs = await pdfjsLib.getDocument({ data: originalPdfBuffer.slice(0) }).promise;
  } catch (err) {
    console.warn('Failed to load PDF in background for color detection:', err);
  }

  const pages = pdfDoc.getPages();

  for (const pageData of pdfData.pages) {
    const page = pages[pageData.pageIndex];
    if (!page) continue;

    // Detect background/text colors for items on this page in the background
    const pageColors = new Map<string, { bg: string; text: string }>();
    if (pdfDocJs) {
      try {
        const jsPage = await pdfDocJs.getPage(pageData.pageIndex + 1);
        const scale = 1.5;
        const viewport = jsPage.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const canvasContext = canvas.getContext('2d')!;
        
        await jsPage.render({ canvasContext, viewport }).promise;

        pageData.items.forEach((item) => {
          const safeW = getSafeMaxWidth(item);
          const detected = detectColors(
            canvas,
            item.x * scale,
            item.y * scale,
            safeW * scale,
            item.height * scale
          );
          pageColors.set(item.originalStr, detected);
        });
      } catch (err) {
        console.warn(`Failed to detect background colors on page ${pageData.pageIndex + 1}:`, err);
      }
    }

    for (const item of pageData.items) {
      const translatedText = translationMap.get(item.originalStr);
      // Only draw if there is a translation and it changed
      if (translatedText && translatedText !== item.originalStr) {
        // Resolve detected colors (background & text color)
        const colors = pageColors.get(item.originalStr) || detectedColors?.get(item.originalStr) || { bg: '#ffffff', text: '#000000' };
        const bgRgb = hexToRgb(colors.bg);
        const textRgb = hexToRgb(colors.text);

        // Resolve safe maximum bounding box width
        const safeWidth = getSafeMaxWidth(item);

        // 1. Cover the original text with a matching background color rectangle.
        const paddingX = 2;
        const paddingY = 2;
        
        page.drawRectangle({
          x: item.pdfX - paddingX,
          y: item.pdfY - paddingY,
          width: safeWidth + (paddingX * 2),
          height: item.height + (paddingY * 2),
          color: rgb(bgRgb.r, bgRgb.g, bgRgb.b),
        });

        // 2. Draw translated text in the same position
        // If we failed to load custom font, sanitize for Helvetica to avoid WinAnsi encoding crashes
        const textToDraw = customFont ? translatedText : sanitizeForHelvetica(translatedText);

        // Dynamically scale down font size if the translated text exceeds safe bounding box width
        let fittedFontSize = item.fontSize;
        if (fontToUse && safeWidth > 0) {
          const textWidth = fontToUse.widthOfTextAtSize(textToDraw, item.fontSize);
          if (textWidth > safeWidth) {
            fittedFontSize = Math.max(6, item.fontSize * (safeWidth / textWidth));
          }
        }

        page.drawText(textToDraw, {
          x: item.pdfX,
          y: item.pdfY,
          size: fittedFontSize,
          font: fontToUse,
          color: rgb(textRgb.r, textRgb.g, textRgb.b),
        });
      }
    }
  }

  const compiledBytes = await pdfDoc.save();
  return compiledBytes.buffer as ArrayBuffer;
}
