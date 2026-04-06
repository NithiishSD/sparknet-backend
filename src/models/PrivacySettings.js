import mongoose from 'mongoose';

const privacySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  profileVisibility: {
    type: String,
    enum: ['public', 'friends', 'private'],
    default: 'public'
  },
  allowMessaging: { type: Boolean, default: true },
  showLocation: { type: Boolean, default: false }
}, { timestamps: true });

export default mongoose.model('PrivacySettings', privacySchema);