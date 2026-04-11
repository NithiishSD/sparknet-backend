import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const ROLES = {
  CHILD: 'child',
  USER: 'user',
  ADMIN: 'admin',
};

const MODES = {
  NORMAL: 'normal',
  YOUTH: 'youth',
};

const ACCOUNT_STATUS = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  BANNED: 'banned',
  PENDING_VERIFICATION: 'pending_verification',
  PENDING_GUARDIAN_APPROVAL: 'pending_guardian_approval',
};

// ─────────────────────────────────────────────────────────────
// Sub-schemas
// ─────────────────────────────────────────────────────────────

const sessionSchema = new mongoose.Schema({
  refreshToken: String,
  device: String,
  ip: String,
  createdAt: { type: Date, default: Date.now },
  lastUsed: { type: Date, default: Date.now },
});

// Per-child controls stored on the guardian (user side)
const childLinkSchema = new mongoose.Schema({
  childId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  linkedAt: { type: Date, default: Date.now },
  approvedAt: { type: Date },
  controls: {
    // ─── Messaging Controls ──────────────────────────────────
    // Master switch: false = all messaging blocked regardless of allowlist
    messagingAllowed: { type: Boolean, default: false },

    // Allowlist-based messaging: if populated, child can ONLY message these users.
    // An empty array + messagingAllowed=true means no contact restriction (any mutual connection).
    // The guardian adds/removes User ObjectIds here via PATCH /guardian/children/:id/controls
    allowedMessagingContacts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    // ─── Social Controls ─────────────────────────────────────
    friendRequestsAllowed: { type: Boolean, default: false },

    // ─── Content Controls ────────────────────────────────────
    // 'strict'   → only low-risk posts (risk_score < 0.3)
    // 'moderate' → low + medium risk (risk_score < 0.6)
    // 'relaxed'  → all non-flagged content
    contentLevel: { type: String, enum: ['strict', 'moderate', 'relaxed'], default: 'strict' },

    // ─── Screen Time Controls ────────────────────────────────
    screenTimeLimitMinutes: { type: Number, default: 120, min: 0, max: 1440 },
    screenTimeEnabled: { type: Boolean, default: true },

    // Scheduled access hours — child can only log in between these hours (0–23, inclusive).
    // Defaults span the full day so existing linked accounts are not broken.
    scheduledHoursStart: { type: Number, default: 0, min: 0, max: 23 },
    scheduledHoursEnd:   { type: Number, default: 23, min: 0, max: 23 },
  },
});

// ─────────────────────────────────────────────────────────────
// Main User Schema
// ─────────────────────────────────────────────────────────────

const userSchema = new mongoose.Schema(
  {
    // ─── Identity ─────────────────────────────────────────────
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
    },
    password: {
      type: String,
      required: function () {
        return this.authProvider === 'local';
      },
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,
    },
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
    },

    // ─── Role & Mode ───────────────────────────────────────────
    // ARCHITECTURE NOTE:
    // Only 3 roles: child / user / admin
    // "Parent/guardian" is NOT a role — it is a CAPABILITY.
    // A user becomes a guardian automatically when childLinks.length > 0.
    // No role change, no separate registration, no identity confusion.
    role: {
      type: String,
      enum: Object.values(ROLES),
      default: ROLES.USER,
    },
    mode: {
      type: String,
      enum: Object.values(MODES),
      default: MODES.NORMAL,
    },
    googleId: {
      type: String
    },
    needsOnboarding: {
      type: Boolean,
      default: true,
    },
    // ─── Age & Legal ───────────────────────────────────────────
    dateOfBirth: { type: Date }, // Collected during onboarding for OAuth users
    termsAcceptedAt: { type: Date },
    privacyAcceptedAt: { type: Date },

    // ─── Account Status ────────────────────────────────────────
    status: {
      type: String,
      enum: Object.values(ACCOUNT_STATUS),
      default: ACCOUNT_STATUS.PENDING_VERIFICATION,
    },
    trustScore: {
      type: Number,
      default: 100, // 0 to 100
      min: 0,
      max: 100,
    },
    interests: [{
      type: String,
      trim: true,
      lowercase: true
    }],
    
    // ─── Gamification ──────────────────────────────────────────
    points: {
      type: Number,
      default: 0
    },
    badges: [{
      type: String
    }],

    // ─── Notification Preferences ──────────────────────────────
    notificationPreferences: {
      likes: { type: Boolean, default: true },
      comments: { type: Boolean, default: true },
      messages: { type: Boolean, default: true },
      system: { type: Boolean, default: true }
    },

    // ─── Email Verification ────────────────────────────────────
    isEmailVerified: { type: Boolean, default: false },
    emailVerificationToken: { type: String, select: false },
    emailVerificationExpires: { type: Date, select: false },

    // ─── Password Reset ────────────────────────────────────────
    passwordResetToken: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },

    // ─────────────────────────────────────────────────────────
    // GUARDIAN CAPABILITY FIELDS (role = user side)
    // Guardian controls are stored here, alongside per-child settings.
    // If childLinks.length > 0 → guardian dashboard unlocked automatically.
    // ─────────────────────────────────────────────────────────
    childLinks: [childLinkSchema],
    //this is for oauth users 
    authProvider: {
      type: String,
      enum: ['local', 'google', 'facebook', 'twitter', 'apple'],
      default: 'local',
    },

    // ─── Child fields (role = child side) ─────────────────────
    guardianId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    guardianApprovedAt: { type: Date },
    guardianInviteToken: { type: String, select: false },
    guardianInviteExpires: { type: Date, select: false },
    guardianInviteEmail: { type: String },

    // ─── Security ──────────────────────────────────────────────
    loginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },
    sessions: [sessionSchema],

    // ─── Activity Tracking ─────────────────────────────────────
    lastLoginAt: { type: Date },
    lastLoginIp: { type: String },
    loginHistory: [
      {
        ip: String,
        device: String,
        timestamp: { type: Date, default: Date.now },
        success: Boolean,
      },
    ],
   
    facebookId: {
      type: String
    },
    twitterId: {
      type: String
    },
    appleId: {
      type: String
    },
   
    // ─── OAuth Onboarding Flag ─────────────────────────────────────────────────
    // True when an OAuth user hasn't yet provided their dateOfBirth.
    // Used to redirect them to the onboarding page after first OAuth login.
    // Set to false once they complete onboarding.
    
   
    // ─── Avatar from OAuth Provider ───────────────────────────────────────────
    // Stores the avatar URL the provider returns (Google/Facebook profile photo).
    // Later overwritten when the user uploads their own photo.
    oauthAvatarUrl: {
      type: String,
      default: null,
    },
  },

  { timestamps: true }
);

