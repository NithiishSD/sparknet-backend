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

// For Post Media (Images)
const postStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'sparknet-posts',
    allowed_formats: ['jpg', 'png', 'jpeg', 'webp', 'gif'],
    transformation: [{ width: 1200, crop: 'limit' }], // Larger limit for posts
    public_id: (req, file) => `post-${req.user._id}-${Date.now()}`,
  },
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Not an image! Please upload only images.'), false);
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
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB for post images
});