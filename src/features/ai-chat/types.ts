export type SheetScope =
  | { type: 'current'; sheetIndex: number }
  | { type: 'selected'; sheetIndices: number[] }
  | { type: 'all' }
  | {
      type: 'range';
      sheetIndex: number;
      ranges: Array<{ startRow: number; startCol: number; endRow: number; endCol: number }>;
    };

export type PdfScope =
  | { type: 'current-page'; pageIndex: number }
  | { type: 'selected-pages'; pageIndices: number[] }
  | { type: 'all-pages' };

export type DocumentScope = SheetScope | PdfScope;
export type DocumentType = 'spreadsheet' | 'pdf';

export interface SpreadsheetCellRecord {
  address: string;
  row: number;
  column: number;
  value: string | number | boolean | null;
  displayValue: string;
  formula?: string;
}

export interface SpreadsheetRowRecord {
  rowNumber: number;
  cells: SpreadsheetCellRecord[];
}

export interface SpreadsheetSheetContext {
  index: number;
  name: string;
  rowCount: number;
  columnCount: number;
  rows: SpreadsheetRowRecord[];
}

export interface SpreadsheetContextPayload {
  documentType: 'spreadsheet';
  scope: SheetScope;
  sheets: SpreadsheetSheetContext[];
}

export interface PdfPageContext {
  index: number;
  pageNumber: number;
  itemCount: number;
  text: string;
}

export interface PdfContextPayload {
  documentType: 'pdf';
  scope: PdfScope;
  pages: PdfPageContext[];
}

export type DocumentContextPayload = SpreadsheetContextPayload | PdfContextPayload;

export interface DocumentContextEstimate {
  documentUnitCount: number;
  contentItemCount: number;
  sourceCharacters: number;
  serializedBytes: number;
  projectedGridCells: number;
  estimatedInputTokens: number;
}

export interface PreparedDocumentContext {
  context: DocumentContextPayload;
  estimate: DocumentContextEstimate;
}

export interface ChatUsage {
  inputTokens: number;
  outputTokens: number;
  model?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  usage?: ChatUsage;
}

export const CHAT_CONTEXT_LIMITS = {
  maxSheets: 20,
  maxPdfPages: 100,
  maxCells: 20_000,
  maxCharacters: 200_000,
  maxCellCharacters: 2_000,
} as const;
