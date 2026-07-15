const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  telegramId: { type: String, required: true, unique: true, index: true },
  username: { type: String, default: '' },
  gold: { type: Number, default: 0 },
  diamonds: { type: Number, default: 0 },
  isAdmin: { type: Boolean, default: false },
  
  // Anti-Cheat Referral System
  referredBy: { type: String, default: null, index: true },
  isReferralActive: { type: Boolean, default: false },
  
  // Game State & Checkin/Spin Tracker (Asia/Ho_Chi_Minh timezone)
  lastCheckInDateStr: { type: String, default: '' }, // Định dạng "YYYY-MM-DD"
  lastSpinDateStr: { type: String, default: '' },    // Định dạng "YYYY-MM-DD"
  boostUntil: { type: Date, default: null },         // Thẻ x2 tốc độ đào
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
