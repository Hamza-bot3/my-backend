const { SitemapStream, streamToPromise } = require('sitemap');
const { Readable } = require('stream');
const Product = require('../models/Product');
const Blog = require('../models/Blog');

const baseUrl = process.env.BASE_URL || 'https://bngifthouse.com';

async function generateSitemap() {
  try {
    // Fetch all products and blogs
    const products = await Product.find({}, '_id updatedAt');
    const blogs = await Blog.find({}, '_id updatedAt');

    // Create a stream to write to
    const stream = new SitemapStream({ hostname: baseUrl });

    // Add static pages
    const staticPages = [
      { url: '/', changefreq: 'daily', priority: 1.0 },
      { url: '/shop', changefreq: 'daily', priority: 0.9 },
      { url: '/about', changefreq: 'monthly', priority: 0.7 },
      { url: '/contact', changefreq: 'monthly', priority: 0.7 },
      { url: '/blog', changefreq: 'weekly', priority: 0.8 },
    ];

    // Add category pages
    const categories = [
      'gift-hampers',
      'diwali-gifts',
      'tech-gadgets',
      'home-living',
      'bags-luggage',
      'joining-kits',
      'gift-combo-sets',
      'logo-printed-tshirts',
      'customized-gifts',
      'drinkware'
    ];

    const categoryPages = categories.map(category => ({
      url: `/shop?category=${category}`,
      changefreq: 'daily',
      priority: 0.8
    }));

    // Combine all URLs
    const links = [
      ...staticPages,
      ...categoryPages,
      // Add product pages
      ...products.map(product => ({
        url: `/products/${product._id}`,
        changefreq: 'weekly',
        priority: 0.9,
        lastmod: product.updatedAt.toISOString()
      })),
      // Add blog pages
      ...blogs.map(blog => ({
        url: `/blog/${blog._id}`,
        changefreq: 'monthly',
        priority: 0.7,
        lastmod: blog.updatedAt.toISOString()
      }))
    ];

    // Create a readable stream and pipe it to the sitemap stream
    return streamToPromise(Readable.from(links).pipe(stream)).then((data) =>
      data.toString()
    );
  } catch (error) {
    console.error('Error generating sitemap:', error);
    throw error;
  }
}

module.exports = generateSitemap; 