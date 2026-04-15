import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/authdb", {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('CRITICAL: MongoDB Connection Failure');
    console.error(`Error Message: ${error.message}`);
    if (error.code) console.error(`Error Code: ${error.code}`);

    if (error.message.includes('SSL') || error.message.includes('TLS')) {
      console.warn('HINT: This looks like an SSL handshake error. Ensure your IP is whitelisted in MongoDB Atlas.');
    }

    process.exit(1);
  }
};

export default connectDB;
