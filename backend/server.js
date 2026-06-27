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

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.zoho.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  requireTLS: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS || 'd8BUVYr8LB1n'
  },
  tls: {
    rejectUnauthorized: false
  }
});

const sendEmail = async (mailOptions) => {
  if (!process.env.SMTP_PASS || !process.env.SMTP_USER) {
    console.log("\n=========================================");
    console.log("📧 MOCK EMAIL LOGGED (SMTP credentials are not set):");
    console.log(`To: ${mailOptions.to}`);
    console.log(`Subject: ${mailOptions.subject}`);
    const digitsMatch = mailOptions.html.match(/>(\d{6})</);
    if (digitsMatch) {
      console.log(`🔑 OTP Code: ${digitsMatch[1]}`);
    } else {
      const cleanText = mailOptions.html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      console.log(`Message Snippet: ${cleanText.substring(0, 300)}...`);
    }
    console.log("=========================================\n");
    return { messageId: "mock-id" };
  }
  const info = await transporter.sendMail(mailOptions);
  console.log(`📧 Email sent successfully! Message ID: ${info.messageId}, Response: ${info.response}`);
  return info;
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
      from: `"ZMAH Orders" <${process.env.EMAIL_FROM || 'zeetechnologies@zohomail.com'}>`,
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
        <p>If you have any questions, please contact our support team at <a href="mailto:${process.env.EMAIL_FROM || 'zeetechnologies@zohomail.com'}">${process.env.EMAIL_FROM || 'zeetechnologies@zohomail.com'}</a></p>
      </div>
    </div>
  </div>
</body>
</html>
      `
    };

    await sendEmail(mailOptions);
  } catch (error) {
    console.error("sendOrderConfirmationEmail Error:", error);
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
      from: `"ZMAH Orders" <${process.env.EMAIL_FROM || 'zeetechnologies@zohomail.com'}>`,
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
        <p>If you have any questions, please contact our support team at <a href="mailto:${process.env.EMAIL_FROM || 'zeetechnologies@zohomail.com'}">${process.env.EMAIL_FROM || 'zeetechnologies@zohomail.com'}</a></p>
      </div>
    </div>
  </div>
</body>
</html>
      `
    };
 
    await sendEmail(mailOptions);
  } catch (error) {
    console.error("sendOrderStatusEmail Error:", error);
  }
};

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// app.use(cors());
app.use(express.static(path.join(__dirname, '../frontend')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Assets folder ke liye bhi path set karein (Zaroori hai)
app.use('/assets', express.static(path.join(__dirname, '../frontend/assets')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // Uploads backend mein hi rahega

const dbURI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/msw_enterprises';
mongoose.connect(dbURI)
  .then(async () => {
    console.log("MongoDB Connected");
    const adminExists = await Admin.findOne({ username: 'msw_admin' });
    const defaultEmail = process.env.EMAIL_FROM || 'zeetechnologies@zohomail.com';
    if (!adminExists) {
      const hash = await bcrypt.hash('msw_password', 10);
      await new Admin({ username: 'msw_admin', password: hash, email: defaultEmail }).save();
      console.log("Default Admin Created");
    } else if (adminExists.email !== defaultEmail) {
      adminExists.email = defaultEmail;
      await adminExists.save();
      console.log("Default Admin Email Synchronized");
    }
  }).catch(err => console.log(err));

const adminSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  password: String,
  email: { type: String, default: 'zeetechnologies@zohomail.com' },
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
  try {
    const user = await User.findOne({ email });
    if (!user) return res.json({ success: false, message: "User not found" });
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetOTP = otp; user.otpExpires = Date.now() + 600000;
    await user.save();
    await sendEmail({
      from: `"ZMAH Support" <${process.env.EMAIL_FROM || 'zeetechnologies@zohomail.com'}>`, to: email,
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
        <p>If you need assistance, contact us at <a href="mailto:zeetechnologies.pk@gmail.com">zeetechnologies.pk@gmail.com</a></p>
      </div>
    </div>
  </div>
</body>
</html>
            `
    });
    res.json({ success: true });
  } catch (e) {
    console.error("Forgot Password Error:", e); // Render logs mein error print hoga
    res.status(500).json({ success: false, message: e.message }); // Frontend ko error dikhega
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
  try {
    if (!email) return res.json({ success: false, message: "Email is required" });
    const admin = await Admin.findOne({ email });
    if (!admin) return res.json({ success: false, message: "Admin account with this email not found" });
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    admin.resetOTP = otp; admin.otpExpires = Date.now() + 600000;
    await admin.save();
    await sendEmail({
      from: `"ZMAH Admin" <${process.env.EMAIL_FROM || 'zeetechnologies@zohomail.com'}>`, to: admin.email,
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
        <p>If you need assistance, contact us at <a href="mailto:${process.env.EMAIL_FROM || 'zeetechnologies@zohomail.com'}">${process.env.EMAIL_FROM || 'zeetechnologies@zohomail.com'}</a></p>
      </div>
    </div>
  </div>
</body>
</html>
            `
    });
    res.json({ success: true });
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
    const newOrder = new Order({ user_id: req.user.id, order_id, ...req.body });
    await newOrder.save();
    if (req.body.cart_items) {
      for (const item of req.body.cart_items) {
        if (item.id) await Product.findByIdAndUpdate(item.id, { $inc: { stock: -item.quantity, sold: item.quantity } });
      }
    }
    sendOrderConfirmationEmail(newOrder).catch(err => console.error("Order confirmation email failed to send:", err));
    res.json({ success: true, message: "Order Placed", orderId: order_id });
  } catch (err) { res.status(500).json({ success: false }); }
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

    let order = await Order.findOne({ order_id: req.params.id });
    if (!order && mongoose.Types.ObjectId.isValid(req.params.id)) {
      order = await Order.findById(req.params.id);
    }

    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

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

    sendOrderStatusEmail(order).catch(err => console.error("Admin order status email failed to send:", err));
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
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
    await sendEmail({
      from: `"ZMAH Contact" <${process.env.EMAIL_FROM || 'zeetechnologies@zohomail.com'}>`, to: process.env.EMAIL_FROM || 'zeetechnologies@zohomail.com', replyTo: email,
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
      border-bottom: 2px solid #f1f5f9;
      padding-bottom: 15px;
    }
    .info-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
    }
    .info-table td {
      padding: 12px 0;
      vertical-align: top;
      font-size: 15px;
    }
    .info-table .label {
      width: 120px;
      font-weight: 600;
      color: #475569;
    }
    .info-table .value {
      color: #0f172a;
    }
    .message-box {
      background-color: #f8fafc;
      border-left: 4px solid #2563eb;
      border-radius: 4px;
      padding: 20px;
      font-style: italic;
      color: #334155;
      font-size: 15px;
      line-height: 1.6;
      margin-bottom: 30px;
      white-space: pre-wrap;
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
      margin: 0;
      line-height: 1.5;
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
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false }); }
});

app.listen(port, () => console.log(`Server running on http://localhost:${port}`));