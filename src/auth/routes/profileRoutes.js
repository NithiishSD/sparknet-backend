import express from 'express';
import { 
  getMyProfile, 
  updateProfile, 
  getPublicProfile, 
  updatePrivacy, 
  getActivity, 
  resetProfile 
} from '../controllers/profileController.js';

import { protect, enforceYouthPrivacy } from '../../middleware/Auth.js';
import { uploadAvatar } from '../../utils/upload.js';

const router = express.Router();

// All routes here require being logged in
router.use(protect);

// User Profile APIs
router.get('/', getMyProfile);
router.put('/', uploadAvatar.single('avatar'), updateProfile);

// Privacy with youth mode enforcement
router.put('/privacy', enforceYouthPrivacy, updatePrivacy);

// Extras
router.get('/activity', getActivity);
router.delete('/reset', resetProfile);
router.get('/:username', getPublicProfile);

export default router;
