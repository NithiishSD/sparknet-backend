// ─────────────────────────────────────────────────────────────────────────────
// FILE: routes/oauthRoutes.js
//
// All OAuth routes for Google, Facebook, Twitter, Apple.
// Mount in app.js as: app.use('/api/auth', oauthRoutes)
// (same prefix as authRoutes — they share /api/auth/*)
// ─────────────────────────────────────────────────────────────────────────────
import express from 'express';
const router = express.Router();
import passport from 'passport';

import  {
  handleOAuthCallback,
  handleOAuthFailure,
  completeOnboarding,
  getLinkedProviders,
  unlinkProvider,
  // oauthErrorApi,
} from '../../auth/controllers/oauthcontroller.js'
// ─────────────────────────────────────────────────────────────────────────────
// OAuth error API endpoint for frontend
// ─────────────────────────────────────────────────────────────────────────────
// router.get('/oauth/error', oauthErrorApi);
import  { protect } from '../../middleware/Auth.js'

// ─── Passport authenticate options ───────────────────────────────────────────
// session: false — we use JWT, not Passport sessions
// failureRedirect — where to go if the provider denies or errors
const authOptions = (provider) => ({
  session: false,
  failureRedirect: `/api/auth/${provider}/failure`,
  failureMessage: true,
});

// ─────────────────────────────────────────────────────────────────────────────
// GOOGLE
// Step 1: GET /api/auth/google          — redirects browser to Google consent
// Step 2: GET /api/auth/google/callback — Google redirects back here after auth
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/google',
  passport.authenticate('google', {
    session: false,
    scope: ['profile', 'email'],
    // prompt: 'select_account' forces Google to show account picker even if already logged in
    prompt: 'select_account',
  })
);

router.get(
  '/google/callback',
  passport.authenticate('google', authOptions('google')),
  handleOAuthCallback
);

router.get('/google/failure', handleOAuthFailure);

// ─────────────────────────────────────────────────────────────────────────────
// FACEBOOK
// Step 1: GET /api/oauth/facebook
// Step 2: GET /api/oauth/facebook/callback
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/facebook',
  passport.authenticate('facebook', {
    session: false,
    scope: ['email', 'public_profile'],
  })
);

router.get(
  '/facebook/callback',
  passport.authenticate('facebook', authOptions('facebook')),
  handleOAuthCallback
);

router.get('/facebook/failure', handleOAuthFailure);

// ─────────────────────────────────────────────────────────────────────────────
// TWITTER (X)
// NOTE: Twitter OAuth 1.0a — no scope parameter needed here
// Scope is configured in the Strategy in config/passport.js
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/twitter',
  passport.authenticate('twitter', { session: false })
);

router.get(
  '/twitter/callback',
  passport.authenticate('twitter', authOptions('twitter')),
  handleOAuthCallback
);

router.get('/twitter/failure', handleOAuthFailure);

// ─────────────────────────────────────────────────────────────────────────────
// APPLE (Sign in with Apple)
// NOTE: Apple requires POST for callback (not GET) — Apple sends data via form
// Apple also requires HTTPS in production. Will NOT work on plain http://
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/apple',
  passport.authenticate('apple', {
    session: false,
    scope: ['name', 'email'],
  })
);

// Apple sends a POST to the callback URL with user data in form body
router.post(
  '/apple/callback',
  passport.authenticate('apple', authOptions('apple')),
  handleOAuthCallback
);

router.get('/apple/failure', handleOAuthFailure);

// ─────────────────────────────────────────────────────────────────────────────
// OAUTH ACCOUNT MANAGEMENT ROUTES
// These require an authenticated user (protect middleware)
// ─────────────────────────────────────────────────────────────────────────────

// Complete onboarding for new OAuth users (collect DOB + accept terms)
// Called after the first OAuth login redirects to /auth/onboarding
router.patch('/complete-onboarding', protect, completeOnboarding);

// Get which OAuth providers are linked to the current account
router.get('/linked-providers', protect, getLinkedProviders);

// Unlink a provider from the current account
// e.g. DELETE /api/auth/oauth/unlink/google
router.delete('/unlink/:provider', protect, unlinkProvider);

export default router;
