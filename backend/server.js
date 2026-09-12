require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

const app = express();
const port = process.env.PORT || 5000;
const JWT_SECRET = 'msw_secret_key_123';

app.use(bodyParser.json({ limit: '500mb' }));
app.use(bodyParser.urlencoded({ limit: '500mb', extended: true }));

const smtpPort = parseInt(process.env.SMTP_PORT) || 587;
const isSecure = smtpPort === 465;

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: smtpPort,
  secure: isSecure,
  auth: {
    user: process.env.SMTP_USER,
    pass: (process.env.SMTP_PASS || '').replace(/\s+/g, '')
  },
  tls: {
    rejectUnauthorized: false
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000
});

// Startup SMTP verification (safe logging, never logs password)
if (process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter.verify((error, success) => {
    if (error) {
      console.error(`❌ [SMTP Diagnostics] Connection failed on ${process.env.SMTP_HOST || 'smtp.gmail.com'}:${smtpPort} (secure: ${isSecure}):`, error.message);
    } else {
      console.log(`✅ [SMTP Diagnostics] Transporter verified & ready on ${process.env.SMTP_HOST || 'smtp.gmail.com'}:${smtpPort} (User: ${process.env.SMTP_USER})`);
    }
  });
} else {
  console.log("ℹ️ [SMTP Diagnostics] No SMTP credentials configured. Emails will run in mock mode.");
}

const sendEmail = async (mailOptions) => {
  const digitsMatch = mailOptions.html ? mailOptions.html.match(/>(\d{6})</) : null;
  const otpCode = digitsMatch ? digitsMatch[1] : null;

  if (!process.env.SMTP_PASS || !process.env.SMTP_USER) {
    console.log("\n=========================================");
    console.log("📧 MOCK EMAIL (No SMTP credentials configured):");
    console.log(`To: ${mailOptions.to}`);
    console.log(`Subject: ${mailOptions.subject}`);
    if (otpCode) {
      console.log(`\n👉 🔑 YOUR OTP CODE IS: [ ${otpCode} ] 👈\n`);
    } else {
      const cleanText = mailOptions.html ? mailOptions.html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '';
      console.log(`Message Snippet: ${cleanText.substring(0, 300)}...`);
    }
    console.log("=========================================\n");
    return { messageId: "mock-id", success: true };
  }

  // Ensure default from address if not provided
  if (!mailOptions.from) {
    mailOptions.from = `"${process.env.EMAIL_FROM_NAME || 'Zee Technologies'}" <${process.env.EMAIL_FROM || process.env.SMTP_USER || 'zeetechnologies.pk@gmail.com'}>`;
  }

  // Ensure attachments only included if existing on disk
  if (mailOptions.attachments && Array.isArray(mailOptions.attachments)) {
    mailOptions.attachments = mailOptions.attachments.filter(att => !att.path || fs.existsSync(att.path));
  }

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`\n📧 [SMTP SUCCESS] Delivered to: ${mailOptions.to} | Subject: "${mailOptions.subject}" | Message ID: ${info.messageId}`);
    console.log(`   Accepted: ${JSON.stringify(info.accepted)} | Rejected: ${JSON.stringify(info.rejected)} | Response: ${info.response}`);
    return {
      success: true,
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
      response: info.response,
      envelope: info.envelope
    };
  } catch (err) {
    console.error(`\n❌ [SMTP ERROR] Delivery failed to: ${mailOptions.to} | Subject: "${mailOptions.subject}" | Error: ${err.message}`);
    console.log("=========================================");
    console.log("📧 LOCAL CONSOLE EMAIL BACKUP:");
    console.log(`To: ${mailOptions.to}`);
    console.log(`Subject: ${mailOptions.subject}`);
    if (otpCode) {
      console.log(`\n👉 🔑 YOUR OTP CODE IS: [ ${otpCode} ] 👈\n`);
    } else {
      const cleanText = mailOptions.html ? mailOptions.html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '';
      console.log(`Message Snippet: ${cleanText.substring(0, 300)}...`);
    }
    console.log("=========================================\n");
    return { messageId: "failed", success: false, error: err.message };
  }
};

