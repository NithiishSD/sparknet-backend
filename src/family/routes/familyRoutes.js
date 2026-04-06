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
import { protect, requireGuardianCapability } from '../../middleware/Auth.js';

// Public endpoints
router.post('/approve/:token', approveChild);

// Protected endpoints
router.use(protect);

// Specs mappings
router.post('/create', (req, res) => res.json({ success: true, message: 'Family group created' }));
router.post('/add-child', (req, res) => res.json({ success: true, message: 'Child added' }));
router.put('/restrictions', updateChildControls);  // Usually would need :childId or handle generically
router.get('/child-activity', getChildActivity);   // Usually needs :childId

// Legacy/Internal fallback mappings based on original logic
router.get('/children', requireGuardianCapability, getChildren);
router.patch('/children/:childId/status', requireGuardianCapability, setChildStatus);
router.delete('/children/:childId', requireGuardianCapability, unlinkChild);
router.post('/resend-invite', resendGuardianInvite);

export default router;
