import express from 'express';
import { protect, adminOnly } from '../../middleware/Auth.js';
import { checkContent, getModerationQueue, resolveFlaggedPost } from '../controllers/moderationController.js';

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// USER ROUTES
// ─────────────────────────────────────────────────────────────────────────────
router.use(protect);

// Pre-flight check for content before posting
router.post('/check', checkContent);

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN ROUTES
// ─────────────────────────────────────────────────────────────────────────────

// View moderation queue (flagged posts)
router.get('/queue', adminOnly, getModerationQueue);

// Resolve a flagged post
router.patch('/:postId/resolve', adminOnly, resolveFlaggedPost);

export default router;