const sendOrderConfirmationEmail = async (order) => {
  try {
    let recipientEmail = order.customer_details?.email;
    if (!recipientEmail && order.user_id) {
      const user = await User.findById(order.user_id);
      if (user) recipientEmail = user.email;
    }
    if (!recipientEmail) {
      console.error("Order Confirmation Email Error: No recipient email found for order", order.order_id);
      return;
    }

    const cartItems = order.cart_items || [];
    const subtotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const totalShipping = cartItems.reduce((sum, item) => sum + (item.shippingFee || 0), 0);
    const totalBill = order.total_bill || (subtotal + totalShipping);

    const itemsHtml = cartItems.map(item => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px; color: #334155; text-align: left;">
          <div style="font-weight: 600; color: #0f172a;">${item.title}</div>
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px; color: #475569; text-align: center;">
          ${item.quantity}
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px; color: #475569; text-align: right;">
          PKR ${item.price}
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px; font-weight: 600; color: #0f172a; text-align: right;">
          PKR ${item.price * item.quantity}
        </td>
      </tr>
    `).join('');

    const formattedDate = new Date(order.created_at || Date.now()).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const mailOptions = {
      from: `"ZMAH Orders" <${process.env.EMAIL_FROM || process.env.SMTP_USER || 'zeetechnologies.pk@gmail.com'}>`,
      to: recipientEmail,
      subject: `Order Confirmed: #${order.order_id} - ZMAH Technologies`,
      attachments: [{
        filename: 'logo.png',
        path: path.join(__dirname, '../frontend/assets/STMP.png'),
        cid: 'zmahlogo'
      }],
      html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Confirmed - ZMAH Technologies</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #f8fafc;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
      width: 100% !important;
    }
    .wrapper {
      width: 100%;
      background-color: #f8fafc;
      padding: 40px 20px;
      box-sizing: border-box;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
      border: 1px solid #e2e8f0;
    }
    .header {
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      padding: 30px 40px;
      text-align: center;
    }
    .content {
      padding: 40px;
      color: #334155;
    }
    .content h2 {
      font-size: 22px;
      font-weight: 700;
      color: #0f172a;
      margin-top: 0;
      margin-bottom: 8px;
    }
    .content p {
      font-size: 15px;
      line-height: 1.6;
      color: #475569;
      margin-bottom: 24px;
      margin-top: 0;
    }
    .section-title {
      font-size: 16px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 2px solid #f1f5f9;
      padding-bottom: 6px;
    }
    .detail-card {
      background-color: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 24px;
    }
    .detail-row {
      margin-bottom: 10px;
      font-size: 14px;
    }
    .detail-row:last-child {
      margin-bottom: 0;
    }
    .detail-label {
      font-weight: 600;
      color: #64748b;
      display: inline-block;
      width: 120px;
    }
    .detail-value {
      color: #0f172a;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
    }
    .items-table th {
      background-color: #f8fafc;
      padding: 12px;
      font-size: 12px;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      border-bottom: 2px solid #e2e8f0;
    }
    .summary-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 12px;
    }
    .summary-row td {
      padding: 8px 12px;
      font-size: 14px;
    }
    .summary-total {
      font-size: 18px;
      font-weight: 700;
      color: #2563eb;
      border-top: 2px solid #e2e8f0;
      padding-top: 12px !important;
    }
    .footer {
      background-color: #f8fafc;
      padding: 24px 40px;
      text-align: center;
      border-top: 1px solid #e2e8f0;
    }
    .footer p {
      font-size: 12px;
      color: #64748b;
      margin: 0 0 8px 0;
      line-height: 1.5;
    }
    .footer a {
      color: #2563eb;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header" style="text-align: center; padding: 25px 20px;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" style="margin: 0 auto; border-collapse: collapse;">
          <tr>
            <td style="vertical-align: middle; padding-right: 12px;">
              <img src="cid:zmahlogo" alt="ZMAH Logo" style="height: 45px; width: auto; display: block; border: 0;">
            </td>
            <td style="vertical-align: middle; color: #ffffff; font-size: 24px; font-weight: 700; letter-spacing: 0.5px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 45px;">
              ZMAH Technologies
            </td>
          </tr>
        </table>
      </div>
      <div class="content">
        <h2>Order Confirmed!</h2>
        <p>Dear ${order.customer_details?.name || 'Valued Customer'},</p>
        <p>Thank you for shopping with us! We are pleased to confirm that your order has been received and is now being processed. Below are your order summary and delivery details.</p>
        
        <div class="section-title">Order Overview</div>
        <div class="detail-card">
          <div class="detail-row">
            <span class="detail-label">Order ID:</span>
            <span class="detail-value" style="font-weight: 600;">#${order.order_id}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Order Date:</span>
            <span class="detail-value">${formattedDate}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Payment Method:</span>
            <span class="detail-value">Cash on Delivery (COD)</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Order Status:</span>
            <span class="detail-value" style="color: #d97706; font-weight: 600;">${order.status}</span>
          </div>
        </div>

        <div class="section-title">Order Items</div>
        <table class="items-table">
          <thead>
            <tr>
              <th style="text-align: left;">Item</th>
              <th style="text-align: center; width: 60px;">Qty</th>
              <th style="text-align: right; width: 100px;">Price</th>
              <th style="text-align: right; width: 100px;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <table class="summary-table">
          <tr class="summary-row">
            <td style="text-align: right; color: #64748b;">Subtotal:</td>
            <td style="text-align: right; width: 120px; color: #0f172a; font-weight: 600;">PKR ${subtotal}</td>
          </tr>
          <tr class="summary-row">
            <td style="text-align: right; color: #64748b;">Shipping Fee:</td>
            <td style="text-align: right; color: ${totalShipping > 0 ? '#0f172a' : '#16a34a'}; font-weight: 600;">
              ${totalShipping > 0 ? `PKR ${totalShipping}` : 'FREE'}
            </td>
          </tr>
          <tr class="summary-row">
            <td class="summary-total" style="text-align: right;">Total Bill:</td>
            <td class="summary-total" style="text-align: right; color: #2563eb; font-weight: 700;">PKR ${totalBill}</td>
          </tr>
        </table>

        <div class="section-title" style="margin-top: 30px;">Shipping Address</div>
        <div class="detail-card" style="margin-bottom: 0;">
          <div style="font-weight: 600; color: #0f172a; margin-bottom: 6px;">${order.customer_details?.name}</div>
          <div style="color: #475569; font-size: 14px; line-height: 1.5;">
            ${order.customer_details?.address}<br>
            ${order.customer_details?.city}<br>
            <span style="font-weight: 600; color: #64748b;">Contact:</span> ${order.customer_details?.contact}
          </div>
        </div>
      </div>
      <div class="footer">
        <p>&copy; 2026 ZMAH Technologies. All rights reserved.</p>
        <p>If you have any questions, please contact our support team at <a href="mailto:${process.env.EMAIL_FROM || process.env.SMTP_USER || 'zeetechnologies.pk@gmail.com'}">${process.env.EMAIL_FROM || process.env.SMTP_USER || 'zeetechnologies.pk@gmail.com'}</a></p>
      </div>
    </div>
  </div>
</body>
</html>
      `
    };

    const result = await sendEmail(mailOptions);
    return { ...result, to: recipientEmail };
  } catch (error) {
    console.error("sendOrderConfirmationEmail Error:", error.message);
    return { success: false, error: error.message };
  }
};

const sendOrderStatusEmail = async (order) => {
  try {
    let recipientEmail = order.customer_details?.email;
    if (!recipientEmail && order.user_id) {
      const user = await User.findById(order.user_id);
      if (user) recipientEmail = user.email;
    }
    if (!recipientEmail) {
      console.error("Order Status Email Error: No recipient email found for order", order.order_id);
      return;
    }

    const getStatusColor = (status) => {
      switch (status) {
        case 'Pending':
        case 'Seller to Pack':
          return { bg: '#fef3c7', text: '#d97706', border: '#fcd34d', label: 'Processing (Seller to Pack)' };
        case 'Packed':
          return { bg: '#e0f2fe', text: '#0369a1', border: '#bae6fd', label: 'Packed & Ready' };
        case 'Shipped':
          return { bg: '#dbeafe', text: '#1d4ed8', border: '#bfdbfe', label: 'Shipped (In Transit)' };
        case 'Delivered':
          return { bg: '#d1fae5', text: '#047857', border: '#a7f3d0', label: 'Delivered' };
        case 'Cancelled':
          return { bg: '#fee2e2', text: '#b91c1c', border: '#fca5a5', label: 'Cancelled' };
        default:
          return { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1', label: status };
      }
    };

    const getIntroMessage = (status) => {
      switch (status) {
        case 'Pending':
        case 'Seller to Pack':
          return "Thank you for shopping with ZMAH Technologies! Your order has been successfully confirmed and is now in our system. Our team will begin preparing your order shortly. We'll keep you updated as it progresses through each stage until it reaches your doorstep.";
        case 'Packed':
          return "Great news! Your order has been carefully packed and is now ready for shipment. Our team has completed the packaging process to ensure your items arrive safely. You'll receive another update as soon as your package is dispatched.";
        case 'Shipped':
          return "Your order is on the move! It has been shipped and is currently on its way to your delivery address. Our delivery partner is handling your package with care, and we'll continue to keep you informed until it arrives.";
        case 'Delivered':
          return "Your order has been successfully delivered. We hope everything arrived safely and meets your expectations. Thank you for choosing ZMAH Technologies. We truly appreciate your trust and look forward to serving you again in the future.";
        case 'Cancelled':
          return "We're sorry to inform you that your order has been cancelled. If the cancellation was requested by you, no further action is required. If you believe this was done in error or have any questions, please contact our support team—we'll be happy to assist you.";
        default:
          return "We are writing to inform you that the status of your order has changed. Here is the latest update:";
      }
    };

    const statusStyle = getStatusColor(order.status);
    const introMessage = getIntroMessage(order.status);

    const cartItems = order.cart_items || [];
    const itemsSummary = cartItems.map(item => `${item.title} (x${item.quantity})`).join(', ');

    const mailOptions = {
      from: `"ZMAH Orders" <${process.env.EMAIL_FROM || process.env.SMTP_USER || 'zeetechnologies.pk@gmail.com'}>`,
      to: recipientEmail,
      subject: `Order Status Update: #${order.order_id} - ${order.status}`,
      attachments: [{
        filename: 'logo.png',
        path: path.join(__dirname, '../frontend/assets/STMP.png'),
        cid: 'zmahlogo'
      }],
      html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Status Update - ZMAH Technologies</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #f8fafc;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
      width: 100% !important;
    }
    .wrapper {
      width: 100%;
      background-color: #f8fafc;
      padding: 40px 20px;
      box-sizing: border-box;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
      border: 1px solid #e2e8f0;
    }
    .header {
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      padding: 30px 40px;
      text-align: center;
    }
    .content {
      padding: 40px;
      color: #334155;
    }
    .content h2 {
      font-size: 22px;
      font-weight: 700;
      color: #0f172a;
      margin-top: 0;
      margin-bottom: 8px;
    }
    .content p {
      font-size: 15px;
      line-height: 1.6;
      color: #475569;
      margin-bottom: 24px;
      margin-top: 0;
    }
    .status-banner {
      background-color: ${statusStyle.bg};
      color: ${statusStyle.text};
      border: 1px solid ${statusStyle.border};
      border-radius: 12px;
      padding: 20px;
      text-align: center;
      margin-bottom: 28px;
    }
    .status-title {
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 4px;
    }
    .status-badge {
      font-size: 24px;
      font-weight: 700;
      margin: 0;
    }
    .section-title {
      font-size: 16px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 2px solid #f1f5f9;
      padding-bottom: 6px;
    }
    .detail-card {
      background-color: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 24px;
    }
    .detail-row {
      margin-bottom: 10px;
      font-size: 14px;
    }
    .detail-row:last-child {
      margin-bottom: 0;
    }
    .detail-label {
      font-weight: 600;
      color: #64748b;
      display: inline-block;
      width: 120px;
    }
    .detail-value {
      color: #0f172a;
    }
    .footer {
      background-color: #f8fafc;
      padding: 24px 40px;
      text-align: center;
      border-top: 1px solid #e2e8f0;
    }
    .footer p {
      font-size: 12px;
      color: #64748b;
      margin: 0 0 8px 0;
      line-height: 1.5;
    }
    .footer a {
      color: #2563eb;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header" style="text-align: center; padding: 25px 20px;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" style="margin: 0 auto; border-collapse: collapse;">
          <tr>
            <td style="vertical-align: middle; padding-right: 12px;">
              <img src="cid:zmahlogo" alt="ZMAH Logo" style="height: 45px; width: auto; display: block; border: 0;">
            </td>
            <td style="vertical-align: middle; color: #ffffff; font-size: 24px; font-weight: 700; letter-spacing: 0.5px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 45px;">
              ZMAH Technologies
            </td>
          </tr>
        </table>
      </div>
      <div class="content">
        <h2>Order Status Update</h2>
        <p>Dear ${order.customer_details?.name || 'Valued Customer'},</p>
        <p>${introMessage}</p>
 
        <div class="status-banner">
          <div class="status-title">Current Status</div>
          <div class="status-badge">${statusStyle.label}</div>
        </div>
 
        <div class="section-title">Order Info</div>
        <div class="detail-card">
          <div class="detail-row">
            <span class="detail-label">Order ID:</span>
            <span class="detail-value" style="font-weight: 600;">#${order.order_id}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Items:</span>
            <span class="detail-value">${itemsSummary}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Total Amount:</span>
            <span class="detail-value" style="font-weight: 600; color: #2563eb;">PKR ${order.total_bill}</span>
          </div>
        </div>
 
        <p style="margin-bottom: 0;">If you have any questions or need to make changes to your shipping details, please contact us immediately.</p>
      </div>
      <div class="footer">
        <p>&copy; 2026 ZMAH Technologies. All rights reserved.</p>
        <p>If you have any questions, please contact our support team at <a href="mailto:${process.env.EMAIL_FROM || process.env.SMTP_USER || 'zeetechnologies.pk@gmail.com'}">${process.env.EMAIL_FROM || process.env.SMTP_USER || 'zeetechnologies.pk@gmail.com'}</a></p>
      </div>
    </div>
  </div>
</body>
</html>
      `
    };
 
    const result = await sendEmail(mailOptions);
    return { ...result, to: recipientEmail };
  } catch (error) {
    console.error("sendOrderStatusEmail Error:", error.message);
    return { success: false, error: error.message };
  }
};

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

app.use(cors());
app.use(express.static(path.join(__dirname, '../frontend')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Assets folder ke liye bhi path set karein (Zaroori hai)
app.use('/assets', express.static(path.join(__dirname, '../frontend/assets')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // Uploads backend mein hi rahega

const adminSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  password: String,
  email: { type: String, default: 'zeetechnologies.pk@gmail.com' },
  resetOTP: String, otpExpires: Date
});
const Admin = mongoose.model('Admin', adminSchema);

const userSchema = new mongoose.Schema({
  fullName: String, email: { type: String, unique: true },
  contact: String, city: String, address: String, password: String,
  resetOTP: String, otpExpires: Date
});
const User = mongoose.model('User', userSchema);

const productSchema = new mongoose.Schema({
  title: String, description: String, price: Number, discount: Number,
  shippingFee: { type: Number, default: 0 },
  stock: { type: Number, default: 10 },
  sold: { type: Number, default: 0 },
  weight: { type: String, default: '' },
  images: [String],
  video: String
});
const Product = mongoose.model('Product', productSchema);

const orderSchema = new mongoose.Schema({
  customer_details: Object,
  cart_items: Array,
  total_bill: Number,
  status: { type: String, default: 'Seller to Pack' },
  cancelledBy: { type: String, default: null },
  order_id: String,
  user_id: String,
  created_at: { type: Date, default: Date.now }
});
const Order = mongoose.model('Order', orderSchema);

const initialSampleProducts = [
  {
    title: "Audionic Airbud 425 TWS Wireless Earbuds",
    description: "Experience crystal clear audio, ultra-low latency gaming mode, and up to 30 hours of playtime with fast Type-C charging.",
    price: 4999,
    discount: 20,
    shippingFee: 0,
    stock: 25,
    sold: 14,
    weight: "0.2kg",
    images: [
      "uploads/1764950697846-Audionic Airpods.jpeg",
      "uploads/1764950697884-audionic-the-sound-master-black-airbud-425-tws-earbuds-3577564092841.jpeg",
      "uploads/1764950697892-audionic-the-sound-master-black-airbud-425-tws-earbuds-35775641125020.jpeg",
      "uploads/1764950697893-audionic-the-sound-master-black-airbud-425-tws-earbuds-35775641288860.jpeg"
    ]
  },
  {
    title: "Audionic Airbud 495 ANC Pro Earbuds",
    description: "Active Noise Cancellation (ANC) with Environmental Noise Cancellation (ENC) for ultra-clear calls and immersive bass sound.",
    price: 6499,
    discount: 15,
    shippingFee: 0,
    stock: 18,
    sold: 22,
    weight: "0.25kg",
    images: [
      "uploads/1765984143332-Airbud495-Image-4.jpeg",
      "uploads/1765984143351-Airbud495-Image-1.jpeg",
      "uploads/1765984143368-Airbud495-Image-2.jpeg"
    ]
  },
  {
    title: "Audionic Flair Wireless Bluetooth Neckband",
    description: "Long-lasting battery life with dynamic bass drivers, magnetic earbuds, and comfortable ergonomic neckband design.",
    price: 3499,
    discount: 10,
    shippingFee: 150,
    stock: 30,
    sold: 8,
    weight: "0.15kg",
    images: [
      "uploads/1764953667164-Flair_Carbon_4.png",
      "uploads/1764953667170-Flair_Beige_4.png",
      "uploads/1764953667175-Flair_IceBlue_2.png"
    ]
  },
  {
    title: "Audionic Ignite Smartwatch HD Touch Display",
    description: "Smart fitness tracker with heart rate monitor, SpO2 sensor, multiple sports modes, Bluetooth calling, and water resistance.",
    price: 7999,
    discount: 25,
    shippingFee: 0,
    stock: 12,
    sold: 19,
    weight: "0.3kg",
    images: [
      "uploads/1764954166553-ignite-black-02.png",
      "uploads/1764953797785-BUDRENDER33.png"
    ]
  },
  {
    title: "Premium Studio Wireless Hi-Fi Headphones",
    description: "Deep bass, soft memory-foam ear cushions, foldable design, and 40-hour battery life for studio-grade audio experience.",
    price: 8999,
    discount: 30,
    shippingFee: 0,
    stock: 15,
    sold: 31,
    weight: "0.45kg",
    images: [
      "uploads/1764953366227-Ecommerce-Image-1_3.jpeg",
      "uploads/1764953366239-Ecommerce-Image-1_1.jpeg",
      "uploads/1764953366253-Ecommerce-Image-1.jpeg"
    ]
  }
];

async function connectDatabase() {
  let uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/zmah_technologies';
  let connected = false;
  try {
    console.log("Attempting to connect to MongoDB at:", uri);
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 2500 });
    console.log("MongoDB Connected Successfully to:", uri);
    connected = true;
  } catch (err) {
    console.log("Direct MongoDB connection unavailable, booting embedded local database...");
    try {
      const { MongoMemoryServer } = require('mongodb-memory-server');
      const mongod = await MongoMemoryServer.create({
        instance: { dbName: 'zmah_technologies' }
      });
      uri = mongod.getUri() + 'zmah_technologies';
      await mongoose.connect(uri);
      console.log("Embedded Local Database Connected Successfully to:", uri);
      connected = true;
    } catch (embErr) {
      console.error("Embedded Database Error:", embErr.message);
    }
  }

  if (connected) {
    try {
      const adminExists = await Admin.findOne({ username: 'msw_admin' });
      const defaultEmail = process.env.EMAIL_FROM || 'zeetechnologies.pk@gmail.com';
      if (!adminExists) {
        const hash = await bcrypt.hash('msw_password', 10);
        await new Admin({ username: 'msw_admin', password: hash, email: defaultEmail }).save();
        console.log("Default Admin Created (Username: msw_admin, Password: msw_password)");
      } else if (adminExists.email !== defaultEmail) {
        adminExists.email = defaultEmail;
        await adminExists.save();
        console.log("Default Admin Email Synchronized");
      }

      const prodCount = await Product.countDocuments();
      if (prodCount === 0) {
        await Product.insertMany(initialSampleProducts);
        console.log(`Auto-seeded ${initialSampleProducts.length} initial products with local images.`);
      }
    } catch (seedErr) {
      console.error("Initialization Error:", seedErr.message);
    }
  }
}

connectDatabase();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 500 * 1024 * 1024 }
});

const cpUpload = upload.fields([{ name: 'productImages', maxCount: 5 }, { name: 'productVideo', maxCount: 1 }]);

const verifyToken = (req, res, next) => {
  const token = req.headers['auth-token'];
  if (!token) return res.status(401).json({ success: false });
  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified;
    next();
  } catch (err) { res.status(400).json({ success: false }); }
};

// ================= API ROUTES =================

// 1. ADD PRODUCT
app.post('/api/admin/add-product', cpUpload, async (req, res) => {
  try {
    const { title, description, price, stock, shippingFee, salePrice, weight } = req.body;

    let originalPrice = Number(price) || 0;
    let finalSalePrice = Number(salePrice) || 0;
    let calculatedDiscount = 0;

    if (finalSalePrice > 0 && finalSalePrice < originalPrice) {
      calculatedDiscount = Math.round(((originalPrice - finalSalePrice) / originalPrice) * 100);
    }

    let imagePaths = [];
    if (req.files && req.files['productImages']) {
      imagePaths = req.files['productImages'].map(file => file.path);
    }

    let videoPath = '';
    if (req.files && req.files['productVideo']) {
      videoPath = req.files['productVideo'][0].path;
    }

    const newProduct = new Product({
      title, description,
      price: Number(price) || 0,
      discount: Number(calculatedDiscount) || 0,
      stock: Number(stock) || 0,
      shippingFee: Number(shippingFee) || 0,
      weight: weight || "0",
      images: imagePaths,
      video: videoPath
    });

    await newProduct.save();
    res.json({ success: true, message: "Product Added Successfully" });

  } catch (err) {
    console.error("Add Product Error:", err);
    res.status(500).json({ success: false, message: "Server Error: " + err.message });
  }
});

// 2. UPDATE PRODUCT
app.put('/api/admin/product/:id', cpUpload, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    const { title, description, price, stock, shippingFee, salePrice, weight } = req.body;

    let originalPrice = Number(price) || 0;
    let finalSalePrice = Number(salePrice) || 0;
    let calculatedDiscount = 0;

    if (finalSalePrice > 0 && finalSalePrice < originalPrice) {
      calculatedDiscount = Math.round(((originalPrice - finalSalePrice) / originalPrice) * 100);
    }

    let updateData = {
      title, description,
      price: Number(price) || 0,
      discount: Number(calculatedDiscount) || 0,
      stock: Number(stock) || 0,
      shippingFee: Number(shippingFee) || 0,
      weight: weight || "0"
    };

    if (req.files && req.files['productImages']) {
      updateData.images = req.files['productImages'].map(file => file.path);
    }
    if (req.files && req.files['productVideo']) {
      updateData.video = req.files['productVideo'][0].path;
    }

    await Product.findByIdAndUpdate(req.params.id, updateData, { new: true });
    res.json({ success: true, message: "Product Updated" });

  } catch (err) {
    console.error("Update Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

// 3. DELETE PRODUCT
app.delete('/api/admin/product/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ success: false });
    await Product.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Deleted" });
  } catch (err) { res.status(500).json({ success: false }); }
});

// 4. GET PRODUCTS
app.get('/api/products', async (req, res) => {
  try { const p = await Product.find(); res.json(p); } catch (e) { res.status(500).json([]); }
});

app.get('/api/product/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: "Invalid ID" });
    const p = await Product.findById(req.params.id);
    if (!p) return res.status(404).json({ message: "Not Found" });
    res.json(p);
  } catch (e) { res.status(500).json({ message: "Error" }); }
});

// --- AUTH ROUTES ---
app.post('/api/admin/login', async (req, res) => {
  const { username, usernameOrEmail, password } = req.body;
  const identifier = usernameOrEmail || username;
  const admin = await Admin.findOne({
    $or: [
      { username: identifier },
      { email: identifier }
    ]
  });
  if (!admin || !(await bcrypt.compare(password, admin.password))) return res.json({ success: false, message: "Invalid Credentials" });
  const token = jwt.sign({ id: admin._id, role: 'admin' }, JWT_SECRET);
  res.json({ success: true, token });
});

app.post('/api/user/signup', async (req, res) => {
  try {
    const hash = await bcrypt.hash(req.body.password, 10);
    const user = await new User({ ...req.body, password: hash }).save();
    const token = jwt.sign({ id: user._id, name: user.fullName }, JWT_SECRET);
    res.json({ success: true, token, user });
  } catch (e) { res.status(400).json({ success: false, message: "Email exists" }); }
});

app.post('/api/user/login', async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  if (!user || !(await bcrypt.compare(req.body.password, user.password))) return res.json({ success: false, message: "Invalid Credentials" });
  const token = jwt.sign({ id: user._id, name: user.fullName }, JWT_SECRET);
  res.json({ success: true, token, user });
});

// --- RECOVERY ROUTES ---
app.post('/api/user/forgot-password', async (req, res) => {
  const { email } = req.body;
  console.log(`\n🔍 [OTP REQUEST] Target Email from Frontend: "${email}"`);
  try {
    if (!email) {
      console.warn("⚠️ [OTP ERROR] No email provided in request body.");
      return res.status(400).json({ success: false, message: "Email is required" });
    }
    const cleanEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: { $regex: new RegExp(`^${cleanEmail}$`, 'i') } });
    if (!user) {
      console.warn(`⚠️ [OTP ERROR] User lookup failed. No account with email: "${cleanEmail}"`);
      return res.json({ success: false, message: "User not found" });
    }
    console.log(`👤 [OTP USER FOUND] DB User ID: ${user._id} | DB Email: "${user.email}"`);

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetOTP = otp;
    user.otpExpires = Date.now() + 600000;
    await user.save();
    console.log(`🔑 [OTP GENERATED] 6-digit OTP created & saved to DB.`);

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || 'Zee Technologies'}" <${process.env.EMAIL_FROM || process.env.SMTP_USER || 'zeetechnologies.pk@gmail.com'}>`,
      to: user.email,
      subject: 'Reset Your Password - ZMAH Technologies',
      attachments: [{
        filename: 'logo.png',
        path: path.join(__dirname, '../frontend/assets/STMP.png'),
        cid: 'zmahlogo'
      }],
      html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password - ZMAH Technologies</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #f1f5f9;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
      width: 100% !important;
    }
    .wrapper {
      width: 100%;
      background-color: #f1f5f9;
      padding: 40px 20px;
      box-sizing: border-box;
    }
    .container {
      max-width: 550px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
      border: 1px solid #e2e8f0;
    }
    .header {
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      padding: 30px 40px;
      text-align: center;
    }
    .logo-text {
      color: #ffffff;
      font-size: 24px;
      font-weight: 700;
      letter-spacing: 0.5px;
      margin: 0;
    }
    .content {
      padding: 40px;
      color: #334155;
    }
    .content h2 {
      font-size: 22px;
      font-weight: 700;
      color: #0f172a;
      margin-top: 0;
      margin-bottom: 20px;
    }
    .content p {
      font-size: 15px;
      line-height: 1.6;
      color: #475569;
      margin-bottom: 30px;
    }
    .otp-card {
      background-color: #f8fafc;
      border: 2px dashed #cbd5e1;
      border-radius: 12px;
      padding: 24px;
      text-align: center;
      margin-bottom: 30px;
    }
    .otp-code {
      font-family: 'Courier New', Courier, monospace;
      font-size: 36px;
      font-weight: 700;
      color: #2563eb;
      letter-spacing: 6px;
      margin: 0;
    }
    .expiry-note {
      font-size: 13px;
      color: #94a3b8;
      margin-top: 8px;
    }
    .footer {
      background-color: #f8fafc;
      padding: 24px 40px;
      text-align: center;
      border-top: 1px solid #e2e8f0;
    }
    .footer p {
      font-size: 12px;
      color: #64748b;
      margin: 0 0 8px 0;
      line-height: 1.5;
    }
    .footer a {
      color: #2563eb;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header" style="text-align: center; padding: 25px 20px;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" style="margin: 0 auto; border-collapse: collapse;">
          <tr>
            <td style="vertical-align: middle; padding-right: 12px;">
              <img src="cid:zmahlogo" alt="ZMAH Logo" style="height: 45px; width: auto; display: block; border: 0;">
            </td>
            <td style="vertical-align: middle; color: #ffffff; font-size: 24px; font-weight: 700; letter-spacing: 0.5px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 45px;">
              ZMAH Technologies
            </td>
          </tr>
        </table>
      </div>
      <div class="content">
        <h2>Password Reset Request</h2>
        <p>Hello,</p>
        <p>We received a request to reset the password for your account. Please use the following One-Time Password (OTP) to complete the verification process. This OTP is confidential and should not be shared with anyone.</p>
        <div class="otp-card">
          <div class="otp-code">${otp}</div>
          <div class="expiry-note">This code expires in 10 minutes</div>
        </div>
        <p>If you did not request this password reset, please ignore this email or contact our support team immediately.</p>
      </div>
      <div class="footer">
        <p>&copy; 2026 ZMAH Technologies. All rights reserved.</p>
        <p>If you need assistance, contact us at <a href="mailto:${process.env.EMAIL_FROM || process.env.SMTP_USER || 'zeetechnologies.pk@gmail.com'}">${process.env.EMAIL_FROM || process.env.SMTP_USER || 'zeetechnologies.pk@gmail.com'}</a></p>
      </div>
    </div>
  </div>
</body>
</html>
            `
    };

    console.log(`📤 [OTP CALLING sendEmail] Recipient: "${user.email}"`);
    const emailResult = await sendEmail(mailOptions);

    if (!emailResult.success) {
      return res.status(500).json({ success: false, message: `Failed to deliver OTP email: ${emailResult.error || 'SMTP delivery failure'}` });
    }

    res.json({ success: true, message: "OTP sent to your email" });
  } catch (e) {
    console.error("Forgot Password Error:", e);
    res.status(500).json({ success: false, message: e.message });
  }
});

app.post('/api/user/reset-password', async (req, res) => {
  const { email, otp, newPassword } = req.body;
  try {
    const user = await User.findOne({ email, resetOTP: otp, otpExpires: { $gt: Date.now() } });
    if (!user) return res.json({ success: false, message: "Invalid OTP" });
    user.password = await bcrypt.hash(newPassword, 10);
    user.resetOTP = undefined; user.otpExpires = undefined;
    await user.save();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/api/admin/forgot-password', async (req, res) => {
  const { email } = req.body;
  console.log(`\n🔍 [ADMIN OTP REQUEST] Target Email: "${email}"`);
  try {
    if (!email) return res.status(400).json({ success: false, message: "Email is required" });
    const cleanEmail = email.trim().toLowerCase();
    const admin = await Admin.findOne({ email: { $regex: new RegExp(`^${cleanEmail}$`, 'i') } });
    if (!admin) {
      console.warn(`⚠️ [ADMIN OTP ERROR] Admin account with email "${cleanEmail}" not found`);
      return res.json({ success: false, message: "Admin account with this email not found" });
    }
    console.log(`👑 [ADMIN FOUND] DB Admin ID: ${admin._id} | DB Email: "${admin.email}"`);

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    admin.resetOTP = otp;
    admin.otpExpires = Date.now() + 600000;
    await admin.save();
    console.log(`🔑 [ADMIN OTP GENERATED] Saved to DB.`);

    const emailResult = await sendEmail({
      from: `"${process.env.EMAIL_FROM_NAME || 'Zee Technologies'}" <${process.env.EMAIL_FROM || process.env.SMTP_USER || 'zeetechnologies.pk@gmail.com'}>`,
      to: admin.email,
      subject: 'Admin OTP - ZMAH Technologies',
      attachments: [{
        filename: 'logo.png',
        path: path.join(__dirname, '../frontend/assets/STMP.png'),
        cid: 'zmahlogo'
      }],
      html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin OTP - ZMAH Technologies</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #f1f5f9;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
      width: 100% !important;
    }
    .wrapper {
      width: 100%;
      background-color: #f1f5f9;
      padding: 40px 20px;
      box-sizing: border-box;
    }
    .container {
      max-width: 550px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
      border: 1px solid #e2e8f0;
    }
    .header {
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      padding: 30px 40px;
      text-align: center;
    }
    .logo-text {
      color: #ffffff;
      font-size: 24px;
      font-weight: 700;
      letter-spacing: 0.5px;
      margin: 0;
    }
    .content {
      padding: 40px;
      color: #334155;
    }
    .content h2 {
      font-size: 22px;
      font-weight: 700;
      color: #0f172a;
      margin-top: 0;
      margin-bottom: 20px;
    }
    .content p {
      font-size: 15px;
      line-height: 1.6;
      color: #475569;
      margin-bottom: 30px;
    }
    .otp-card {
      background-color: #f8fafc;
      border: 2px dashed #cbd5e1;
      border-radius: 12px;
      padding: 24px;
      text-align: center;
      margin-bottom: 30px;
    }
    .otp-code {
      font-family: 'Courier New', Courier, monospace;
      font-size: 36px;
      font-weight: 700;
      color: #2563eb;
      letter-spacing: 6px;
      margin: 0;
    }
    .expiry-note {
      font-size: 13px;
      color: #94a3b8;
      margin-top: 8px;
    }
    .footer {
      background-color: #f8fafc;
      padding: 24px 40px;
      text-align: center;
      border-top: 1px solid #e2e8f0;
    }
    .footer p {
      font-size: 12px;
      color: #64748b;
      margin: 0 0 8px 0;
      line-height: 1.5;
    }
    .footer a {
      color: #2563eb;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header" style="text-align: center; padding: 25px 20px;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" style="margin: 0 auto; border-collapse: collapse;">
          <tr>
            <td style="vertical-align: middle; padding-right: 12px;">
              <img src="cid:zmahlogo" alt="ZMAH Logo" style="height: 45px; width: auto; display: block; border: 0;">
            </td>
            <td style="vertical-align: middle; color: #ffffff; font-size: 24px; font-weight: 700; letter-spacing: 0.5px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 45px;">
              ZMAH Technologies
            </td>
          </tr>
        </table>
      </div>
      <div class="content">
        <h2>Administrator OTP Request</h2>
        <p>Hello Admin,</p>
        <p>A request was made to recover the administrator account credentials. Please use the following One-Time Password (OTP) to reset your password. If you did not make this request, please change your password or verify the logs immediately.</p>
        <div class="otp-card">
          <div class="otp-code">${otp}</div>
          <div class="expiry-note">This code expires in 10 minutes</div>
        </div>
      </div>
      <div class="footer">
        <p>&copy; 2026 ZMAH Technologies. All rights reserved.</p>
        <p>If you need assistance, contact us at <a href="mailto:${process.env.EMAIL_FROM || process.env.SMTP_USER || 'zeetechnologies.pk@gmail.com'}">${process.env.EMAIL_FROM || process.env.SMTP_USER || 'zeetechnologies.pk@gmail.com'}</a></p>
      </div>
    </div>
  </div>
</body>
</html>
            `
    });

    if (!emailResult.success) {
      return res.status(500).json({ success: false, message: `Failed to deliver OTP email: ${emailResult.error || 'SMTP delivery failure'}` });
    }

    res.json({ success: true, message: "Admin OTP sent to email" });
  } catch (e) {
    console.error("Admin Forgot Password Error:", e);
    res.status(500).json({ success: false, message: e.message });
  }
});

