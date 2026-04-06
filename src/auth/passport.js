// ─────────────────────────────────────────────────────────────────────────────
// FILE: config/passport.js
//
// Registers all 4 OAuth strategies with Passport.
// Import this file ONCE in app.js — it self-registers via side effect.
//
// NOTE: No serializeUser / deserializeUser needed because this project
// uses JWT (stateless). Passport sessions are disabled in app.js.
// ─────────────────────────────────────────────────────────────────────────────
import passport from 'passport';
import User from '../models/User.js';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as FacebookStrategy } from 'passport-facebook';
import { Strategy as TwitterStrategy } from 'passport-twitter';
import AppleStrategy from 'passport-apple';


const { ROLES, MODES, ACCOUNT_STATUS } = User;

// ─────────────────────────────────────────────────────────────────────────────
// SHARED HELPER: findOrCreateOAuthUser
//
// Called by every strategy's verify callback.
// Handles the 3 possible cases for any OAuth login:
//   Case 1 — Returning OAuth user          → load and return
//   Case 2 — Email matches existing account → link OAuth ID and return
//   Case 3 — Brand new user                → create account and return
//
// @param {Object} opts
//   provider    — 'google' | 'facebook' | 'twitter' | 'apple'
//   providerId  — the unique ID string from the provider (e.g. googleId)
//   email       — email returned by provider (may be null for Twitter)
//   displayName — full name from provider
//   avatarUrl   — profile photo URL from provider
//   done        — Passport done() callback
// ─────────────────────────────────────────────────────────────────────────────
const findOrCreateOAuthUser = async (opts) => {
  const { provider, providerId, email, displayName, avatarUrl, done } = opts;

  // Map provider name to the field name on User model
  const providerIdField = `${provider}Id`; // e.g. 'googleId', 'facebookId'

  try {
    // ── Case 1: User already linked this provider ─────────────────────────
    let user = await User.findOne({ [providerIdField]: providerId });
    if (user) {
      // Block banned or suspended accounts
      if (user.status === ACCOUNT_STATUS.BANNED) {
        return done(null, false, { message: 'Account has been permanently banned' });
      }
      if (user.status === ACCOUNT_STATUS.SUSPENDED) {
        return done(null, false, { message: 'Account is suspended' });
      }
      return done(null, user);
    }

    // ── Case 2: Email matches an existing local account ───────────────────
    // Link the OAuth provider to their existing account
    if (email) {
      user = await User.findOne({ email: email.toLowerCase() });
      if (user) {
        if (user.status === ACCOUNT_STATUS.BANNED) {
          return done(null, false, { message: 'Account has been permanently banned' });
        }
        if (user.status === ACCOUNT_STATUS.SUSPENDED) {
          return done(null, false, { message: 'Account is suspended' });
        }

        // Link this provider to their existing account
        user[providerIdField] = providerId;
        if (!user.oauthAvatarUrl && avatarUrl) {
          user.oauthAvatarUrl = avatarUrl;
        }
        // Mark email as verified — provider already confirmed it
        user.isEmailVerified = true;
        if (user.status === ACCOUNT_STATUS.PENDING_VERIFICATION) {
          user.status = ACCOUNT_STATUS.ACTIVE;
        }
        await user.save({ validateBeforeSave: false });
        return done(null, user);
      }
    }

    // ── Case 3: Completely new user ───────────────────────────────────────
    // Build a username from displayName, fall back to provider+id
    let baseUsername = displayName
      ? displayName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 20)
      : `${provider}_user`;

    // Ensure username is unique — append random suffix if taken
    let username = baseUsername;
    let attempts = 0;
    while (await User.findOne({ username })) {
      username = `${baseUsername}_${Math.floor(1000 + Math.random() * 9000)}`;
      if (++attempts > 10) username = `${provider}_${Date.now()}`;
    }

    // New OAuth users need onboarding (to collect dateOfBirth)
    // because providers don't share birth dates.
    // needsOnboarding = true will tell the frontend to redirect them.
    const newUserData = {
      username,
      email: email ? email.toLowerCase() : null,
      authProvider: provider,
      [providerIdField]: providerId,
      oauthAvatarUrl: avatarUrl || null,
      isEmailVerified: !!email, // provider-verified email counts as verified
      role: ROLES.USER,
      mode: MODES.NORMAL,
      needsOnboarding: true, // must complete DOB + terms before full access
      status: email ? ACCOUNT_STATUS.ACTIVE : ACCOUNT_STATUS.PENDING_VERIFICATION,
      // dateOfBirth intentionally omitted — collected in onboarding step
    };

    user = await User.create(newUserData);
    return done(null, user);

  } catch (err) {
    return done(err, false);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGY 1: Google
//
// Scopes: profile (name, photo) + email
// Docs: https://developers.google.com/identity/protocols/oauth2
// Console: https://console.developers.google.com
//
// Callback URL to register in Google Console:
//   Development:  http://localhost:5000/api/oauth/google/callback
//   Production:   https://yourdomain.com/api/oauth/google/callback
// ─────────────────────────────────────────────────────────────────────────────
console.log("Checking Callback URL:", `${process.env.OAUTH_CALLBACK_BASE_URL}/api/oauth/google/callback`);


passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${process.env.OAUTH_CALLBACK_BASE_URL}/api/oauth/google/callback`,
      userProfileURL: 'https://www.googleapis.com/oauth2/v3/userinfo',
      tokenURL: 'https://oauth2.googleapis.com/token',
      authorizationURL: 'https://accounts.google.com/o/oauth2/v2/auth',
      proxy: true,
      scope: ['profile', 'email'],
    },
    async (accessToken, refreshToken, profile, done) => {
      const email = profile.emails?.[0]?.value || null;
      const avatarUrl = profile.photos?.[0]?.value || null;
      const displayName = profile.displayName || profile.name?.givenName || 'User';

      await findOrCreateOAuthUser({
        provider: 'google',
        providerId: profile.id,
        email,
        displayName,
        avatarUrl,
        done,
      });
    }
  )
);

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGY 2: Facebook
//
// Scopes: email, public_profile
// Docs: https://developers.facebook.com/docs/facebook-login
// Console: https://developers.facebook.com/apps
//
// IMPORTANT: Enable "Email" permission in your Facebook App's permissions page.
// Callback URL to register:
//   Development:  http://localhost:5000/api/auth/facebook/callback
//   Production:   https://yourdomain.com/api/auth/facebook/callback
// ─────────────────────────────────────────────────────────────────────────────
passport.use(
  new FacebookStrategy(
    {
      clientID: process.env.FACEBOOK_APP_ID,
      clientSecret: process.env.FACEBOOK_APP_SECRET,
      callbackURL: `${process.env.OAUTH_CALLBACK_BASE_URL}/api/oauth/facebook/callback`,
      profileFields: ['id', 'emails', 'name', 'displayName', 'photos'],
      scope: ['email'],
    },
    async (accessToken, refreshToken, profile, done) => {
      const email = profile.emails?.[0]?.value || null;
      const avatarUrl = profile.photos?.[0]?.value || null;
      const displayName =
        profile.displayName ||
        `${profile.name?.givenName || ''} ${profile.name?.familyName || ''}`.trim() ||
        'User';

      await findOrCreateOAuthUser({
        provider: 'facebook',
        providerId: profile.id,
        email,
        displayName,
        avatarUrl,
        done,
      });
    }
  )
);

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGY 3: Twitter (X)
//
// Uses OAuth 1.0a (NOT OAuth 2.0 — different from the others).
// IMPORTANT: Twitter does NOT return email by default.
//   To get email: apply for "Elevated" access at developer.twitter.com
//   and enable "Request email address from users" in your app settings.
//
// Docs: https://developer.twitter.com/en/docs/authentication/oauth-1-0a
// Console: https://developer.twitter.com/en/portal/projects
//
// Callback URL to register:
//   Development:  http://localhost:5000/api/auth/twitter/callback
//   Production:   https://yourdomain.com/api/auth/twitter/callback
// ─────────────────────────────────────────────────────────────────────────────
passport.use(
  new TwitterStrategy(
    {
      consumerKey: process.env.TWITTER_CONSUMER_KEY,
      consumerSecret: process.env.TWITTER_CONSUMER_SECRET,
      callbackURL: `${process.env.OAUTH_CALLBACK_BASE_URL}/api/oauth/twitter/callback`,
      includeEmail: true, // Only works if you have Elevated access + email permission
    },
    async (token, tokenSecret, profile, done) => {
      // Twitter may return null email — handled inside findOrCreateOAuthUser
      const email = profile.emails?.[0]?.value || null;
      const avatarUrl = profile.photos?.[0]?.value?.replace('_normal', '') || null; // get full size
      const displayName = profile.displayName || profile.username || 'User';

      await findOrCreateOAuthUser({
        provider: 'twitter',
        providerId: profile.id,
        email,
        displayName,
        avatarUrl,
        done,
      });
    }
  )
);

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGY 4: Apple (Sign in with Apple)
//
// Apple is the most complex provider:
//   - Requires Apple Developer account ($99/year)
//   - Needs a .p8 private key file (downloaded from developer.apple.com)
//   - Apple ONLY sends email on the very first login — save it immediately
//   - Uses JWT-based client secrets that need refreshing every 6 months
//
// Setup steps:
//   1. Create App ID at developer.apple.com with "Sign in with Apple" capability
//   2. Create Service ID — this is your clientID (e.g. com.yourapp.signin)
//   3. Generate a private key (.p8 file) — download and store in /config/
//   4. Set APPLE_PRIVATE_KEY_PATH in .env to the path of your .p8 file
//
// Callback URL to register in Apple Console:
//   https://yourdomain.com/api/auth/apple/callback   (HTTPS required — no localhost)
// ─────────────────────────────────────────────────────────────────────────────
passport.use(
  new AppleStrategy(
    {
      clientID: process.env.APPLE_CLIENT_ID,           // Your Service ID (e.g. com.yourapp.signin)
      teamID: process.env.APPLE_TEAM_ID,               // 10-char Team ID from developer.apple.com
      keyID: process.env.APPLE_KEY_ID,                 // Key ID from your .p8 file
      privateKeyLocation: process.env.APPLE_PRIVATE_KEY_PATH, // Path to .p8 file
      callbackURL: `${process.env.OAUTH_CALLBACK_BASE_URL}/api/oauth/apple/callback`,
      passReqToCallback: false,
      scope: ['name', 'email'],
    },
    async (accessToken, refreshToken, idToken, profile, done) => {
      // Apple sends email in profile.email (first login only)
      // On subsequent logins, profile.email is undefined — only profile.id is available
      const email = profile.email || null;

      // Apple sometimes provides name in profile.name (first login only)
      const displayName = profile.name
        ? `${profile.name.firstName || ''} ${profile.name.lastName || ''}`.trim()
        : 'Apple User';

      // Apple does not provide a profile photo
      await findOrCreateOAuthUser({
        provider: 'apple',
        providerId: profile.id,
        email,
        displayName,
        avatarUrl: null, // Apple never provides a photo
        done,
      });
    }
  )
);

export default passport
