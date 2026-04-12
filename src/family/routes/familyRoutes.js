import express from 'express';
const router = express.Router();

import {
  approveChild,
  getChildren,
  updateChildControls,
  setChildStatus,
  unlinkChild,
  getChildActivity,
  resendGuardianInvite,
} from '../../guardian/controller/guardiancontroller.js';
import {
  createFamilyGroup,
  getFamilyLeaderboard,
  linkChallengeToFamily,
} from '../controllers/familyGroupController.js';
import { protect, requireGuardianCapability } from '../../middleware/Auth.js';

// Public endpoints
router.post('/approve/:token', approveChild);

// Protected endpoints
router.use(protect);

// ── Family Group routes ─────────────────────────────────────────────────────
router.post  ('/group',                  createFamilyGroup);       // Create group + auto-add children
router.get   ('/group/:id/leaderboard',  getFamilyLeaderboard);    // Members leaderboard
router.post  ('/group/:id/challenge',    linkChallengeToFamily);   // Link existing challenge

// ── Guardian child-management routes ────────────────────────────────────────
router.put   ('/restrictions', updateChildControls);
router.get   ('/child-activity', getChildActivity);
router.get   ('/children', requireGuardianCapability, getChildren);
router.patch ('/children/:childId/status', requireGuardianCapability, setChildStatus);
router.delete('/children/:childId', requireGuardianCapability, unlinkChild);
router.post  ('/resend-invite', resendGuardianInvite);

export default router;

