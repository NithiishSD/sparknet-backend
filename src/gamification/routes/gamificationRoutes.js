import express from 'express';
import { protect } from '../../middleware/Auth.js';
import { 
  getActiveChallenges, 
  joinChallenge, 
  completeChallenge, 
  getGamificationStats 
} from '../controllers/gamificationController.js';

const router = express.Router();
router.use(protect);

// User statistics and progress (points, level, badges, trustScore)
router.get('/progress', getGamificationStats);

// Challenges 
router.get('/challenges', getActiveChallenges);
router.post('/challenges/:id/join', joinChallenge);
router.post('/challenges/:id/complete', completeChallenge);

export default router;
