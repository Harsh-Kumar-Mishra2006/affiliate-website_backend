// config/cloudinary.js
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure Cloudinary Storage for Products
const productStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'products',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    transformation: [
      { width: 800, height: 800, crop: 'limit' },
      { quality: 'auto' },
      { fetch_format: 'auto' }
    ],
  },
});

// Configure Cloudinary Storage for Payment Screenshots
const paymentStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'payments',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'],
    transformation: [
      { width: 1200, height: 1200, crop: 'limit' },
      { quality: 'auto' },
      { fetch_format: 'auto' }
    ],
  },
});

// Multer upload middleware for products
const uploadProduct = multer({
  storage: productStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(file.originalname.toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed!'));
  },
});

// Multer upload middleware for payments
const uploadPayment = multer({
  storage: paymentStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit for payment screenshots
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|pdf/;
    const extname = allowedTypes.test(file.originalname.toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only image and PDF files are allowed!'));
  },
});

// Cloudinary utility functions
const cloudinaryUtils = {
  // Upload single image
  uploadImage: async (filePath, options = {}) => {
    try {
      const result = await cloudinary.uploader.upload(filePath, {
        folder: options.folder || 'products',
        ...options
      });
      return result;
    } catch (error) {
      console.error('Cloudinary upload error:', error);
      throw error;
    }
  },

  // Upload multiple images
  uploadMultipleImages: async (files, options = {}) => {
    try {
      const uploadPromises = files.map(file => 
        cloudinary.uploader.upload(file.path, {
          folder: options.folder || 'products',
          ...options
        })
      );
      const results = await Promise.all(uploadPromises);
      return results;
    } catch (error) {
      console.error('Cloudinary multiple upload error:', error);
      throw error;
    }
  },

  // Upload payment screenshot
  uploadPaymentScreenshot: async (filePath, options = {}) => {
    try {
      const result = await cloudinary.uploader.upload(filePath, {
        folder: 'payments',
        ...options
      });
      return result;
    } catch (error) {
      console.error('Cloudinary payment upload error:', error);
      throw error;
    }
  },

  // Delete image
  deleteImage: async (publicId) => {
    try {
      const result = await cloudinary.uploader.destroy(publicId);
      return result;
    } catch (error) {
      console.error('Cloudinary delete error:', error);
      throw error;
    }
  },

  // Get image URL with transformations
  getOptimizedUrl: (publicId, options = {}) => {
    return cloudinary.url(publicId, {
      width: options.width || 800,
      height: options.height || 800,
      crop: 'limit',
      quality: 'auto',
      fetch_format: 'auto',
      ...options
    });
  }
};

module.exports = {
  cloudinary,
  cloudinaryUtils,
  uploadProduct,
  uploadPayment,
  productStorage,
  paymentStorage
};