// mailer.js
require('dotenv').config();
const nodemailer = require('nodemailer');

// Create transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  secure: false, // Set to true if using port 465
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

 

// Email sending function
const sendEmail = async (to, subject, text, html = null) => {
  try {
    const mailOptions = {
      from: `"AllBiz Support" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text,
      ...(html && { html })
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.response);
    return info;
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
};

 
 
 


module.exports = { sendEmail };
