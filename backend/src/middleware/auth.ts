import type { NextFunction, Request, Response } from 'express';
import { firebaseAuth } from '../lib/firebase.js';
import type { AuthenticatedRequest } from '../types/http.js';

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authorization = req.header('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const decoded = await firebaseAuth.verifyIdToken(authorization.slice(7));
    (req as AuthenticatedRequest).uid = decoded.uid;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid authentication token' });
  }
}
