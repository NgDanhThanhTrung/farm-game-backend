const mongoose = require('mongoose');

const SystemConfigSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, default: 'main_config' },
  ecpmRate: { type: Number, default: 2.0 }, // Giá trị eCPM từ Adsgram (ví dụ $2.0)
  userSharePercentage: { type: Number, default: 50 }, // Tỷ lệ chia sẻ cho user (50%)
  usdToDiamondRate: { type: Number, default: 1000 }, // Tỷ giá quy đổi $1 = 1000 Kim Cương
}, { timestamps: true });

module.exports = mongoose.model('SystemConfig', SystemConfigSchema);
