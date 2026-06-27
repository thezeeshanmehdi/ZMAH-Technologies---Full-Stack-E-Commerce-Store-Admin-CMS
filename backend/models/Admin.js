const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    email: { type: String, default: 'zeetechologies.pk@gmail.com' }, // Recovery Email
    
    // 🔥 Admin ke liye bhi OTP fields
    resetOTP: { type: String },
    otpExpires: { type: Date }
});

module.exports = mongoose.model('Admin', adminSchema);