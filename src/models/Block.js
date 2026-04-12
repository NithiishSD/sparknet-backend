import mongoose from 'mongoose';

const blockSchema = new mongoose.Schema({
  blocker: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  blocked: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
}, { timestamps: true });

// Prevent duplicate block records
blockSchema.index({ blocker: 1, blocked: 1 }, { unique: true });
// Fast lookup: "has this user been blocked by anyone?"
blockSchema.index({ blocked: 1 });

export default mongoose.model('Block', blockSchema);
