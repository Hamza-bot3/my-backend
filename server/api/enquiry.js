const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const router = express.Router();

// Enable CORS
router.use(cors());

// Create a transporter using SMTP with debug logging
const transporter = nodemailer.createTransport({
  debug: true, // Enable debug logging
  logger: true, // Enable logger
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// POST endpoint for handling form submissions
router.post('/', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  
  try {
    const { name, email, phone, companyName, message, productName, to, formType } = req.body;

    // Validate required fields based on form type
    if (formType === 'contact' && (!name || !email || !phone || !message)) {
      return res.status(400).json({ message: 'Required fields are missing for contact form' });
    } else if (formType === 'enquiry' && (!name || !email || !phone || !message)) {
      return res.status(400).json({ message: 'Required fields are missing' });
    }

    // Verify email configuration
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      console.error('Email configuration missing');
      return res.status(500).json({ message: 'Email service not configured properly' });
    }

    // Email content
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: to || 'info@bombaygifthouse.com',
      subject: formType === 'contact' ? 'New Contact Form Submission' : (productName ? `New Enquiry for ${productName}` : 'New Enquiry'),
      html: `
        <h2>New Enquiry Form Submission</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone}</p>
        <p><strong>Company Name:</strong> ${companyName || 'Not provided'}</p>
        <p><strong>Message:</strong> ${message}</p>
        ${productName ? `<p><strong>Product:</strong> ${productName}</p>` : ''}
      `
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);
    res.status(200).json({ message: 'Form submitted successfully' });
  } catch (error) {
    console.error('Error sending email:', error);
    console.error('Error details:', {
      code: error.code,
      response: error.response,
      responseCode: error.responseCode,
      command: error.command
    });
    
    // More detailed error message for debugging
    let errorMessage = 'Failed to submit form';
    
    if (error.code === 'EAUTH') {
      errorMessage = 'Email authentication failed. Please check credentials.';
    } else if (error.code === 'ESOCKET') {
      errorMessage = 'Network error while sending email.';
    } else if (error.responseCode) {
      errorMessage = `SMTP Error: ${error.response} (Code: ${error.responseCode})`;
    }
    
    res.status(500).json({ 
      message: errorMessage,
      error: error.message,
      code: error.code
    });
  }
});

module.exports = router;