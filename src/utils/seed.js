import mongoose from 'mongoose';
import 'dotenv/config';
import User from '../models/User.js';
import Post from '../models/Post.js';
import Profile from '../models/Profile.js';
import PrivacySettings from '../models/PrivacySettings.js';
import ActivitySummary from '../models/ActivitySummary.js';
import Challenge from '../models/Challenge.js';

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
      Challenge.deleteMany({}),
    ]);

    // 2. Create Users (covering all roles)
    console.log('👤 Creating sample users...');
    const users = await User.create([
      {
        username: 'admin',
        email: 'admin@sparknet.com',
        password: 'Password123!',
        role: 'admin',
        status: 'active',
        isEmailVerified: true,
        dateOfBirth: new Date('1990-01-01'),
        termsAcceptedAt: new Date(),
      },
      {
        username: 'guardian_john',
        email: 'guardian@sparknet.com',
        password: 'Password123!',
        role: 'user',
        status: 'active',
        isEmailVerified: true,
        dateOfBirth: new Date('1985-06-15'),
        termsAcceptedAt: new Date(),
      },
      {
        username: 'child_samuel',
        email: 'samuel@sparknet.com',
        password: 'Password123!',
        role: 'child',
        mode: 'youth',
        status: 'active',
        isEmailVerified: true,
        dateOfBirth: new Date('2014-04-10'),
        termsAcceptedAt: new Date(),
      },
      {
        username: 'regular_user',
        email: 'user@sparknet.com',
        password: 'Password123!',
        role: 'user',
        status: 'active',
        isEmailVerified: true,
        dateOfBirth: new Date('1998-11-20'),
        termsAcceptedAt: new Date(),
      },
    ]);

    // Link Guardian and Child
    const guardian = users[1];
    const child = users[2];
    
    guardian.childLinks = [{ childId: child._id, relationship: 'parent' }];
    child.guardianId = guardian._id;
    child.guardianApprovedAt = new Date();
    
    // Create follower relationships for testing feed
    guardian.following = [users[3]._id, users[0]._id];
    child.following = [guardian._id];
    
    await guardian.save();
    await child.save();

    // 3. Initialize Profiles & Privacy
    console.log('📝 Initializing profiles and privacy logic...');
    for (const user of users) {
      await Profile.create({
        user: user._id,
        displayName: user.username.replace('_', ' ').toUpperCase(),
        bio: `Hello! I am ${user.username}, a proud member of the SparkNet community.`,
        interests: ['coding', 'innovation', 'safety'],
      });
      await PrivacySettings.create({ 
        user: user._id,
        profileVisibility: user.role === 'child' ? 'private' : 'public',
      });
      await ActivitySummary.create({ user: user._id, postCount: 0 });
    }

    // 4. Create Sample Posts
    console.log('🖼️  Generating sample posts...');
    const postsData = [
      {
        user: users[0]._id, // Admin
        content_text: 'Welcome to SparkNet Multi-Role Demo! System is fully operational and telemetry is green. 🌍✨',
        tags: ['announcement', 'sparknet', 'admin'],
        media_url: 'https://images.unsplash.com/photo-1557683316-973673baf926',
        likes: [users[1]._id, users[2]._id]
      },
      {
        user: users[3]._id, // Regular User
        content_text: 'Just finished setting up my new workspace! What do you guys think? 🎨',
        tags: ['productivity', 'setup', 'design'],
        media_url: 'https://images.unsplash.com/photo-1497032628192-86f99bcd76bc',
        likes: [users[1]._id]
      },
      {
        user: users[1]._id, // Guardian
        content_text: 'Taking the kids to the park today. It is important to balance screen time with nature! 🌲☀️',
        tags: ['parenting', 'nature', 'wellness'],
      },
      {
        user: users[2]._id, // Child
        content_text: 'I just finished my first coding tutorial on SparkNet! It was so much fun. 🤖💻',
        tags: ['coding', 'learning', 'kids'],
        risk_score: 0.1,
      },
      {
        user: users[3]._id, // Regular User
        content_text: 'Here is a quick tip for React developers: always clean up your useEffects to prevent memory leaks! ⚛️⏱️',
        tags: ['react', 'webdev', 'tips'],
      }
    ];

    const posts = await Post.create(postsData);

    // Update Activity Summaries
    for (const post of posts) {
      await ActivitySummary.findOneAndUpdate(
        { user: post.user },
        { $inc: { postCount: 1 } }
      );
    }

    // 5. Create Challenges
    console.log('🏆 Generating Challenges...');
    const challenges = await Challenge.create([
      {
        title: 'Algorithmic Routine',
        description: 'Resolve one algorithmic puzzle per day for 7 consecutive cycles to master fundamental data structures.',
        points: 500,
        icon: 'terminal',
        category: 'coding',
        durationDays: 7,
      },
      {
        title: 'Telemetry Fasting',
        description: 'Maintain network uplink under 2 hours during the weekend cycle to promote digital wellbeing.',
        points: 1000,
        icon: 'spa',
        category: 'wellness',
        durationDays: 2,
      },
      {
        title: 'Unit Assistant',
        description: 'Provide operational solutions to 5 inquiries in the help index to assist your peers.',
        points: 300,
        icon: 'handshake',
        category: 'community',
        durationDays: 5,
      }
    ]);

    // Add some participants and leaderboard data
    const codingChallenge = challenges[0];
    codingChallenge.participants.push(
      { userId: users[3]._id, entry: 'function solve() { return true; }', aiScore: 85, voteScore: 10, score: 95, submittedAt: new Date() },
      { userId: users[1]._id, entry: 'const x = Math.random();', aiScore: 40, voteScore: 0, score: 40, submittedAt: new Date() }
    );
    codingChallenge.leaderboard = [
      { user: users[3]._id, aiScore: 85, voteScore: 10, score: 95 },
      { user: users[1]._id, aiScore: 40, voteScore: 0, score: 40 },
    ];
    await codingChallenge.save();

    console.log('✅ Seeding complete! SparkNet Demo Data is ready.');
    console.log('\n--- Test Accounts ---');
    console.log('Admin:    admin@sparknet.com    / Password123!');
    console.log('Guardian: guardian@sparknet.com / Password123!');
    console.log('Child:    samuel@sparknet.com   / Password123!');
    console.log('User:     user@sparknet.com     / Password123!');
    console.log('---------------------\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  }
};

seedData();
