import mongoose from 'mongoose';

const profileSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  displayName: { type: String, trim: true },
  bio: { type: String, maxlength: 500 },
  avatar: { type: String, default: 'default-avatar.png' },
  location: { type: String },
  interests: [{ type: String }],
  socialLinks: {
    twitter: String,
    github: String,
    linkedin: String
  }
}, { timestamps: true });

export default mongoose.model('Profile', profileSchema);