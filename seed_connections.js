import mongoose from 'mongoose';

async function seed() {
  await mongoose.connect('mongodb+srv://Sparknet:Sparknet123@sparknet.mkvj5q4.mongodb.net/authdb?retryWrites=true&w=majority&appName=sparknet');
  const User = mongoose.model('User', new mongoose.Schema({}, {strict: false}), 'users');
  const Connection = mongoose.model('Connection', new mongoose.Schema({}, {strict: false}), 'connections');
  
  let users = await User.find({});
  // Ensure we have at least one current user
  if (users.length === 0) {
     console.log('No users found at all in DB, you should login to the frontend first.');
     process.exit(0);
  }

  const currentUser = users[0]; // Assume the first user is the one they are testing with

  // Create or find Demobot
  let demoBot = await User.findOne({ username: 'Demo_Bot' });
  if (!demoBot) {
     const res = await User.create({
        username: 'Demo_Bot',
        email: 'demobot@sparknet.local',
        role: 'user',
        status: 'active',
        isEmailVerified: true,
        authProvider: 'local'
     });
     demoBot = res;
     console.log('Created Demo_Bot!');
  }

  // Mutually follow
  await Connection.updateOne(
    { follower: currentUser._id, following: demoBot._id },
    { $set: { status: 'accepted' } },
    { upsert: true }
  );
  await Connection.updateOne(
    { follower: demoBot._id, following: currentUser._id },
    { $set: { status: 'accepted' } },
    { upsert: true }
  );
  console.log(`Created mutual connection between ${currentUser.username} and ${demoBot.username}`);
  
  process.exit(0);
}

seed();