app.post('/api/admin/reset-password', async (req, res) => {
  const { email, otp, newPassword } = req.body;
  try {
    const admin = await Admin.findOne({ email, resetOTP: otp, otpExpires: { $gt: Date.now() } });
    if (!admin) return res.json({ success: false, message: "Invalid OTP" });
    admin.password = await bcrypt.hash(newPassword, 10);
    admin.resetOTP = undefined; admin.otpExpires = undefined;
    await admin.save();
    res.json({ success: true });
  } catch (e) {
    console.error("Admin Reset Password Error:", e);
    res.status(500).json({ success: false, message: e.message });
  }
});

// --- ORDER ROUTES ---
app.post('/api/order/place', verifyToken, async (req, res) => {
  try {
    const count = await Order.countDocuments();
    const order_id = `${String(count + 1).padStart(2, '0')}${new Date().getMonth() + 1}${new Date().getFullYear()}`;
    const user = await User.findById(req.user.id);
    const customerDetails = req.body.customer_details || {};
    if (!customerDetails.email && user) {
      customerDetails.email = user.email;
    }
    console.log(`\n🛒 [ORDER PLACEMENT] Order #${order_id} by User ID ${req.user.id} | Recipient Email: "${customerDetails.email}"`);

    const newOrder = new Order({
      user_id: req.user.id,
      order_id,
      ...req.body,
      customer_details: customerDetails
    });
    await newOrder.save();
    if (req.body.cart_items) {
      for (const item of req.body.cart_items) {
        if (item.id) await Product.findByIdAndUpdate(item.id, { $inc: { stock: -item.quantity, sold: item.quantity } });
      }
    }
    sendOrderConfirmationEmail(newOrder).then(resInfo => {
      if (resInfo && !resInfo.success) {
        console.warn(`⚠️ [ORDER CONFIRMATION EMAIL FAILED] Order #${order_id}:`, resInfo.error);
      } else if (resInfo && resInfo.success) {
        console.log(`✅ [ORDER CONFIRMATION EMAIL DELIVERED] Order #${order_id} | Recipient: ${resInfo.to || customerDetails.email} | Message ID: ${resInfo.messageId}`);
      }
    }).catch(err => console.error("Order confirmation email failed to send:", err));
    res.json({ success: true, message: "Order Placed", orderId: order_id });
  } catch (err) {
    console.error("Order place error:", err);
    res.status(500).json({ success: false });
  }
});

