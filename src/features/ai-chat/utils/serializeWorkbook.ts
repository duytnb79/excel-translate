import type ExcelJS from 'exceljs';
import { getCellText } from '../../sheet-viewer/utils/excelParser';
import {
  CHAT_CONTEXT_LIMITS,
  type PreparedWorkbookContext,
  type SheetScope,
  type SpreadsheetCellRecord,
  type SpreadsheetContextPayload,
  type SpreadsheetSheetContext,
  type WorkbookContextEstimate,
} from '../types';

export class SpreadsheetContextError extends Error {}

function getScopeIndices(
  workbook: ExcelJS.Workbook,
  scope: SheetScope,
): number[] {
  const worksheetCount = workbook.worksheets.length;
  let indices: number[];

  if (scope.type === 'current' || scope.type === 'range') {
    indices = [scope.sheetIndex];
  } else if (scope.type === 'selected') {
    indices = scope.sheetIndices;
  } else {
    indices = workbook.worksheets.map((_, index) => index);
  }

  const normalized = [...new Set(indices)]
    .filter(index => Number.isInteger(index) && index >= 0 && index < worksheetCount);

  if (normalized.length === 0) {
    throw new SpreadsheetContextError('Vui lòng chọn ít nhất một sheet hợp lệ.');
  }
  if (normalized.length > CHAT_CONTEXT_LIMITS.maxSheets) {
    throw new SpreadsheetContextError(
      `Chỉ có thể phân tích tối đa ${CHAT_CONTEXT_LIMITS.maxSheets} sheet cùng lúc.`,
    );
  }

  return normalized;
}

function getFormula(cell: ExcelJS.Cell): string | undefined {
  const value = cell.value;
  if (
    value
    && typeof value === 'object'
    && 'formula' in value
    && typeof value.formula === 'string'
  ) {
    return value.formula;
  }
  return undefined;
}

function getPrimitiveValue(cell: ExcelJS.Cell, displayValue: string) {
  const value = cell.value;
  if (
    typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return value;
  }
  if (value === null || value === undefined) return null;
  return displayValue;
}

export const LARGE_CONTEXT_WARNING_THRESHOLDS = {
  estimatedInputTokens: 25_000,
  projectedGridCells: 50_000,
  sourceCharacters: 100_000,
} as const;

export function isLargeWorkbookContext(estimate: WorkbookContextEstimate): boolean {
  return (
    estimate.estimatedInputTokens >= LARGE_CONTEXT_WARNING_THRESHOLDS.estimatedInputTokens
    || estimate.projectedGridCells >= LARGE_CONTEXT_WARNING_THRESHOLDS.projectedGridCells
    || estimate.sourceCharacters >= LARGE_CONTEXT_WARNING_THRESHOLDS.sourceCharacters
  );
}

export function prepareWorkbookContext(
  workbook: ExcelJS.Workbook,
  scope: SheetScope,
): PreparedWorkbookContext {
  const sheetIndices = getScopeIndices(workbook, scope);
  const sheets: SpreadsheetSheetContext[] = [];
  let totalCells = 0;
  let totalCharacters = 0;
  let projectedGridCells = 0;

  for (const sheetIndex of sheetIndices) {
    const worksheet = workbook.worksheets[sheetIndex];
    if (!worksheet) continue;

    const rows: SpreadsheetSheetContext['rows'] = [];
    let minRow = Number.POSITIVE_INFINITY;
    let maxRow = 0;
    let minColumn = Number.POSITIVE_INFINITY;
    let maxColumn = 0;

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (scope.type === 'range') {
        const inAnyRowRange = scope.ranges.some(r => {
          const rangeMinRow = Math.min(r.startRow, r.endRow);
          const rangeMaxRow = Math.max(r.startRow, r.endRow);
          return rowNumber >= rangeMinRow && rowNumber <= rangeMaxRow;
        });
        if (!inAnyRowRange) return;
      }

      const cells: SpreadsheetCellRecord[] = [];

      row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
        if (scope.type === 'range') {
          const inAnyCellRange = scope.ranges.some(r => {
            const rangeMinRow = Math.min(r.startRow, r.endRow);
            const rangeMaxRow = Math.max(r.startRow, r.endRow);
            const rangeMinCol = Math.min(r.startCol, r.endCol);
            const rangeMaxCol = Math.max(r.startCol, r.endCol);
            return rowNumber >= rangeMinRow && rowNumber <= rangeMaxRow && columnNumber >= rangeMinCol && columnNumber <= rangeMaxCol;
          });
          if (!inAnyCellRange) return;
        }

        const displayValue = getCellText(cell);
        const formula = getFormula(cell);
        if (!displayValue && !formula) return;

        if (displayValue.length > CHAT_CONTEXT_LIMITS.maxCellCharacters) {
          throw new SpreadsheetContextError(
            `Ô ${worksheet.name}!${cell.address} vượt quá giới hạn ${CHAT_CONTEXT_LIMITS.maxCellCharacters.toLocaleString()} ký tự.`,
          );
        }

        totalCells += 1;
        totalCharacters += displayValue.length + (formula?.length || 0);
        minRow = Math.min(minRow, rowNumber);
        maxRow = Math.max(maxRow, rowNumber);
        minColumn = Math.min(minColumn, columnNumber);
        maxColumn = Math.max(maxColumn, columnNumber);

        if (totalCells > CHAT_CONTEXT_LIMITS.maxCells) {
          throw new SpreadsheetContextError(
            `Phạm vi đã chọn có hơn ${CHAT_CONTEXT_LIMITS.maxCells.toLocaleString()} ô dữ liệu. Hãy chọn ít sheet hơn.`,
          );
        }
        if (totalCharacters > CHAT_CONTEXT_LIMITS.maxCharacters) {
          throw new SpreadsheetContextError(
            `Phạm vi đã chọn vượt quá ${CHAT_CONTEXT_LIMITS.maxCharacters.toLocaleString()} ký tự. Hãy thu hẹp phạm vi.`,
          );
        }

        cells.push({
          address: cell.address,
          row: rowNumber,
          column: columnNumber,
          value: getPrimitiveValue(cell, displayValue),
          displayValue,
          ...(formula ? { formula } : {}),
        });
      });

      if (cells.length > 0) {
        rows.push({ rowNumber, cells });
      }
    });

    if (maxRow > 0 && maxColumn > 0) {
      projectedGridCells += (maxRow - minRow + 1) * (maxColumn - minColumn + 1);
    }

    sheets.push({
      index: sheetIndex,
      name: worksheet.name,
      rowCount: worksheet.actualRowCount,
      columnCount: worksheet.actualColumnCount,
      rows,
    });
  }

  const context: SpreadsheetContextPayload = { scope, sheets };
  const serializedContext = JSON.stringify(context);
  const serializedCharacters = serializedContext.length;
  const serializedBytes = new TextEncoder().encode(serializedContext).byteLength;
  const estimatedDenseGridCharacters = totalCharacters + projectedGridCells * 3;
  const estimatedInputTokens = Math.ceil(
    Math.max(serializedCharacters, estimatedDenseGridCharacters) / 4,
  );

  return {
    context,
    estimate: {
      sheetCount: sheets.length,
      nonEmptyCellCount: totalCells,
      sourceCharacters: totalCharacters,
      serializedBytes,
      projectedGridCells,
      estimatedInputTokens,
    },
  };
}

export function serializeWorkbookContext(
  workbook: ExcelJS.Workbook,
  scope: SheetScope,
): SpreadsheetContextPayload {
  return prepareWorkbookContext(workbook, scope).context;
}
