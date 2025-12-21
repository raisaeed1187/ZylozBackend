// mailer.js
require('dotenv').config();
const nodemailer = require('nodemailer');
 
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,  
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  tls: {
    ciphers: "SSLv3",
    rejectUnauthorized: false, 
  },
});

 

// Email sending function
const sendEmail = async (to, subject, text, html = null, attachments = [],cc,bcc) => {
  try {
    const mailOptions = {
      from: `"AllBiz Support" <${process.env.EMAIL_USER}>`,
      to, 
      subject,
      text,
      ...(html && { html }),
      ...(cc && { cc }),
      ...(bcc && { bcc }),

      ...(attachments.length > 0 && { attachments }), 
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