app.post('/api/order/cancel/:id', verifyToken, async (req, res) => {
  try {
    const order = await Order.findOne({ order_id: req.params.id, user_id: req.user.id });
    if (!order) return res.json({ success: false });

    if (order.status !== 'Pending' && order.status !== 'Seller to Pack') {
      return res.json({ success: false, message: "Too late to cancel" });
    }

    order.status = 'Cancelled';
    order.cancelledBy = 'customer';

    await order.save();

    if (order.cart_items) {
      for (const item of order.cart_items) {
        if (item.id) await Product.findByIdAndUpdate(item.id, { $inc: { stock: item.quantity, sold: -item.quantity } });
      }
    }
    sendOrderStatusEmail(order).catch(err => console.error("Order status cancellation email failed to send:", err));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.get('/api/user/orders', verifyToken, async (req, res) => {
  const orders = await Order.find({ user_id: req.user.id }).sort({ created_at: -1 });
  res.json({ success: true, orders });
});

// --- ADMIN ROUTES ---

// UPDATE: Fetch Orders with Email Lookup
app.get('/api/admin/orders', async (req, res) => {
  try {
    const orders = await Order.find().sort({ created_at: -1 }).lean();

    const enrichedOrders = await Promise.all(orders.map(async (order) => {

      if (!order.customer_details || !order.customer_details.email) {

        if (order.user_id) {
          const user = await User.findById(order.user_id);
          if (user) {
            if (!order.customer_details) order.customer_details = {};
            order.customer_details.email = user.email;
          }
        }
      }
      return order;
    }));

    res.json({ success: true, orders: enrichedOrders });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, orders: [] });
  }
});

app.put('/api/admin/order/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    console.log(`\n📦 [ADMIN ORDER STATUS UPDATE] Order ID: "${req.params.id}" -> New Status: "${status}"`);

    let order = await Order.findOne({ order_id: req.params.id });
    if (!order && mongoose.Types.ObjectId.isValid(req.params.id)) {
      order = await Order.findById(req.params.id);
    }

    if (!order) {
      console.warn(`⚠️ [ORDER STATUS ERROR] Order not found for ID: "${req.params.id}"`);
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (order.status === 'Delivered') {
      return res.status(400).json({ success: false, message: "Delivered orders cannot be modified" });
    }

    order.status = status;
    if (status === 'Cancelled') {
      order.cancelledBy = 'admin';
    } else {
      order.cancelledBy = null;
    }
    await order.save();
    console.log(`💾 [ORDER UPDATED IN DB] Order #${order.order_id} status saved as "${status}"`);

    sendOrderStatusEmail(order).then(resInfo => {
      if (resInfo && !resInfo.success) {
        console.warn(`⚠️ [ORDER STATUS EMAIL FAILED] Could not deliver status email for #${order.order_id}:`, resInfo.error);
      } else if (resInfo && resInfo.success) {
        console.log(`✅ [ORDER STATUS EMAIL DELIVERED] Order #${order.order_id} | Recipient: ${resInfo.to || order.customer_details?.email} | Message ID: ${resInfo.messageId}`);
      }
    }).catch(err => console.error("Admin order status email failed to send:", err));
    res.json({ success: true });
  } catch (e) {
    console.error("Admin order status error:", e);
    res.status(500).json({ success: false, message: e.message });
  }
});

