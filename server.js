require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db.js');
const bot = require('./bot.js');
const User = require('./models/User');
const SystemConfig = require('./models/SystemConfig');
const { verifyTelegramWebappData, isAdmin } = require('./middlewares/auth');

const app = express();
app.use(cors());
app.use(express.json());

// Kết nối cơ sở dữ liệu MongoDB
connectDB();

// Khởi tạo cấu hình mặc định hệ thống nếu chưa tồn tại trong DB
(async () => {
  try {
    const config = await SystemConfig.findOne({ key: 'main_config' });
    if (!config) {
      await SystemConfig.create({ key: 'main_config' });
      console.log('[SystemConfig] Initialized default configurations.');
    }
  } catch (err) {
    console.error('Error initializing SystemConfig:', err);
  }
})();

/**
 * ==========================================
 * USER API - NGHIỆP VỤ GAME & ADSGRAM
 * ==========================================
 */

// API nhận thưởng khi xem Adsgram thành công từ Webview (Xử lý backend chống cheat hoàn toàn)
app.post('/api/claim-ads-reward', verifyTelegramWebappData, async (req, res) => {
  try {
    const user = req.user;
    
    // Đọc cấu hình kinh tế hiện tại từ Database
    const config = await SystemConfig.findOne({ key: 'main_config' });
    if (!config) {
      return res.status(500).json({ error: 'System configuration not found.' });
    }
    
    // Tính toán phần thưởng kinh tế theo công thức quy định: 
    const rewardDiamonds = (config.ecpmRate / 1000) * (config.userSharePercentage / 100) * config.usdToDiamondRate;
    
    // Cộng thưởng Kim Cương trực tiếp cho chính User
    user.diamonds += rewardDiamonds;

    // CHỐNG CHEAT & RACE CONDITION REFERRAL:
    if (user.referredBy && !user.isReferralActive) {
      // Đánh dấu cờ kích hoạt ngay lập tức trước khi lưu để chặn các luồng request đồng thời
      user.isReferralActive = true;
      user.gold += 200; // Thưởng chào mừng cho người được giới thiệu (B)

      // Tìm và cập nhật nguyên tử (Atomic Update) tài khoản của người mời (A) để tránh xung đột ghi đè
      const referrer = await User.findOneAndUpdate(
        { telegramId: user.referredBy },
        { $inc: { gold: 500 } },
        { new: true }
      );

      if (referrer) {
        // Sử dụng Bot Telegram để thông báo tức thì cho Người mời (A)
        try {
          await bot.telegram.sendMessage(
            referrer.telegramId,
            `🎉 Chúc mừng! Người bạn giới thiệu (@${user.username || 'ẩn danh'}) đã hoạt động thành công.\n💰 Bạn nhận được +500 Vàng thưởng!`
          );
        } catch (botErr) {
          console.error(`Không thể gửi tin nhắn Telegram tới Referrer ${referrer.telegramId}:`, botErr.message);
        }
      }
    } else if (user.referredBy && user.isReferralActive) {
      // Từ lượt xem thứ 2 trở đi của B, A nhận hoa hồng thụ động (10% Kim Cương)
      const passiveCommission = rewardDiamonds * 0.1;
      await User.updateOne(
        { telegramId: user.referredBy },
        { $inc: { diamonds: passiveCommission } }
      );
    }

    await user.save();
    return res.status(200).json({
      success: true,
      rewardDiamonds,
      currentDiamonds: user.diamonds,
      currentGold: user.gold,
      isReferralActive: user.isReferralActive
    });
  } catch (error) {
    console.error('Error claiming ads reward:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * ==========================================
 * HIGH SECURITY ADMIN APIS (Kiểm tra nghiêm ngặt)
 * ==========================================
 */

// GET: Lấy danh sách toàn bộ người dùng trong hệ thống
app.get('/api/admin/users', verifyTelegramWebappData, isAdmin, async (req, res) => {
  try {
    const users = await User.find({}).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data: users });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// GET: Lấy cấu hình game hiện tại
app.get('/api/admin/config', verifyTelegramWebappData, isAdmin, async (req, res) => {
  try {
    const config = await SystemConfig.findOne({ key: 'main_config' });
    return res.status(200).json({ success: true, data: config });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// POST: Cập nhật cấu hình kinh tế Game
app.post('/api/admin/config', verifyTelegramWebappData, isAdmin, async (req, res) => {
  try {
    const { ecpmRate, userSharePercentage, usdToDiamondRate } = req.body;
    const config = await SystemConfig.findOneAndUpdate(
      { key: 'main_config' },
      { ecpmRate, userSharePercentage, usdToDiamondRate },
      { new: true, upsert: true }
    );
    return res.status(200).json({ success: true, message: 'Cập nhật cấu hình thành công!', data: config });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// POST: Broadcast - Gửi tin nhắn hàng loạt bằng Bot chống dính Spam Limit (delay 50ms)
app.post('/api/admin/broadcast', verifyTelegramWebappData, isAdmin, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Nội dung tin nhắn trống.' });

    const allUsers = await User.find({}, 'telegramId');
    
    let successCount = 0;
    for (const targetUser of allUsers) {
      try {
        await bot.telegram.sendMessage(targetUser.telegramId, message);
        successCount++;
      } catch (err) {
        console.error(`Broadcast thất bại tới ID ${targetUser.telegramId}:`, err.message);
      }
      // Tránh vi phạm giới hạn gửi API của Telegram (Max 30 tin nhắn mỗi giây)
      await new Promise(resolve => setTimeout(resolve, 50)); 
    }

    return res.status(200).json({
      success: true,
      message: `Quá trình gửi tin hoàn tất. Thành công ${successCount}/${allUsers.length} người dùng.`
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * ==========================================
 * KHỞI CHẠY HỆ THỐNG SONG SONG (EXPRESS & TELEGRAF)
 * ==========================================
 */
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`[Express Server] API Running on port ${PORT}`);
  
  bot.launch()
    .then(() => console.log('[Telegram Bot] Bot long-polling initialized successfully.'))
    .catch((err) => console.error('[Telegram Bot] Error launching bot:', err));
});

// Xử lý đóng kết nối an toàn khi tắt tiến trình hệ thống
process.once('SIGINT', () => { bot.stop('SIGINT'); process.exit(0); });
process.once('SIGTERM', () => { bot.stop('SIGTERM'); process.exit(0); });
