import type {
  ConversationContext,
  PdfPageContext,
  SheetContext,
} from '../schemas/conversation.js';

export type ContextStats =
  | {
    documentType: 'spreadsheet';
    documentUnitCount: number;
    contentItemCount: number;
    totalCells: number;
    totalCharacters: number;
  }
  | {
    documentType: 'pdf';
    documentUnitCount: number;
    contentItemCount: number;
    totalPages: number;
    totalCharacters: number;
  };

function validateSpreadsheetContext(sheets: SheetContext[]): ContextStats {
  let totalCells = 0;
  let totalCharacters = 0;

  for (const sheet of sheets) {
    for (const row of sheet.rows) {
      totalCells += row.cells.length;
      for (const cell of row.cells) {
        totalCharacters += cell.displayValue.length + (cell.formula?.length || 0);
      }
    }
  }

  if (totalCells > 20_000) throw new Error('CONTEXT_TOO_MANY_CELLS');
  if (totalCharacters > 200_000) throw new Error('CONTEXT_TOO_LARGE');

  return {
    documentType: 'spreadsheet',
    documentUnitCount: sheets.length,
    contentItemCount: totalCells,
    totalCells,
    totalCharacters,
  };
}

function validatePdfContext(pages: PdfPageContext[]): ContextStats {
  if (pages.length > 100) throw new Error('CONTEXT_TOO_MANY_PAGES');

  let totalCharacters = 0;
  let totalItems = 0;

  for (const page of pages) {
    totalCharacters += page.text.length;
    totalItems += page.itemCount;
  }

  if (totalCharacters > 200_000) throw new Error('CONTEXT_TOO_LARGE');

  return {
    documentType: 'pdf',
    documentUnitCount: pages.length,
    contentItemCount: totalItems,
    totalPages: pages.length,
    totalCharacters,
  };
}

export function validateContextSize(context: ConversationContext): ContextStats {
  return context.documentType === 'pdf'
    ? validatePdfContext(context.pages)
    : validateSpreadsheetContext(context.sheets);
}

export function serializeSheet(sheet: SheetContext) {
  const serialized = JSON.stringify(sheet);
  if (serialized.length > 350_000) {
    throw new Error(`SHEET_CONTEXT_TOO_LARGE:${sheet.name}`);
  }
  return serialized;
}

export function serializePdfPage(page: PdfPageContext) {
  const serialized = JSON.stringify(page);
  if (serialized.length > 350_000) {
    throw new Error(`PDF_PAGE_CONTEXT_TOO_LARGE:${page.pageNumber}`);
  }
  return serialized;
}

export function buildSpreadsheetContext(serializedSheets: string[]): string {
  const result: string[] = [];

  for (const serialized of serializedSheets) {
    try {
      const sheet = JSON.parse(serialized);

      let minRow = Infinity;
      let maxRow = -Infinity;
      let minCol = Infinity;
      let maxCol = -Infinity;
      const cellMap = new Map<string, { displayValue: string; formula?: string }>();

      for (const row of sheet.rows) {
        for (const cell of row.cells) {
          minRow = Math.min(minRow, cell.row);
          maxRow = Math.max(maxRow, cell.row);
          minCol = Math.min(minCol, cell.column);
          maxCol = Math.max(maxCol, cell.column);
          cellMap.set(`${cell.row},${cell.column}`, {
            displayValue: cell.displayValue,
            ...(cell.formula ? { formula: cell.formula } : {}),
          });
        }
      }

      if (maxRow === -Infinity) {
        result.push(JSON.stringify({ sheetName: sheet.name, grid: [] }));
        continue;
      }

      const grid: string[][] = [];
      const formulas: Record<string, string> = {};

      for (let r = minRow; r <= maxRow; r++) {
        const rowData: string[] = [];
        for (let c = minCol; c <= maxCol; c++) {
          const cell = cellMap.get(`${r},${c}`);
          rowData.push(cell ? cell.displayValue : '');
          if (cell?.formula) {
            const address = getColLetter(c) + r;
            formulas[address] = cell.formula;
          }
        }
        grid.push(rowData);
      }

      const compactSheet = {
        sheetName: sheet.name,
        startCell: `${getColLetter(minCol)}${minRow}`,
        endCell: `${getColLetter(maxCol)}${maxRow}`,
        grid,
        ...(Object.keys(formulas).length > 0 ? { formulas } : {}),
      };

      result.push(JSON.stringify(compactSheet));
    } catch {
      result.push(serialized);
    }
  }

  return result.join('\n');
}

export function buildPdfContext(serializedPages: string[]): string {
  const pages = serializedPages.map(serialized => {
    try {
      const page = JSON.parse(serialized) as PdfPageContext;
      return JSON.stringify({
        pageNumber: page.pageNumber,
        text: page.text,
      });
    } catch {
      return serialized;
    }
  });

  return pages.join('\n');
}

export function buildDocumentContext(
  documentType: ConversationContext['documentType'],
  serializedUnits: string[],
): string {
  return documentType === 'pdf'
    ? buildPdfContext(serializedUnits)
    : buildSpreadsheetContext(serializedUnits);
}

function getColLetter(colIndex: number): string {
  let temp = colIndex;
  let letter = '';
  while (temp > 0) {
    const tempCol = (temp - 1) % 26;
    letter = String.fromCharCode(tempCol + 65) + letter;
    temp = Math.floor((temp - tempCol - 1) / 26);
  }
  return letter;
}

export function getContextStatus(error: unknown) {
  const message = error instanceof Error ? error.message : 'INVALID_CONTEXT';
  if (message === 'CONVERSATION_NOT_FOUND') return 404;
  if (
    message.startsWith('CONTEXT_')
    || message.startsWith('SHEET_CONTEXT_')
    || message.startsWith('PDF_PAGE_CONTEXT_')
  ) return 413;
  return 400;
}

export function contextFingerprint(context: ConversationContext) {
  return JSON.stringify(context);
}
