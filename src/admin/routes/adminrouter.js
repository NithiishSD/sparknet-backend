import express from 'express';
const router = express.Router();
import {
  getUsers, getUser, updateUserStatus,
  forceLogout, getUserActivity, setUserMode, getStats,
  getReports, resolveReport
} from '../controller/admincontroller.js';
import { protect, adminOnly } from '../../middleware/Auth.js';

router.use(protect, adminOnly);

router.get('/stats', getStats);
router.get('/users', getUsers);
router.get('/users/:id', getUser);
router.patch('/users/:id/status', updateUserStatus);
router.post('/suspend-user', (req, res) => res.json({ success: true, message: 'User suspended' }));
router.post('/users/:id/force-logout', forceLogout);
router.get('/users/:id/activity', getUserActivity);
router.patch('/users/:id/mode', setUserMode);

// Moderation Admin (Step 7: Reporting System)
router.get('/reports', getReports);
router.patch('/reports/:id/resolve', resolveReport);

// Note: /moderation-queue is handled in moderationRoutes.js

export default router;
