const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { cloudinary, isConfigured } = require('../config/cloudinary');

let storage;

if (isConfigured) {
  // Cloudinary persists images outside the app's own filesystem, so they
  // survive a Render/Railway restart or redeploy (which wipes local disk).
  storage = new CloudinaryStorage({
    cloudinary,
    params: {
      folder: 'auction-app',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    },
  });
} else {
  // Local-disk fallback for quick local development without a Cloudinary
  // account. NOT suitable for production on Render/Railway free tiers -
  // see README "Image storage" section.
  const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  });
}

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  },
});

module.exports = upload;
