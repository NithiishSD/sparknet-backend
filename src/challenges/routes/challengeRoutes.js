import express from 'express';
import { protect } from '../../middleware/Auth.js';
import Challenge from '../../models/Challenge.js';

const router = express.Router();
router.use(protect);

router.get('/', async (req, res) => {
  const challenges = await Challenge.find();
  res.json({ success: true, count: challenges.length, data: challenges });
});

router.post('/join', async (req, res) => {
  res.json({ success: true, message: 'Joined challenge' });
});

router.post('/submit', async (req, res) => {
  res.json({ success: true, message: 'Challenge entry submitted' });
});

router.get('/leaderboard', async (req, res) => {
  res.json({ success: true, data: [] });
});

export default router;
