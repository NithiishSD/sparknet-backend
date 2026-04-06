import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema({
  reporter_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  target_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true // Refers to either a Post or a Comment
  },
  type: {
    type: String,
    enum: ['post', 'comment'],
    required: true
  },
  reason: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  status: {
    type: String,
    enum: ['pending', 'reviewed', 'resolved'],
    default: 'pending'
  }
}, { timestamps: true });

reportSchema.index({ reporter_id: 1, target_id: 1, type: 1 }, { unique: true });

export default mongoose.model('Report', reportSchema);
