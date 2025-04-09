const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files from the public directory with proper content-type handling
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads'), {
  setHeaders: (res, path) => {
    // Set proper content-type based on file extension
    const ext = path.split('.').pop().toLowerCase();
    const contentTypes = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp'
    };
    if (contentTypes[ext]) {
      res.set('Content-Type', contentTypes[ext]);
    }
  }
}));

// Remove any existing Content-Security-Policy headers
app.use((req, res, next) => {
  res.removeHeader('Content-Security-Policy');
  next();
});

// MongoDB connection options
const mongoOptions = {
  serverSelectionTimeoutMS: 30000,
  retryWrites: true
};

// Connect to MongoDB with improved retry logic
let isConnecting = false;
const connectWithRetry = async () => {
  if (isConnecting) return;
  
  try {
    isConnecting = true;
    await mongoose.connect(process.env.MONGODB_URI, mongoOptions);
    isConnecting = false;
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    isConnecting = false;
    // Only retry if the connection is not intentionally closed
    if (mongoose.connection.readyState !== 0) {
      console.log('Retrying connection in 5 seconds...');
      setTimeout(connectWithRetry, 5000);
    }
  }
};

// Add timeout middleware
app.use((req, res, next) => {
  req.setTimeout(30000);
  res.setTimeout(30000);
  next();
});

// Initialize connection
connectWithRetry();

// Handle MongoDB connection events
mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  if (mongoose.connection.readyState !== 0) {
    console.log('MongoDB disconnected. Attempting to reconnect...');
    connectWithRetry();
  }
});

mongoose.connection.on('connected', () => {
  console.log('MongoDB connection established');
});

mongoose.connection.on('reconnected', () => {
  console.log('MongoDB reconnected');
});

// Routes
app.use('/api/products', require('./api/products'));
app.use('/api/enquiry', require('./api/enquiry'));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error details:', err);
  
  // Handle specific MongoDB errors
  if (err.name === 'MongoServerError') {
    return res.status(503).json({
      message: 'Database operation failed',
      error: process.env.NODE_ENV === 'development' ? err.message : 'Service temporarily unavailable'
    });
  }

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      message: 'Validation failed',
      error: process.env.NODE_ENV === 'development' ? err.message : 'Invalid input data'
    });
  }

  if (err.name === 'MongooseError' && err.message.includes('buffering timed out')) {
    return res.status(504).json({
      message: 'Database operation timed out',
      error: process.env.NODE_ENV === 'development' ? err.message : 'Request timed out'
    });
  }

  // Default error handler
  res.status(500).json({
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

const PORT = process.env.PORT || 5001;

// Start server with port conflict handling
const startServer = (port) => {
  const server = app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} is busy, trying ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('Server error:', err);
    }
  });
};

startServer(PORT);