export type SheetScope =
  | { type: 'current'; sheetIndex: number }
  | { type: 'selected'; sheetIndices: number[] }
  | { type: 'all' }
  | {
      type: 'range';
      sheetIndex: number;
      ranges: Array<{ startRow: number; startCol: number; endRow: number; endCol: number }>;
    };

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
  scope: SheetScope;
  sheets: SpreadsheetSheetContext[];
}

export interface WorkbookContextEstimate {
  sheetCount: number;
  nonEmptyCellCount: number;
  sourceCharacters: number;
  serializedBytes: number;
  projectedGridCells: number;
  estimatedInputTokens: number;
}

export interface PreparedWorkbookContext {
  context: SpreadsheetContextPayload;
  estimate: WorkbookContextEstimate;
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
  maxCells: 20_000,
  maxCharacters: 200_000,
  maxCellCharacters: 2_000,
} as const;
