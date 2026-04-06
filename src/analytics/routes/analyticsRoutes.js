import express from 'express';
import { protect, adminOnly } from '../../middleware/Auth.js';

const router = express.Router();
router.use(protect, adminOnly);

router.get('/usage', async (req, res) => {
  res.json({ success: true, data: { activeUsers: 150, avgSessionTime: '25 mins' } });
});

router.get('/engagement', async (req, res) => {
  res.json({ success: true, data: { challengeParticipation: '60%' } });
});

export default router;
