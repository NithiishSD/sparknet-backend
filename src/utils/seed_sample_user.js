import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

import User from '../models/User.js';
import Post from '../models/Post.js';
import Profile from '../models/Profile.js';
import PrivacySettings from '../models/PrivacySettings.js';
import ActivitySummary from '../models/ActivitySummary.js';

const DEMO_USER = {
  username: 'Astra_Demo',
  email: 'astra@sparknet.demo',
  password: 'Password123!',
  role: 'user',
  status: 'active',
  isEmailVerified: true,
  dateOfBirth: new Date('2000-01-01'),
  termsAcceptedAt: new Date(),
};

const SAMPLE_POSTS = [
  {
    content_text: "Captured this stunning view of the Martian colony simulator last night. The neon glow of the hydroponics bay is just mesmerizing! 🌌🚀 #AstraDemo #MarsMission #FutureTech",
    media_url: "https://images.unsplash.com/photo-1614728263952-84ea256f9679",
    tags: ['astronomy', 'tech', 'space'],
  },
  {
    content_text: "Deep Sea Exploration: Found some incredible bioluminescent creatures at 4000m depth. Life truly finds a way in the dark. 🌊✨",
    media_url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    tags: ['nature', 'exploration', 'science'],
  },
  {
    content_text: "The bridge between neural networks and organic consciousness is narrowing every day. Are we ready for the next evolution? 🧬🧠",
    media_url: "https://images.unsplash.com/photo-1677442136019-21780ecad995",
    tags: ['ai', 'future', 'evolution'],
  }
];

const seedDemo = async () => {
  try {
    console.log('🚀 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected.');

    // 1. Check if demo user exists
    let user = await User.findOne({ email: DEMO_USER.email });
    if (!user) {
      console.log('👤 Creating demo user: Astra_Demo...');
      user = await User.create(DEMO_USER);
      
      // Initialize supporting models
      await Profile.create({
        user: user._id,
        displayName: 'ASTRA VOYAGER',
        bio: 'Digital explorer navigating the intersection of deep tech and organic life. Join the voyage. 🚀',
        interests: ['space', 'ai', 'deep-sea'],
      });
      await PrivacySettings.create({ user: user._id, profileVisibility: 'public' });
      await ActivitySummary.create({ user: user._id, postCount: 0 });
    } else {
      console.log('👤 Demo user already exists.');
    }

    // 2. Always refresh sample posts (delete old ones first)
    console.log('🗑️  Removing stale demo posts...');
    await Post.deleteMany({ user: user._id });

    console.log('🖼️  Generating sample posts...');
    for (const postData of SAMPLE_POSTS) {
      await Post.create({ ...postData, user: user._id, visibility: 'public' });
      await ActivitySummary.findOneAndUpdate({ user: user._id }, { $inc: { postCount: 1 } });
      console.log(`✅ Post created: ${postData.tags[0]}...`);
    }

    console.log('\n✨ Seeding successful! Log in or refresh your feed to see the new content.');
    console.log('Demo Account: astra@sparknet.demo / Password123!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  }
};

seedDemo();
