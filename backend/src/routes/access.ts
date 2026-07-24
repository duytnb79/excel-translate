import { Router } from 'express';
import { requireAiAccess } from '../middleware/aiAccess.js';

export const accessRouter = Router();

accessRouter.get('/verify', requireAiAccess, (_req, res) => {
  res.json({ authorized: true });
});
