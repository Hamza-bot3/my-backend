const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();

// Validation middleware
const validateBlogPost = (req, res, next) => {
  const { title, content } = req.body;
  if (!title || !content) {
    return res.status(400).json({ message: 'Title and content are required' });
  }
  if (title.length < 3 || title.length > 100) {
    return res.status(400).json({ message: 'Title must be between 3 and 100 characters' });
  }
  if (content.length < 10) {
    return res.status(400).json({ message: 'Content must be at least 10 characters long' });
  }
  next();
};

// Utility function to clean up unused images
const cleanupUnusedImages = async (oldImages, newImages) => {
  const imagesToDelete = oldImages.filter(img => !newImages.includes(img));
  for (const img of imagesToDelete) {
    const imagePath = path.join(__dirname, '../../public', img);
    try {
      if (fs.existsSync(imagePath)) {
        await fs.promises.unlink(imagePath);
      }
    } catch (error) {
      console.error('Error deleting unused image:', error);
    }
  }
};

// Configure multer for handling file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/uploads/')
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname))
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Blog Schema
const blogSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  category: { type: String, default: 'corporate' },
  date: { type: Date, default: Date.now },
  readTime: String,
  images: [String]
});

const Blog = mongoose.model('Blog', blogSchema);

// Get all blogs with pagination
router.get('/', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  try {
    const [blogs, total] = await Promise.all([
      Blog.find().sort({ date: -1 }).skip(skip).limit(limit),
      Blog.countDocuments()
    ]);
    
    res.json({
      blogs,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalBlogs: total
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create a new blog
router.post('/', upload.array('images', 10), validateBlogPost, async (req, res) => {
  try {
    const { title, content, category } = req.body;
    const images = req.files ? req.files.map(file => `/uploads/${file.filename}`) : [];
    
    const blog = new Blog({
      title,
      content,
      category,
      readTime: `${Math.ceil(content.length / 1000)} min read`,
      images
    });

    const newBlog = await blog.save();
    res.status(201).json(newBlog);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update a blog
router.put('/:id', upload.array('images', 10), validateBlogPost, async (req, res) => {
  try {
    const { title, content, category } = req.body;
    const newImages = req.files ? req.files.map(file => `/uploads/${file.filename}`) : [];
    
    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      return res.status(404).json({ message: 'Blog not found' });
    }

    blog.title = title;
    blog.content = content;
    blog.category = category;
    blog.readTime = `${Math.ceil(content.length / 1000)} min read`;
    const oldImages = [...blog.images];
    blog.images = [...blog.images, ...newImages];
    await cleanupUnusedImages(oldImages, blog.images);

    const updatedBlog = await blog.save();
    res.json(updatedBlog);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete a blog
router.delete('/:id', async (req, res) => {
  let blog;
  try {
    blog = await Blog.findById(req.params.id);
    if (!blog) {
      return res.status(404).json({ message: 'Blog not found' });
    }

    // Clean up associated images
    await cleanupUnusedImages(blog.images, []);

    await blog.remove();
    res.json({ message: 'Blog deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;