import express from 'express';
import { 
  getMyProfile, 
  updateProfile, 
  getPublicProfile, 
  updatePrivacy, 
  getActivity, 
  resetProfile 
} from '../../auth/controllers/profileController.js';

import { 
  followUser, 
  unfollowUser, 
  getFollowers 
} from '../controllers/connectionController.js';

import { protect } from '../../middleware/Auth.js';
import { uploadAvatar } from '../../utils/upload.js';

const router = express.Router();

// All routes here require being logged in
router.use(protect);

// Connections (Follows) for Youth Safety logic
router.post('/follow', followUser);
router.delete('/follow/:targetId', unfollowUser);
router.get('/:targetId/followers', getFollowers);
router.get('/:username', getPublicProfile);

export default router;
