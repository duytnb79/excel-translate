import { z } from 'zod';

export const idSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);

export const scopeSchema = z.discriminatedUnion('type', [
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

export const contextSchema = z.object({
  scope: scopeSchema,
  sheets: z.array(sheetSchema).min(1).max(20),
});

export const createConversationSchema = contextSchema.extend({
  projectId: idSchema,
  fileName: z.string().min(1).max(255),
});

export const messageSchema = z.object({
  message: z.string().trim().min(1).max(8_000),
  model: z.string().trim().min(1).max(128).optional(),
});

export type SheetContext = z.infer<typeof sheetSchema>;
export type ConversationContext = z.infer<typeof contextSchema>;
export type CreateConversationInput = z.infer<typeof createConversationSchema>;
