import { Router } from 'express';
import { getModelCatalog } from '../services/modelCatalogService.js';

export const modelsRouter = Router();

modelsRouter.get('/', (_req, res) => {
  res.json(getModelCatalog());
});
