# E-commerce Backend

This is the backend server for the e-commerce website. It handles product management, image uploads, and API endpoints.

## Features

- Product CRUD operations
- Image upload with Cloudinary integration
- MongoDB database integration
- RESTful API endpoints

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file with the following variables:
```
MONGODB_URI=your_mongodb_uri
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
PORT=5000
```

3. Start the server:
```bash
npm start
```

For development:
```bash
npm run dev
```

## API Endpoints

- `GET /api/products` - Get all products
- `GET /api/products/:id` - Get a single product
- `POST /api/products` - Create a new product
- `PUT /api/products/:id` - Update a product
- `DELETE /api/products/:id` - Delete a product

## Image Upload

Images are stored using Cloudinary's cloud storage service. The backend handles image upload and management through the Cloudinary API.