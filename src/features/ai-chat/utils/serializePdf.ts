import type { PdfDocumentData } from '../../pdf-viewer/utils/pdfParser';
import {
  CHAT_CONTEXT_LIMITS,
  type PdfContextPayload,
  type PdfScope,
  type PreparedDocumentContext,
} from '../types';

export class PdfContextError extends Error {}

function getScopeIndices(pdfData: PdfDocumentData, scope: PdfScope): number[] {
  let indices: number[];

  if (scope.type === 'current-page') {
    indices = [scope.pageIndex];
  } else if (scope.type === 'selected-pages') {
    indices = scope.pageIndices;
  } else {
    indices = pdfData.pages.map(page => page.pageIndex);
  }

  const normalized = [...new Set(indices)]
    .filter(index => Number.isInteger(index) && index >= 0 && index < pdfData.totalPages)
    .sort((a, b) => a - b);

  if (normalized.length === 0) {
    throw new PdfContextError('Vui lòng chọn ít nhất một trang PDF hợp lệ.');
  }
  if (normalized.length > CHAT_CONTEXT_LIMITS.maxPdfPages) {
    throw new PdfContextError(
      `Chỉ có thể phân tích tối đa ${CHAT_CONTEXT_LIMITS.maxPdfPages} trang PDF cùng lúc.`,
    );
  }

  return normalized;
}

function getPageText(page: PdfDocumentData['pages'][number]): string {
  return page.items
    .map(item => item.str.trim())
    .filter(Boolean)
    .join(' ');
}

export function preparePdfContext(
  pdfData: PdfDocumentData,
  scope: PdfScope,
): PreparedDocumentContext {
  const pageIndices = getScopeIndices(pdfData, scope);
  let totalCharacters = 0;
  let totalItems = 0;

  const pages = pageIndices.map(pageIndex => {
    const page = pdfData.pages[pageIndex];
    if (!page) throw new PdfContextError(`Không tìm thấy trang ${pageIndex + 1}.`);

    const text = getPageText(page);
    totalCharacters += text.length;
    totalItems += page.items.length;

    if (totalCharacters > CHAT_CONTEXT_LIMITS.maxCharacters) {
      throw new PdfContextError(
        `Các trang đã chọn vượt quá ${CHAT_CONTEXT_LIMITS.maxCharacters.toLocaleString()} ký tự. Hãy chọn ít trang hơn.`,
      );
    }

    return {
      index: pageIndex,
      pageNumber: pageIndex + 1,
      itemCount: page.items.length,
      text,
    };
  });

  if (pages.every(page => page.text.length === 0)) {
    throw new PdfContextError(
      'Không tìm thấy văn bản trong các trang đã chọn. PDF dạng scan cần OCR trước khi phân tích bằng AI.',
    );
  }

  const context: PdfContextPayload = { documentType: 'pdf', scope, pages };
  const serializedContext = JSON.stringify(context);
  const serializedBytes = new TextEncoder().encode(serializedContext).byteLength;

  return {
    context,
    estimate: {
      documentUnitCount: pages.length,
      contentItemCount: totalItems,
      sourceCharacters: totalCharacters,
      serializedBytes,
      projectedGridCells: 0,
      estimatedInputTokens: Math.ceil(serializedContext.length / 4),
    },
  };
}
