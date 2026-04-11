import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const cleanup = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI is not defined in .env');
    }
    
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected.');

    const db = mongoose.connection.db;
    const users = db.collection('users');

    console.log('Searching for documents with null OAuth IDs...');
    const result = await users.updateMany(
      { 
        $or: [
          { googleId: null },
          { facebookId: null },
          { twitterId: null },
          { appleId: null }
        ]
      },
      { 
        $unset: { 
          googleId: "", 
          facebookId: "", 
          twitterId: "", 
          appleId: "" 
        } 
      }
    );

    console.log(`Successfully updated ${result.modifiedCount} documents.`);
    console.log('Cleanup complete.');
    process.exit(0);
  } catch (error) {
    console.error('Cleanup ERROR:', error.message);
    process.exit(1);
  }
};

cleanup();
