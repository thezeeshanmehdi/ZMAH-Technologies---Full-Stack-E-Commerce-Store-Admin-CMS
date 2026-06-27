const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    fullName: String,
    email: { type: String, unique: true, required: true },
    contact: String,
    city: String,
    address: String,
    password: { type: String, required: true },
    
    // 🔥 Ye hain wo 2 naye fields jo Password Recovery ke liye chahiye
    resetOTP: { type: String },
    otpExpires: { type: Date }
});

module.exports = mongoose.model('User', userSchema);