// Add sparse unique indexes for OAuth provider IDs
userSchema.index({ googleId: 1 },   { sparse: true, unique: true });
userSchema.index({ facebookId: 1 }, { sparse: true, unique: true });
userSchema.index({ twitterId: 1 },  { sparse: true, unique: true });
userSchema.index({ appleId: 1 },    { sparse: true, unique: true });

// ─────────────────────────────────────────────────────────────
// Virtuals
// ─────────────────────────────────────────────────────────────

userSchema.virtual('age').get(function () {
  const today = new Date();
  const birth = new Date(this.dateOfBirth);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
});

userSchema.virtual('isLocked').get(function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// CAPABILITY: derived from data, not from role field
userSchema.virtual('isGuardian').get(function () {
  return this.role === ROLES.USER && Array.isArray(this.childLinks) && this.childLinks.length > 0;
});

userSchema.virtual('linkedChildrenCount').get(function () {
  return this.childLinks?.length || 0;
});

// ─────────────────────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────────────────────

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const rounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;
  this.password = await bcrypt.hash(this.password, rounds);
  next();
});

// ─────────────────────────────────────────────────────────────
// Instance Methods
// ─────────────────────────────────────────────────────────────

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.incrementLoginAttempts = async function () {
  const maxAttempts = parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5;
  const lockMinutes = parseInt(process.env.LOCK_TIME_MINUTES) || 30;
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({ $set: { loginAttempts: 1 }, $unset: { lockUntil: 1 } });
  }
  const updates = { $inc: { loginAttempts: 1 } };
  if (this.loginAttempts + 1 >= maxAttempts && !this.isLocked) {
    updates.$set = { lockUntil: new Date(Date.now() + lockMinutes * 60 * 1000) };
  }
  return this.updateOne(updates);
};

userSchema.methods.resetLoginAttempts = function () {
  return this.updateOne({ $set: { loginAttempts: 0 }, $unset: { lockUntil: 1 } });
};

userSchema.methods.generateEmailVerificationToken = function () {
  const token = crypto.randomBytes(32).toString('hex');
  this.emailVerificationToken = crypto.createHash('sha256').update(token).digest('hex');
  const hours = parseInt(process.env.VERIFICATION_TOKEN_EXPIRES_HOURS) || 24;
  this.emailVerificationExpires = new Date(Date.now() + hours * 60 * 60 * 1000);
  return token;
};

userSchema.methods.generatePasswordResetToken = function () {
  const token = crypto.randomBytes(32).toString('hex');
  this.passwordResetToken = crypto.createHash('sha256').update(token).digest('hex');
  const minutes = parseInt(process.env.RESET_TOKEN_EXPIRES_MINUTES) || 60;
  this.passwordResetExpires = new Date(Date.now() + minutes * 60 * 1000);
  return token;
};

userSchema.methods.generateGuardianInviteToken = function (guardianEmail) {
  const token = crypto.randomBytes(32).toString('hex');
  this.guardianInviteToken = crypto.createHash('sha256').update(token).digest('hex');
  const hours = parseInt(process.env.GUARDIAN_INVITE_EXPIRES_HOURS) || 48;
  this.guardianInviteExpires = new Date(Date.now() + hours * 60 * 60 * 1000);
  this.guardianInviteEmail = guardianEmail;
  return token;
};

// ─────────────────────────────────────────────────────────────
// Statics
// ─────────────────────────────────────────────────────────────

userSchema.statics.ROLES = ROLES;
userSchema.statics.MODES = MODES;
userSchema.statics.ACCOUNT_STATUS = ACCOUNT_STATUS;

export default mongoose.model('User', userSchema);
