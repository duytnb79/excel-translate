import { z } from 'zod';

export const idSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);

export const spreadsheetScopeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('current'), sheetIndex: z.number().int().nonnegative() }),
  z.object({
    type: z.literal('selected'),
    sheetIndices: z.array(z.number().int().nonnegative()).min(1).max(20),
  }),
  z.object({ type: z.literal('all') }),
  z.object({
    type: z.literal('range'),
    sheetIndex: z.number().int().nonnegative(),
    ranges: z.array(z.object({
      startRow: z.number().int().positive(),
      startCol: z.number().int().positive(),
      endRow: z.number().int().positive(),
      endCol: z.number().int().positive(),
    })).min(1).max(100),
  }),
]);

export const pdfScopeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('current-page'), pageIndex: z.number().int().nonnegative() }),
  z.object({
    type: z.literal('selected-pages'),
    pageIndices: z.array(z.number().int().nonnegative()).min(1).max(100),
  }),
  z.object({ type: z.literal('all-pages') }),
]);

const cellSchema = z.object({
  address: z.string().min(1).max(32),
  row: z.number().int().positive(),
  column: z.number().int().positive(),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  displayValue: z.string().max(2_000),
  formula: z.string().max(2_000).optional(),
});

export const sheetSchema = z.object({
  index: z.number().int().nonnegative(),
  name: z.string().min(1).max(255),
  rowCount: z.number().int().nonnegative(),
  columnCount: z.number().int().nonnegative(),
  rows: z.array(z.object({
    rowNumber: z.number().int().positive(),
    cells: z.array(cellSchema).max(2_000),
  })).max(20_000),
});

export const pdfPageSchema = z.object({
  index: z.number().int().nonnegative(),
  pageNumber: z.number().int().positive(),
  itemCount: z.number().int().nonnegative(),
  text: z.string().max(200_000),
});

const spreadsheetContextSchema = z.object({
  documentType: z.literal('spreadsheet'),
  scope: spreadsheetScopeSchema,
  sheets: z.array(sheetSchema).min(1).max(20),
});

const pdfContextSchema = z.object({
  documentType: z.literal('pdf'),
  scope: pdfScopeSchema,
  pages: z.array(pdfPageSchema).min(1).max(100),
});

const documentContextSchema = z.discriminatedUnion('documentType', [
  spreadsheetContextSchema,
  pdfContextSchema,
]);

function defaultToSpreadsheet(input: unknown) {
  if (
    typeof input === 'object'
    && input !== null
    && !Array.isArray(input)
    && !Object.prototype.hasOwnProperty.call(input, 'documentType')
  ) {
    return { ...input, documentType: 'spreadsheet' };
  }
  return input;
}

// Missing documentType is accepted for legacy spreadsheet clients and conversations.
export const contextSchema = z.preprocess(defaultToSpreadsheet, documentContextSchema);

const createConversationDocumentSchema = z.discriminatedUnion('documentType', [
  spreadsheetContextSchema.extend({
    projectId: idSchema,
    fileName: z.string().min(1).max(255),
  }),
  pdfContextSchema.extend({
    projectId: idSchema,
    fileName: z.string().min(1).max(255),
  }),
]);

export const createConversationSchema = z.preprocess(
  defaultToSpreadsheet,
  createConversationDocumentSchema,
);

export const messageSchema = z.object({
  message: z.string().trim().min(1).max(8_000),
  model: z.string().trim().min(1).max(128).optional(),
});

export type SheetContext = z.infer<typeof sheetSchema>;
export type PdfPageContext = z.infer<typeof pdfPageSchema>;
export type ConversationContext = z.infer<typeof documentContextSchema>;
export type CreateConversationInput = z.infer<typeof createConversationDocumentSchema>;
export type DocumentType = ConversationContext['documentType'];
