import express from 'express';
import {
  getMyProfile,
  updateProfile,
  getPublicProfile,
  updatePrivacy,
  getActivity,
  resetProfile,
  searchUsers,
} from '../../auth/controllers/profileController.js';
import {
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
  getConnectionStatuses,
  blockUser,
  unblockUser,
} from '../controllers/connectionController.js';

import {
  exportUserData,
  deleteAccount,
} from '../controllers/complianceController.js';

import { protect } from '../../middleware/Auth.js';
import { uploadAvatar } from '../../utils/upload.js';

const router = express.Router();

// All routes require being logged in
router.use(protect);

// ── Compliance / Data Rights (static — before /:username) ───────────────────
router.get   ('/export',  exportUserData);   // GDPR: data portability
router.delete('/account', deleteAccount);    // GDPR: right to erasure

// Connections (Follows)
router.get('/connection-statuses', getConnectionStatuses);
router.get('/following', getFollowing);                // Who I follow (messaging contacts)
router.post('/follow', followUser);
router.delete('/follow/:targetId', unfollowUser);
router.get('/:targetId/followers', getFollowers);

// Blocking
router.post('/block/:userId',   blockUser);
router.delete('/block/:userId', unblockUser);

// Profile
router.get('/search', searchUsers);
router.get('/:username', getPublicProfile);

export default router;

