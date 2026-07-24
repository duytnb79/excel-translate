import { Router } from 'express';
import { z } from 'zod';
import { exportGoogleSheet } from '../services/googleSheetsService.js';

export const proxySheetRouter = Router();

proxySheetRouter.get('/', async (req, res) => {
  try {
    const rawUrl = z.string().url().parse(req.query.url);
    const buffer = await exportGoogleSheet(rawUrl);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="sheet.xlsx"');
    res.send(buffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to import spreadsheet';
    const status = message === 'GOOGLE_SHEET_TOO_LARGE' ? 413 : 400;
    res.status(status).json({ error: message });
  }
});
