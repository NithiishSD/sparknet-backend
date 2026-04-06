import mongoose from 'mongoose';
import 'dotenv/config';
import User from '../models/User.js';
import Post from '../models/Post.js';
import Profile from '../models/Profile.js';
import PrivacySettings from '../models/PrivacySettings.js';
import ActivitySummary from '../models/ActivitySummary.js';

const seedData = async () => {
  try {
    console.log('🚀 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected.');

    // 1. Clear existing data
    console.log('🧹 Cleaning database...');
    await Promise.all([
      User.deleteMany({}),
      Post.deleteMany({}),
      Profile.deleteMany({}),
      PrivacySettings.deleteMany({}),
      ActivitySummary.deleteMany({}),
    ]);

    // 2. Create Sample Users
    console.log('👤 Creating sample users...');
    const users = await User.create([
      {
        username: 'admin_spark',
        email: 'admin@sparknet.com',
        password: 'Password123!',
        role: 'admin',
        status: 'active',
        isEmailVerified: true,
        dateOfBirth: new Date('1990-01-01'),
        termsAcceptedAt: new Date(),
      },
      {
        username: 'johndoe',
        email: 'john@example.com',
        password: 'Password123!',
        role: 'user',
        status: 'active',
        isEmailVerified: true,
        dateOfBirth: new Date('1995-05-15'),
        termsAcceptedAt: new Date(),
      },
      {
        username: 'janeparent',
        email: 'jane@example.com',
        password: 'Password123!',
        role: 'user',
        status: 'active',
        isEmailVerified: true,
        dateOfBirth: new Date('1988-10-20'),
        termsAcceptedAt: new Date(),
      },
      {
        username: 'sparky_kid',
        email: 'kid@example.com',
        password: 'Password123!',
        role: 'child',
        mode: 'youth',
        status: 'active',
        isEmailVerified: true,
        dateOfBirth: new Date('2012-03-10'),
        termsAcceptedAt: new Date(),
      },
    ]);

    // 3. Initialize Profiles & Privacy for each user
    console.log('📝 Initializing profiles and privacy logic...');
    for (const user of users) {
      await Profile.create({
        user: user._id,
        displayName: user.username,
        bio: `Hello! I am ${user.username}, a proud member of the SparkNet community.`,
        interests: ['coding', 'innovation', 'safety'],
      });
      await PrivacySettings.create({ user: user._id });
      await ActivitySummary.create({ user: user._id });
    }

    // 4. Create Sample Posts
    console.log('🖼️  Generating sample posts with images...');
    const postsData = [
      {
        user: users[1]._id,
        content_text: 'Just joined SparkNet! Excited to share my journey in backend development. 💻✨',
        tags: ['coding', 'webdev', 'backend'],
        media_url: 'https://images.unsplash.com/photo-1587620962725-abab7fe55159', // Coding
      },
      {
        user: users[2]._id,
        content_text: 'The mountains are calling. A beautiful weekend hike! 🏔️🌲',
        tags: ['nature', 'hiking', 'adventure'],
        media_url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b', // Mountains
      },
      {
        user: users[3]._id,
        content_text: 'Learning how to stay safe online today while playing games. 🛡️🎮',
        tags: ['education', 'gaming', 'safety'],
        risk_score: 0.1,
      },
      {
        user: users[0]._id,
        content_text: 'Welcome to SparkNet! This is a official platform update. We are committed to a safe digital space for everyone.',
        tags: ['announcement', 'sparknet', 'admin'],
        media_url: 'https://images.unsplash.com/photo-1557683316-973673baf926', // Abstract blue
      },
      {
        user: users[1]._id,
        content_text: 'Look at this amazing workspace setup I just finished! 🎨',
        tags: ['productivity', 'setup', 'design'],
        media_url: 'https://images.unsplash.com/photo-1497032628192-86f99bcd76bc', // Office
      },
    ];

    const posts = await Post.create(postsData);

    // 5. Update Activity Counts
    console.log('📊 Updating activity summaries...');
    for (const post of posts) {
      await ActivitySummary.findOneAndUpdate(
        { user: post.user },
        { $inc: { postCount: 1 } }
      );
    }

    console.log('✨ Seeding complete! SparkNet is ready.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  }
};

seedData();