app.put('/api/admin/update', verifyToken, async (req, res) => {
  try {
    const { username, email, newPassword } = req.body;
    const admin = await Admin.findById(req.user.id);
    if (!admin) return res.status(404).json({ success: false, message: "Admin not found" });
    if (username) admin.username = username;
    if (email) admin.email = email;
    if (newPassword) admin.password = await bcrypt.hash(newPassword, 10);
    await admin.save();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false }); }
});

app.get('/api/admin/profile', verifyToken, async (req, res) => {
  try {
    const admin = await Admin.findById(req.user.id).select('-password');
    if (!admin) return res.status(404).json({ success: false, message: "Admin not found" });
    res.json({ success: true, admin });
  } catch (e) { res.status(500).json({ success: false }); }
});

app.put('/api/user/update', verifyToken, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, req.body);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false }); }
});

app.get('/api/admin/stats', async (req, res) => {
  const earnings = await Order.aggregate([{ $match: { status: { $ne: 'Cancelled' } } }, { $group: { _id: null, total: { $sum: "$total_bill" } } }]);
  const total = await Order.countDocuments();
  const cancelled = await Order.countDocuments({ status: 'Cancelled' });
  const pending = await Order.countDocuments({ status: { $nin: ['Delivered', 'Cancelled'] } });
  const completed = await Order.countDocuments({ status: 'Delivered' });
  const lowStock = await Product.find({ stock: { $lte: 7 } });
  res.json({
    success: true,
    total_earnings: earnings.length ? earnings[0].total : 0,
    total_orders: total, cancelled_orders: cancelled, pending_orders: pending, completed_orders: completed,
    low_stock_count: lowStock.length, low_stock_items: lowStock
  });
});

