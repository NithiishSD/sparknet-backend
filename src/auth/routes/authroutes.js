import express from 'express';
const router = express.Router();
import {
  register, login, logout, logoutAll, refreshToken,
  verifyEmail, resendVerification,
  forgotPassword, resetPassword, changePassword,
  getMe,
} from '../controllers/authcontroller.js';
import { protect } from '../../middleware/Auth.js';
import { loginLimiter, registerLimiter, sensitiveActionLimiter } from '../../middleware/Ratelimiter.js';

// Public
router.post('/signup', registerLimiter, register);
router.post('/login', loginLimiter, login);
router.post('/refresh', refreshToken);
router.post('/verify-email', verifyEmail);
router.post('/resend-verification', sensitiveActionLimiter, resendVerification);
router.post('/reset-password-request', sensitiveActionLimiter, forgotPassword);
router.post('/reset-password', resetPassword);

// Protected
router.use(protect);
router.get('/me', getMe);
router.post('/logout', logout);
router.post('/logout-all', logoutAll);
router.post('/change-password', changePassword);

export default router;
