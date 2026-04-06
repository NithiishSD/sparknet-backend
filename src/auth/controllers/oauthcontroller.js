// ─────────────────────────────────────────────────────────────────────────────
// @desc    OAuth error API endpoint for frontend
// @route   GET /api/oauth/error
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
// export const oauthErrorApi = (req, res) => {
//   const message = req.query.message || 'Unknown error';
//   res.status(400).json({ success: false, message });
// };
import User from '../../models/User.js';

import  { generateAccessToken, generateRefreshToken, hashRefreshToken } from '../../utils/Jwt.js';

const { ROLES, MODES, ACCOUNT_STATUS } = User;

// ─── Helpers (same as authController) ────────────────────────────────────────
const getDeviceInfo = (req) => req.headers['user-agent'] || 'Unknown';
const getIp = (req) => req.ip || req.connection?.remoteAddress || 'unknown';

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL: sendTokenResponse
//
// Duplicated here intentionally (clean separation) — same logic as
// authController.sendTokenResponse. Issues JWT access + refresh tokens,
// registers the session, sets cookies.
//
// If you prefer DRY code: export sendTokenResponse from authController.js
// and import it here instead.
// ─────────────────────────────────────────────────────────────────────────────
const sendTokenResponse = async (user, statusCode, res, req) => {
  const accessToken = generateAccessToken(user);
  const rawRefreshToken = generateRefreshToken();
  const hashedRefresh = hashRefreshToken(rawRefreshToken);

  user.sessions.push({
    refreshToken: hashedRefresh,
    device: getDeviceInfo(req),
    ip: getIp(req),
  });

  if (user.sessions.length > 5) {
    user.sessions = user.sessions.slice(-5);
  }

  await user.save({ validateBeforeSave: false });

  const isGuardian = user.role === ROLES.USER && (user.childLinks?.length || 0) > 0;

  res
    .status(statusCode)
    .cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // 'none' needed for cross-site OAuth redirects
      maxAge: 15 * 60 * 1000,
    })
    .cookie('refreshToken', rawRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })
    .json({
      success: true,
      accessToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        mode: user.mode,
        status: user.status,
        isEmailVerified: user.isEmailVerified,
        authProvider: user.authProvider,
        needsOnboarding: user.needsOnboarding,
        oauthAvatarUrl: user.oauthAvatarUrl,
        isGuardian,
        hasChildren: isGuardian,
        linkedChildrenCount: user.childLinks?.length || 0,
      },
    });
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    OAuth callback handler — runs after Passport verify succeeds
// @route   GET /api/oauth/google/callback
//          GET /api/oauth/facebook/callback
//          GET /api/oauth/twitter/callback
//          GET /api/oauth/apple/callback
// @access  Public (called by OAuth provider redirect)
//
// Two flows:
//   A. API mode (mobile / SPA using Authorization header)
//      → Return JSON with token directly
//   B. Web redirect mode (traditional browser flow)
//      → Redirect to CLIENT_URL with token in query param
//        Frontend reads the token from URL and stores it
// ─────────────────────────────────────────────────────────────────────────────
export const handleOAuthCallback = async (req, res) => {
  try {
    // Passport already authenticated user and set req.user
    if (!req.user) {
      return res.redirect(
        `${process.env.CLIENT_URL}/auth/error?message=Authentication+failed`
      );
    }

    const user = req.user;

    // Record last login details
    user.lastLoginAt = new Date();
    user.lastLoginIp = getIp(req);
    user.loginHistory.push({
      ip: getIp(req),
      device: getDeviceInfo(req),
      success: true,
    });

    // Keep login history trimmed
    if (user.loginHistory.length > 50) {
      user.loginHistory = user.loginHistory.slice(-50);
    }

    // Determine if request prefers JSON (mobile / headless client)
    const prefersJson =
      req.headers.accept?.includes('application/json') ||
      req.query.responseType === 'json';

    if (prefersJson) {
      // API mode — return token as JSON
      return sendTokenResponse(user, 200, res, req);
    }

    // Web mode — generate token, redirect to frontend
    // Frontend reads ?token= from URL and stores it
    const accessToken = generateAccessToken(user);
    const rawRefreshToken = generateRefreshToken();
    const hashedRefresh = hashRefreshToken(rawRefreshToken);

    user.sessions.push({
      refreshToken: hashedRefresh,
      device: getDeviceInfo(req),
      ip: getIp(req),
    });

    if (user.sessions.length > 5) user.sessions = user.sessions.slice(-5);
    await user.save({ validateBeforeSave: false });

    // Set cookies for web clients
    res
      .cookie('accessToken', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 15 * 60 * 1000,
      })
      .cookie('refreshToken', rawRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

    // Redirect to appropriate frontend page
    if (user.needsOnboarding) {
      // New OAuth user — send to onboarding (collect DOB, accept terms)
      return res.redirect(
        `${process.env.CLIENT_URL}/onboarding?token=${accessToken}`
      );
    }

    // Returning user — send to dashboard/home
    return res.redirect(
      `${process.env.CLIENT_URL}/login?token=${accessToken}`
    );

  } catch (err) {
    console.error('OAuth callback error:', err);
    return res.redirect(
      `${process.env.CLIENT_URL}/auth/error?message=Server+error`
    );
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    OAuth error handler — called when provider denies access
// @route   GET /api/oauth/*/callback  (Passport failure redirect)
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
export const handleOAuthFailure = (req, res) => {
  const message = req.query.error_description || 'Authentication was cancelled or denied';
  return res.redirect(
    `${process.env.CLIENT_URL}/auth/error?message=${encodeURIComponent(message)}`
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Complete onboarding for new OAuth users
//          Collects dateOfBirth + terms acceptance (required post-OAuth)
// @route   POST /api/oauth/complete-onboarding
// @access  Private (protect middleware)
//
// Called by frontend onboarding page. Once complete, needsOnboarding = false
// and the user can access the full platform.
// ─────────────────────────────────────────────────────────────────────────────
export const completeOnboarding = async (req, res) => {
  try {
    const { dateOfBirth, termsAccepted, username } = req.body;

    if (!dateOfBirth || !termsAccepted) {
      console.warn('Onboarding 400: Missing DOB or Terms.', { dateOfBirth, termsAccepted });
      return res.status(400).json({
        success: false,
        message: 'Date of birth and terms acceptance are required',
      });
    }

    console.log('Completing Onboarding for user:', req.user?._id || 'UNKNOWN');
    const user = await User.findById(req.user?._id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.needsOnboarding) {
      console.warn('Onboarding 400: User does not need onboarding.', user._id);
      return res.status(400).json({
        success: false,
        message: 'Onboarding already completed',
      });
    }

    // Calculate age from provided DOB
    const birth = new Date(dateOfBirth);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;

    if (age < 5) {
      return res.status(400).json({ success: false, message: 'Minimum age is 5 years' });
    }

    // If they're a minor, enforce youth mode (same as local registration)
    const isMinorUser = age < 18;
    if (isMinorUser) {
      user.role = 'child';
      user.mode = 'youth';
      user.status = 'pending_guardian_approval';
      // They'll need to go through guardian linking before full access
    }

    // Update optional username if provided (auto-generated one might be ugly)
    if (username && username !== user.username) {
      const exists = await User.findOne({ username });
      if (exists) {
        return res.status(409).json({ success: false, message: 'Username already taken' });
      }
      user.username = username;
    }

    user.dateOfBirth = new Date(dateOfBirth);
    user.termsAcceptedAt = new Date();
    user.privacyAcceptedAt = new Date();
    user.needsOnboarding = false;

    await user.save({ validateBeforeSave: false });

    // Issue a fresh token — role/mode may have changed for minors
    return sendTokenResponse(user, 200, res, req);

  } catch (err) {
    console.error('Onboarding error:', err);
    res.status(500).json({ success: false, message: 'Server error during onboarding' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get list of OAuth providers linked to the authenticated account
// @route   GET /api/oauth/linked-providers
// @access  Private (protect middleware)
// ─────────────────────────────────────────────────────────────────────────────
export const getLinkedProviders = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      'authProvider googleId facebookId twitterId appleId'
    );

    const linked = {
      google:   !!user.googleId,
      facebook: !!user.facebookId,
      twitter:  !!user.twitterId,
      apple:    !!user.appleId,
    };

    res.json({
      success: true,
      primaryProvider: user.authProvider,
      linked,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Unlink an OAuth provider from the account
// @route   DELETE /api/oauth/unlink/:provider
// @access  Private (protect middleware)
//
// Safety checks:
//   - Cannot unlink if it's the only auth method (no password + only 1 provider)
//   - Cannot unlink the primary provider without setting another
// ─────────────────────────────────────────────────────────────────────────────
export const unlinkProvider = async (req, res) => {
  try {
    const { provider } = req.params;
    const validProviders = ['google', 'facebook', 'twitter', 'apple'];

    if (!validProviders.includes(provider)) {
      return res.status(400).json({ success: false, message: 'Invalid provider' });
    }

    const providerIdField = `${provider}Id`;
    const user = await User.findById(req.user._id).select(
      '+password googleId facebookId twitterId appleId authProvider'
    );

    if (!user[providerIdField]) {
      return res.status(400).json({
        success: false,
        message: `${provider} is not linked to your account`,
      });
    }

    // Count how many auth methods remain after unlinking
    const otherProviders = ['google', 'facebook', 'twitter', 'apple']
      .filter((p) => p !== provider)
      .filter((p) => !!user[`${p}Id`]);

    const hasPassword = !!user.password;

    if (!hasPassword && otherProviders.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot unlink — this is your only sign-in method. Add a password first.',
      });
    }

    user[providerIdField] = null;

    // If this was primary provider, switch primary to another available method
    if (user.authProvider === provider) {
      user.authProvider = otherProviders[0] || 'local';
    }

    await user.save({ validateBeforeSave: false });

    res.json({
      success: true,
      message: `${provider} unlinked successfully`,
    });
  } catch (err) {
    console.error('Unlink error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