app.get('/api/admin/revenue-analytics', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let matchStage = { status: 'Delivered' };

    if (startDate && endDate) {
      matchStage.created_at = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const rawOrders = await Order.find(matchStage).lean();
    const orders = await Promise.all(rawOrders.map(async (order) => {
      if (!order.customer_details) {
        order.customer_details = {};
      }
      if (!order.customer_details.fullName || !order.customer_details.email) {
        if (order.user_id) {
          const user = await User.findById(order.user_id).lean();
          if (user) {
            if (!order.customer_details.fullName) {
              order.customer_details.fullName = user.fullName || (user.firstName ? user.firstName + ' ' + user.lastName : 'N/A');
            }
            if (!order.customer_details.email) {
              order.customer_details.email = user.email || 'N/A';
            }
          }
        }
      }
      if (!order.customer_details.paymentMethod) {
        order.customer_details.paymentMethod = 'Cash on Delivery (COD)';
      }
      return order;
    }));
    
    // Process data
    let totalRevenue = 0;
    let deliveredOrdersCount = orders.length;
    let todayRevenue = 0;
    let todayOrdersCount = 0;
    let thisMonthRevenue = 0;
    let thisMonthOrdersCount = 0;
    let thisYearRevenue = 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const firstDayOfYear = new Date(today.getFullYear(), 0, 1);

    const topProductsMap = {};
    const topCustomersMap = {};
    const paymentMethodsMap = {};
    
    const dailyRevenueMap = {};
    const monthlyRevenueMap = {};

    for (const order of orders) {
      const orderTotal = order.total_bill || 0;
      totalRevenue += orderTotal;
      
      const orderDate = new Date(order.created_at);
      orderDate.setHours(0,0,0,0);

      // Today
      if (orderDate.getTime() === today.getTime()) {
        todayRevenue += orderTotal;
        todayOrdersCount++;
      }

      // This Month
      if (orderDate >= firstDayOfMonth) {
        thisMonthRevenue += orderTotal;
        thisMonthOrdersCount++;
      }

      // This Year
      if (orderDate >= firstDayOfYear) {
        thisYearRevenue += orderTotal;
      }

      // Date-wise summary (Daily)
      const dateString = orderDate.toISOString().split('T')[0];
      if (!dailyRevenueMap[dateString]) dailyRevenueMap[dateString] = { count: 0, revenue: 0 };
      dailyRevenueMap[dateString].count++;
      dailyRevenueMap[dateString].revenue += orderTotal;

      // Monthly summary
      const monthString = orderDate.toLocaleString('default', { month: 'short', year: 'numeric' });
      if (!monthlyRevenueMap[monthString]) monthlyRevenueMap[monthString] = { count: 0, revenue: 0 };
      monthlyRevenueMap[monthString].count++;
      monthlyRevenueMap[monthString].revenue += orderTotal;

      // Top Products
      if (order.cart_items && Array.isArray(order.cart_items)) {
        for (const item of order.cart_items) {
          const prodName = item.name || item.title || 'Unknown';
          const qty = item.quantity || 1;
          const price = item.price || 0;
          if (!topProductsMap[prodName]) topProductsMap[prodName] = { name: prodName, qty: 0, revenue: 0 };
          topProductsMap[prodName].qty += qty;
          topProductsMap[prodName].revenue += (qty * price);
        }
      }

      // Top Customers
      const custKey = (order.customer_details && order.customer_details.fullName) ? order.customer_details.fullName : ((order.customer_details && order.customer_details.firstName) ? order.customer_details.firstName + ' ' + order.customer_details.lastName : 'Unknown');
      const custEmail = (order.customer_details && order.customer_details.email) ? order.customer_details.email : '';
      if (!topCustomersMap[custKey]) topCustomersMap[custKey] = { name: custKey, email: custEmail, orders: 0, spending: 0 };
      topCustomersMap[custKey].orders++;
      topCustomersMap[custKey].spending += orderTotal;

      // Payment Method
      const pm = (order.customer_details && order.customer_details.paymentMethod) ? order.customer_details.paymentMethod : 'Cash on Delivery (COD)';
      if (!paymentMethodsMap[pm]) paymentMethodsMap[pm] = { method: pm, count: 0, revenue: 0 };
      paymentMethodsMap[pm].count++;
      paymentMethodsMap[pm].revenue += orderTotal;
    }

    const averageOrderValue = deliveredOrdersCount > 0 ? (totalRevenue / deliveredOrdersCount) : 0;
    
    // Sort and convert maps to arrays
    const topProducts = Object.values(topProductsMap).sort((a,b) => b.qty - a.qty).slice(0, 10);
    const topCustomers = Object.values(topCustomersMap).sort((a,b) => b.spending - a.spending).slice(0, 10);
    const paymentMethods = Object.values(paymentMethodsMap).sort((a,b) => b.revenue - a.revenue);
    
    // For date arrays, sort by date
    const dailySummary = Object.keys(dailyRevenueMap).map(k => ({ date: k, ...dailyRevenueMap[k] })).sort((a,b) => new Date(b.date) - new Date(a.date));
    const monthlySummary = Object.keys(monthlyRevenueMap).map(k => ({ month: k, ...monthlyRevenueMap[k] }));

    res.json({
      success: true,
      orders,
      summary: {
        totalRevenue,
        deliveredOrdersCount,
        averageOrderValue,
        todayRevenue,
        todayOrdersCount,
        thisMonthRevenue,
        thisMonthOrdersCount,
        thisYearRevenue
      },
      topProducts,
      topCustomers,
      paymentMethods,
      dailySummary,
      monthlySummary
    });
  } catch (error) {
    console.error("Revenue Analytics Error: ", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/contact', async (req, res) => {
  const { name, email, subject, message } = req.body;
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
  const currentDate = new Date().toLocaleString('en-US', { timeZone: 'Asia/Karachi' });
  try {
    const emailResult = await sendEmail({
      from: `"${process.env.EMAIL_FROM_NAME || 'Zee Technologies'}" <${process.env.EMAIL_FROM || process.env.SMTP_USER || 'zeetechnologies.pk@gmail.com'}>`, to: process.env.EMAIL_FROM || process.env.SMTP_USER || 'zeetechnologies.pk@gmail.com', replyTo: email,
      subject: `Contact Inquiry: ${subject}`,
      attachments: [{
        filename: 'logo.png',
        path: path.join(__dirname, '../frontend/assets/STMP.png'),
        cid: 'zmahlogo'
      }],
      html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Inquiry Received - ZMAH Technologies</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #f1f5f9;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
      width: 100% !important;
    }
    .wrapper {
      width: 100%;
      background-color: #f1f5f9;
      padding: 40px 20px;
      box-sizing: border-box;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
      border: 1px solid #e2e8f0;
    }
    .header {
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      padding: 30px 40px;
      text-align: center;
    }
    .logo-text {
      color: #ffffff;
      font-size: 24px;
      font-weight: 700;
      letter-spacing: 0.5px;
      margin: 0;
    }
    .content {
      padding: 40px;
      color: #334155;
    }
    .content h2 {
      font-size: 22px;
      font-weight: 700;
      color: #0f172a;
      margin-top: 0;
      margin-bottom: 20px;
    }
    .info-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
    }
    .info-table td {
      padding: 10px 12px;
      border-bottom: 1px solid #f1f5f9;
      font-size: 14px;
    }
    .info-table .label {
      font-weight: 600;
      color: #64748b;
      width: 130px;
    }
    .info-table .value {
      color: #0f172a;
    }
    .message-box {
      background-color: #f8fafc;
      border-left: 4px solid #2563eb;
      padding: 16px 20px;
      border-radius: 0 8px 8px 0;
      font-size: 14px;
      line-height: 1.6;
      color: #334155;
      white-space: pre-wrap;
      margin-top: 8px;
    }
    .footer {
      background-color: #f8fafc;
      padding: 20px 40px;
      text-align: center;
      border-top: 1px solid #e2e8f0;
    }
    .footer p {
      font-size: 12px;
      color: #64748b;
      margin: 0;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header" style="text-align: center; padding: 25px 20px;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" style="margin: 0 auto; border-collapse: collapse;">
          <tr>
            <td style="vertical-align: middle; padding-right: 12px;">
              <img src="cid:zmahlogo" alt="ZMAH Logo" style="height: 45px; width: auto; display: block; border: 0;">
            </td>
            <td style="vertical-align: middle; color: #ffffff; font-size: 24px; font-weight: 700; letter-spacing: 0.5px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 45px;">
              ZMAH Technologies
            </td>
          </tr>
        </table>
      </div>
      <div class="content">
        <h2>New Contact Inquiry</h2>
        <table class="info-table">
          <tr>
            <td class="label">Sender Name:</td>
            <td class="value">${name}</td>
          </tr>
          <tr>
            <td class="label">Email Address:</td>
            <td class="value">${email}</td>
          </tr>
          <tr>
            <td class="label">Subject:</td>
            <td class="value">${subject}</td>
          </tr>
          <tr>
            <td class="label">Date:</td>
            <td class="value">${currentDate}</td>
          </tr>
          <tr>
            <td class="label">IP Address:</td>
            <td class="value">${clientIp}</td>
          </tr>
        </table>
        <div style="font-weight: 600; font-size: 15px; color: #475569; margin-bottom: 10px;">Message:</div>
        <div class="message-box">${message}</div>
      </div>
      <div class="footer">
        <p>This inquiry was sent from the Contact Us form on ZMAH Technologies website.</p>
      </div>
    </div>
  </div>
</body>
</html>
            `
    });

    if (!emailResult.success) {
      return res.status(500).json({ success: false, message: `Failed to deliver contact inquiry: ${emailResult.error || 'SMTP delivery failure'}` });
    }

    res.json({ success: true, message: "Message sent successfully" });
  } catch (e) {
    console.error("Contact Form Error:", e);
    res.status(500).json({ success: false, message: e.message });
  }
});

// --- DIAGNOSTIC / DEV EMAIL ENDPOINTS (Never exposes credentials) ---
app.get('/api/dev/verify-smtp', async (req, res) => {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return res.json({ success: false, message: "SMTP credentials not configured in .env" });
  }
  try {
    await transporter.verify();
    res.json({
      success: true,
      message: "SMTP Transporter verified successfully",
      config: {
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: smtpPort,
        secure: isSecure,
        user: process.env.SMTP_USER,
        fromName: process.env.EMAIL_FROM_NAME || 'Zee Technologies',
        fromEmail: process.env.EMAIL_FROM || process.env.SMTP_USER
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "SMTP Verification failed: " + err.message,
      code: err.code,
      command: err.command
    });
  }
});

app.post('/api/dev/test-email', async (req, res) => {
  const targetEmail = req.body.to || process.env.SMTP_USER;
  try {
    const result = await sendEmail({
      to: targetEmail,
      subject: "Test Diagnostic Email - ZMAH Technologies",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f8fafc; border-radius: 8px;">
          <h2 style="color: #0f172a;">SMTP Delivery Verification</h2>
          <p>This is an automated test email confirming that SMTP is working properly on <strong>${process.env.SMTP_HOST || 'smtp.gmail.com'}</strong>.</p>
          <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
          <p><strong>Target:</strong> ${targetEmail}</p>
        </div>
      `
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: "Failed to deliver test email: " + (result.error || "Unknown error")
      });
    }

    res.json({
      success: true,
      message: "Test email successfully delivered",
      messageId: result.messageId,
      response: result.response,
      recipient: targetEmail
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Exception during test email: " + err.message
    });
  }
});

app.listen(port, () => console.log(`Server running on http://localhost:${port}`));