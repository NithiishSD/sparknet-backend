import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import { apiLimiter } from './middleware/Ratelimiter.js';
import passport from './auth/passport.js';

// Import Route Modules
import authRoutes from './auth/routes/authroutes.js';
import oauthRoutes from './auth/routes/oauthroutes.js';
import profileRoutes from './auth/routes/profileRoutes.js';
import userRoutes from './users/routes/userRoutes.js';
import familyRoutes from './family/routes/familyRoutes.js';
import guardianRoutes from './guardian/routes/guardianroutes.js';
import contentRoutes from './content/routes/contentRoutes.js';
import adminRoutes from './admin/routes/adminrouter.js';

// New Modules
import challengeRoutes from './challenges/routes/challengeRoutes.js';
import gamificationRoutes from './gamification/routes/gamificationRoutes.js';
import moderationRoutes from './moderation/routes/moderationRoutes.js';
import analyticsRoutes from './analytics/routes/analyticsRoutes.js';
import notificationRoutes from './notifications/routes/notificationRoutes.js';
import messagingRoutes from './messaging/routes/messagingRoutes.js';

// Boot background event listeners
import './notifications/services/notificationService.js';

const app = express();

// Middleware Configuration
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cors({
  origin: process.env.CLIENT_URL || 'https://sparknet-frontend-vercel.vercel.app',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
}));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(passport.initialize());

if (process.env.NODE_ENV === 'production') {
  app.use(morgan('combined'));
  app.use(compression());
} else {
  app.use(morgan('dev'));
}

// Global API Limiter
app.use('/api', apiLimiter);

// API V1 Routes
const v1Router = express.Router();

v1Router.use('/auth', authRoutes);
v1Router.use('/oauth', oauthRoutes);
v1Router.use('/profiles', profileRoutes);
v1Router.use('/users', userRoutes);
v1Router.use('/family', familyRoutes);
v1Router.use('/guardian', guardianRoutes);
v1Router.use('/posts', contentRoutes);
v1Router.use('/challenges', challengeRoutes);
v1Router.use('/gamification', gamificationRoutes);
v1Router.use('/moderation', moderationRoutes);
v1Router.use('/admin', adminRoutes);
v1Router.use('/analytics', analyticsRoutes);
v1Router.use('/notifications', notificationRoutes);
v1Router.use('/messaging', messagingRoutes);

// Mount V1 Namespace
app.use('/api', v1Router);

// Base Health Check
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Server running', timestamp: new Date().toISOString() });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// Error Handler
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';

  if (process.env.NODE_ENV === 'production') {
    // Hide stack trace and internal details in production
    res.status(statusCode).json({
      success: false,
      message: statusCode === 500 ? 'Something went wrong on our end' : message
    });
  } else {
    console.error(err.stack);
    res.status(statusCode).json({
      success: false,
      message,
      stack: err.stack
    });
  }
});

export default app;
