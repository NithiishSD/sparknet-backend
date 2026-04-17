import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

// Cloudinary Configuration
if (process.env.CLOUDINARY_URL) {
  // If CLOUDINARY_URL is present, it will automatically parse the cloud_name, api_key, and api_secret.
  cloudinary.config(true); 
} else {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

// For User Avatars
const avatarStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'sparknet-avatars',
    allowed_formats: ['jpg', 'png', 'jpeg', 'webp'],
    transformation: [{ width: 500, height: 500, crop: 'limit' }],
    public_id: (req, file) => `${req.user._id}-${Date.now()}`,
  },
});

// For Post Media (Images & Videos)
const postStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'sparknet-posts',
    resource_type: 'auto',
    allowed_formats: ['jpg', 'png', 'jpeg', 'webp', 'gif', 'mp4', 'webm'],
    public_id: (req, file) => `post-${req.user._id}-${Date.now()}`,
  },
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
    cb(null, true);
  } else {
    cb(new Error('Not supported! Please upload images or videos only.'), false);
  }
};

export const uploadAvatar = multer({
  storage: avatarStorage,
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }
});

export const uploadPostMedia = multer({
  storage: postStorage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB for post media (images + video)
});