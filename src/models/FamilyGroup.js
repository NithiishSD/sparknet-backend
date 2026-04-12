import mongoose from 'mongoose';

const familyGroupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Family group name is required'],
    trim: true,
    maxlength: 100,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  members: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role:   { type: String, enum: ['admin', 'member'], default: 'member' },
  }],
  challenges: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Challenge',
  }],
}, { timestamps: true });

// Fast lookup: all groups a user belongs to
familyGroupSchema.index({ 'members.userId': 1 });

export default mongoose.model('FamilyGroup', familyGroupSchema);
