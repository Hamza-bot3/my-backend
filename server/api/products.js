const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const router = express.Router();
const { upload, cloudinary } = require('../../config/cloudinary');

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
  images: [{
    url: String,
    public_id: String
  }],
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
  try {
    const { title, tagline, price, category, description, features, specifications, tags } = req.body;
    
    // Upload files to Cloudinary and get their URLs
    const uploadPromises = req.files ? req.files.map(file => 
      cloudinary.uploader.upload(file.path, {
        folder: 'products',
        resource_type: 'auto'
      })
    ) : [];

    const uploadedImages = await Promise.all(uploadPromises);
    
    const images = uploadedImages.map(result => ({
      url: result.secure_url,
      public_id: result.public_id
    }));

    const product = new Product({
      title,
      tagline,
      price: parseFloat(price),
      category,
      description,
      features: features ? JSON.parse(features) : [],
      specifications: specifications ? JSON.parse(specifications) : [],
      tags: tags ? JSON.parse(tags) : [],
      images
    });

    await product.save();
    
    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: product
    });
  } catch (error) {
    // If there's an error, try to delete any uploaded images
    if (req.files) {
      for (const file of req.files) {
        try {
          await cloudinary.uploader.destroy(file.filename);
        } catch (deleteError) {
          console.error('Error deleting uploaded image:', deleteError);
        }
      }
    }

    console.error('Error creating product:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create product',
      error: error.message
    });
  }
});

// Delete a product
router.delete('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Delete associated images from Cloudinary
    const deletePromises = product.images.map(image => {
      if (image.public_id) {
        return cloudinary.uploader.destroy(image.public_id)
          .catch(error => {
            console.error(`Error deleting image ${image.public_id}:`, error);
          });
      }
      return Promise.resolve();
    });

    await Promise.all(deletePromises);
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
      error: error.message
    });
  }
});

// Update a product
router.put('/:id', upload.array('images', 10), validateProduct, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const { title, tagline, price, category, description, features, specifications, tags, deletedImages } = req.body;

    // Delete images that were marked for deletion
    if (deletedImages && Array.isArray(deletedImages)) {
      const deletePromises = deletedImages.map(imageId => {
        const image = product.images.find(img => img.public_id === imageId);
        if (image) {
          return cloudinary.uploader.destroy(image.public_id)
            .then(() => {
              product.images = product.images.filter(img => img.public_id !== imageId);
            })
            .catch(error => {
              console.error(`Error deleting image ${imageId}:`, error);
            });
        }
        return Promise.resolve();
      });

      await Promise.all(deletePromises);
    }

    // Upload and add new images
    if (req.files && req.files.length > 0) {
      const uploadPromises = req.files.map(file =>
        cloudinary.uploader.upload(file.path, {
          folder: 'products',
          resource_type: 'auto'
        })
      );

      const uploadedImages = await Promise.all(uploadPromises);
      const newImages = uploadedImages.map(result => ({
        url: result.secure_url,
        public_id: result.public_id
      }));

      product.images.push(...newImages);
    }

    // Update other fields
    product.title = title;
    product.tagline = tagline;
    product.price = parseFloat(price);
    product.category = category;
    product.description = description;
    product.features = features ? JSON.parse(features) : [];
    product.specifications = specifications ? JSON.parse(specifications) : [];
    product.tags = tags ? JSON.parse(tags) : [];
    product.updatedAt = Date.now();

    const updatedProduct = await product.save();
    res.json({
      success: true,
      message: 'Product updated successfully',
      data: updatedProduct
    });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update product',
      error: error.message
    });
  }
});

module.exports = router
