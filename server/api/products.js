const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();

// Validation middleware
const validateProduct = (req, res, next) => {
  const { title, price, description } = req.body;
  if (!title || !price || !description) {
    return res.status(400).json({ message: 'Title, price, and description are required' });
  }
  if (title.length < 3 || title.length > 100) {
    return res.status(400).json({ message: 'Title must be between 3 and 100 characters' });
  }
  if (description.length < 10) {
    return res.status(400).json({ message: 'Description must be at least 10 characters long' });
  }
  if (isNaN(price) || price <= 0) {
    return res.status(400).json({ message: 'Price must be a positive number' });
  }
  next();
};

// Configure multer for handling file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../../public/uploads/products');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Generate a clean filename with timestamp and original extension
    const timestamp = Date.now();
    const ext = path.extname(file.originalname).toLowerCase();
    const filename = `product-${timestamp}${ext}`;
    cb(null, filename);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only image files
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.'));
    }
  }
});

// Product Schema
const productSchema = new mongoose.Schema({
  title: { type: String, required: true },
  tagline: String,
  price: { type: Number, required: true },
  category: { type: String, required: true },
  description: { type: String, required: true },
  features: [String],
  specifications: [String],
  tags: [String],
  images: [String],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Product = mongoose.model('Product', productSchema);

// Get a single product by ID
router.get('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID format',
        error: 'The provided product ID is not in the correct format'
      });
    }

    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
        error: 'The requested product could not be found in the database'
      });
    }

    // Set response headers
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-cache');
    
    // Send successful response
    res.json({
      success: true,
      data: product
    });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch product',
      error: process.env.NODE_ENV === 'development' 
        ? `Server error: ${error.message}` 
        : 'An unexpected error occurred while fetching the product'
    });
  }
});

// Get all products with optional filtering and pagination
router.get('/', async (req, res) => {
  try {
    const { category, page = 1, limit = 10 } = req.query;
    const query = category && category !== 'all' ? { category } : {};
    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
      Product.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Product.countDocuments(query)
    ]);

    res.json({
      products,
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / limit),
      totalProducts: total
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ message: 'Failed to fetch products' });
  }
});

// Create a new product
router.post('/', upload.array('images', 10), validateProduct, async (req, res) => {
  let uploadedFiles = [];
  try {
    const { title, tagline, price, category, description, features, specifications, tags } = req.body;
    uploadedFiles = req.files || [];
    // Store just the filename in the database, not the full path
    const images = uploadedFiles.map(file => file.filename);

    const product = new Product({
      title,
      tagline,
      price: parseFloat(price),
      category,
      description,
      features: features ? features.split(',').map(feature => feature.trim()) : [],
      specifications: specifications ? specifications.split(',').map(spec => spec.trim()) : [],
      tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
      images
    });

    // Set timeout for database operation
    const timeoutMs = 30000; // 30 seconds
    const savedProduct = await Promise.race([
      product.save(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Database operation timed out')), timeoutMs)
      )
    ]);

    res.status(201).json(savedProduct);
  } catch (error) {
    // Clean up uploaded files if save fails
    for (const file of uploadedFiles) {
      const filePath = path.join(__dirname, '../../public/uploads/products', file.filename);
      try {
        await fs.promises.unlink(filePath);
      } catch (unlinkError) {
        console.error('Error deleting file:', unlinkError);
      }
    }

    console.error('Product creation error:', error);
    const statusCode = error.message === 'Database operation timed out' ? 504 : 500;
    res.status(statusCode).json({
      message: error.message || 'Failed to create product',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Delete a product
router.delete('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID format'
      });
    }

    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Delete associated images
    for (const imagePath of product.images) {
      const fullPath = path.join(__dirname, '../../public', imagePath);
      try {
        if (fs.existsSync(fullPath)) {
          await fs.promises.unlink(fullPath);
        }
      } catch (unlinkError) {
        console.error('Error deleting image file:', unlinkError);
      }
    }

    await Product.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete product',
      error: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred'
    });
  }
});

// Update a product
router.put('/:id', upload.array('images', 10), validateProduct, async (req, res) => {
  try {
    const { title, tagline, price, category, description, features, specifications, tags } = req.body;
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Handle new images - store just the filename
    const newImages = req.files ? req.files.map(file => file.filename) : [];
    const updatedImages = [...(product.images || []), ...newImages];

    product.title = title;
    product.tagline = tagline;
    product.price = parseFloat(price);
    product.category = category;
    product.description = description;
    product.features = features ? features.split(',').map(feature => feature.trim()) : [];
    product.specifications = specifications ? specifications.split(',').map(spec => spec.trim()) : [];
    product.tags = tags ? tags.split(',').map(tag => tag.trim()) : [];
    product.images = updatedImages;
    product.updatedAt = Date.now();

    const updatedProduct = await product.save();
    res.json(updatedProduct);
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ message: error.message || 'Failed to update product' });
  }
});

module.exports = router;