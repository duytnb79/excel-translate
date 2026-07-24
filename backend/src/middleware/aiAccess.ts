import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';

function matchesAccessKey(candidate: string) {
  const expectedBuffer = Buffer.from(env.AI_ACCESS_KEY);
  const candidateBuffer = Buffer.from(candidate);
  if (candidateBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(candidateBuffer, expectedBuffer);
}

export function requireAiAccess(req: Request, res: Response, next: NextFunction) {
  const accessKey = req.header('x-ai-access-key') || '';
  if (!matchesAccessKey(accessKey)) {
    res.status(403).json({ error: 'AI_ACCESS_DENIED' });
    return;
  }
  next();
}
