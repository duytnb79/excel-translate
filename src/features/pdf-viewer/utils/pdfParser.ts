import * as pdfjsLib from 'pdfjs-dist';

// Initialize PDFJS Worker in Vite
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export interface PdfTextItem {
  str: string;
  originalStr: string; // Keep original for mapping translation
  x: number;          // Left position in PDF points
  y: number;          // Top position in PDF points (CSS coordinate space: top-left)
  pdfX: number;       // Raw PDF X (bottom-left)
  pdfY: number;       // Raw PDF Y (bottom-left)
  fontSize: number;
  width: number;
  height: number;
  fontName: string;
  transform: number[]; // [scaleX, skewY, skewX, scaleY, tx, ty]
}

export interface PdfPageData {
  pageIndex: number;
  width: number;
  height: number;
  items: PdfTextItem[];
}

export interface PdfDocumentData {
  totalPages: number;
  pages: PdfPageData[];
}

/**
 * Parses a PDF ArrayBuffer and extracts text items with coordinates
 */
export async function parsePdfDocument(arrayBuffer: ArrayBuffer): Promise<PdfDocumentData> {
  // Use a copy of buffer to avoid detaching/neutering
  const bufferCopy = arrayBuffer.slice(0);
  const loadingTask = pdfjsLib.getDocument({ data: bufferCopy });
  const pdf = await loadingTask.promise;
  const totalPages = pdf.numPages;
  const pages: PdfPageData[] = [];

  for (let i = 1; i <= totalPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.0 });
    const width = viewport.width;
    const height = viewport.height;

    const textContent = await page.getTextContent();
    const items: PdfTextItem[] = [];

    for (const item of textContent.items) {
      if ('str' in item) {
        const text = item.str;
        // Skip purely whitespace elements
        if (text.trim() === '') continue;

        const transform = item.transform; // [scaleX, skewY, skewX, scaleY, tx, ty]
        const pdfX = transform[4] !== undefined ? transform[4] : 0;
        const pdfY = transform[5] !== undefined ? transform[5] : 0;
        
        // Font size is scaleY (transform[3]) or scaleX (transform[0])
        const fontSize = Math.abs(transform[3] !== undefined ? transform[3] : 10);
        
        // Convert y coordinate from PDF space (bottom-left) to CSS space (top-left)
        // CSS Y = Page Height - PDF Y - Font Size (to align top edge)
        const y = height - pdfY - fontSize;
        const x = pdfX;

        // Approximate height
        const itemHeight = item.height !== undefined && item.height > 0 ? item.height : fontSize;
        const itemWidth = item.width !== undefined ? item.width : 0;

        items.push({
          str: text,
          originalStr: text,
          x,
          y,
          pdfX,
          pdfY,
          fontSize,
          width: itemWidth,
          height: itemHeight,
          fontName: item.fontName || 'sans-serif',
          transform,
        });
      }
    }

    pages.push({
      pageIndex: i - 1,
      width,
      height,
      items,
    });
  }

  console.log('PDF parsed:', pages.map(p => ({ page: p.pageIndex + 1, textsCount: p.items.length })));

  return {
    totalPages,
    pages,
  };
}
