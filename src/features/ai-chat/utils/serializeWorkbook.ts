import type ExcelJS from 'exceljs';
import { getCellText } from '../../sheet-viewer/utils/excelParser';
import {
  CHAT_CONTEXT_LIMITS,
  type SheetScope,
  type SpreadsheetCellRecord,
  type SpreadsheetContextPayload,
  type SpreadsheetSheetContext,
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

export function serializeWorkbookContext(
  workbook: ExcelJS.Workbook,
  scope: SheetScope,
): SpreadsheetContextPayload {
  const sheetIndices = getScopeIndices(workbook, scope);
  const sheets: SpreadsheetSheetContext[] = [];
  let totalCells = 0;
  let totalCharacters = 0;

  for (const sheetIndex of sheetIndices) {
    const worksheet = workbook.worksheets[sheetIndex];
    if (!worksheet) continue;

    const rows: SpreadsheetSheetContext['rows'] = [];

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (scope.type === 'range') {
        const inAnyRowRange = scope.ranges.some(r => {
          const minRow = Math.min(r.startRow, r.endRow);
          const maxRow = Math.max(r.startRow, r.endRow);
          return rowNumber >= minRow && rowNumber <= maxRow;
        });
        if (!inAnyRowRange) return;
      }

      const cells: SpreadsheetCellRecord[] = [];

      row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
        if (scope.type === 'range') {
          const inAnyCellRange = scope.ranges.some(r => {
            const minRow = Math.min(r.startRow, r.endRow);
            const maxRow = Math.max(r.startRow, r.endRow);
            const minCol = Math.min(r.startCol, r.endCol);
            const maxCol = Math.max(r.startCol, r.endCol);
            return rowNumber >= minRow && rowNumber <= maxRow && columnNumber >= minCol && columnNumber <= maxCol;
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

    sheets.push({
      index: sheetIndex,
      name: worksheet.name,
      rowCount: worksheet.actualRowCount,
      columnCount: worksheet.actualColumnCount,
      rows,
    });
  }

  return { scope, sheets };
}
