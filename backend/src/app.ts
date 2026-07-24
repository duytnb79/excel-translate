import express, { type NextFunction, type Request, type Response } from 'express';
import { requireAiAccess } from './middleware/aiAccess.js';
import { requireAuth } from './middleware/auth.js';
import { accessRouter } from './routes/access.js';
import { conversationsRouter } from './routes/conversations.js';
import { healthRouter } from './routes/health.js';
import { modelsRouter } from './routes/models.js';
import { proxySheetRouter } from './routes/proxySheet.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-AI-Access-Key');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use('/api/health', healthRouter);
  app.use('/api', requireAuth);
  app.use('/api/access', accessRouter);
  app.use('/api/models', requireAiAccess, modelsRouter);
  app.use('/api/conversations', requireAiAccess, conversationsRouter);
  app.use('/api/proxy-sheet', proxySheetRouter);

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
