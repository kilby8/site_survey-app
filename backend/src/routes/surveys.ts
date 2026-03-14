import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  getAllSurveys,
  getSurveyById,
  insertSurvey,
  updateSurvey,
  SurveyRow,
} from '../database';

const router = Router();

function parseSurveyRow(row: SurveyRow) {
  return {
    ...JSON.parse(row.data),
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/surveys
router.get('/', (_req: Request, res: Response) => {
  try {
    const rows = getAllSurveys();
    const surveys = rows.map(parseSurveyRow);
    res.json({ surveys });
  } catch (err) {
    console.error('GET /api/surveys error:', err);
    res.status(500).json({ error: 'Failed to retrieve surveys' });
  }
});

// GET /api/surveys/:id
router.get('/:id', (req: Request, res: Response) => {
  try {
    const row = getSurveyById(req.params.id);
    if (!row) {
      res.status(404).json({ error: 'Survey not found' });
      return;
    }
    res.json(parseSurveyRow(row));
  } catch (err) {
    console.error('GET /api/surveys/:id error:', err);
    res.status(500).json({ error: 'Failed to retrieve survey' });
  }
});

// POST /api/surveys
router.post('/', (req: Request, res: Response) => {
  try {
    const body = req.body;
    const id = body.id || uuidv4();
    const now = new Date().toISOString();
    const data = JSON.stringify({ ...body, id });
    insertSurvey(id, data, now);
    res.status(201).json({ ...body, id, createdAt: now, updatedAt: now });
  } catch (err) {
    console.error('POST /api/surveys error:', err);
    res.status(500).json({ error: 'Failed to create survey' });
  }
});

// PUT /api/surveys/:id
router.put('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const now = new Date().toISOString();
    const data = JSON.stringify({ ...req.body, id });
    const updated = updateSurvey(id, data, now);
    if (!updated) {
      res.status(404).json({ error: 'Survey not found' });
      return;
    }
    res.json({ ...req.body, id, updatedAt: now });
  } catch (err) {
    console.error('PUT /api/surveys/:id error:', err);
    res.status(500).json({ error: 'Failed to update survey' });
  }
});

export default router;
