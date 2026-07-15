const crypto = require('crypto');
const User = require('../models/User');

/**
 * Middleware xác thực initData gửi từ Telegram WebApp bằng cơ chế HMAC-SHA256
 */
const verifyTelegramWebappData = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing InitData Token.' });
    }

    const initData = authHeader.split(' ')[1];
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    
    if (!hash) {
      return res.status(401).json({ error: 'Unauthorized: Missing Hash.' });
    }

    // GOM VÀ SẮP XẾP CHUẨN:
    // Đưa tất cả các cặp key=value (ngoại trừ hash) vào mảng, sau đó mới sort mảng này
    const dataParams = [];
    for (const [key, value] of urlParams.entries()) {
      if (key !== 'hash') {
        dataParams.push(`${key}=${value}`);
      }
    }
    dataParams.sort(); // Sắp xếp theo bảng chữ cái
    const dataCheckString = dataParams.join('\n');

    const botToken = process.env.BOT_TOKEN;
    if (!botToken) {
      console.error('[Auth Error]: BOT_TOKEN is not configured in environment.');
      return res.status(500).json({ error: 'Internal Server Error: Bot token missing.' });
    }

    // Tạo Secret Key từ Bot Token
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    // Tính toán hash cục bộ để so sánh chống giả mạo chữ ký
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (calculatedHash !== hash) {
      return res.status(401).json({ error: 'Unauthorized: Invalid Hash Security.' });
    }

    // Parse thông tin user từ chuỗi initData
    const userRaw = urlParams.get('user');
    if (!userRaw) {
      return res.status(400).json({ error: 'Invalid User Data in InitData.' });
    }

    const tgUser = JSON.parse(userRaw);
    const tgIdStr = String(tgUser.id);
    
    // Tìm hoặc khởi tạo User trong Database để đính kèm vào payload req
    let user = await User.findOne({ telegramId: tgIdStr });
    if (!user) {
      user = await User.create({
        telegramId: tgIdStr,
        username: tgUser.username || '',
        isAdmin: tgIdStr === process.env.ADMIN_TELEGRAM_ID
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('[Auth Middleware Error]:', error);
    return res.status(500).json({ error: 'Internal Server Error during Authentication.' });
  }
};

/**
 * Middleware kiểm tra quyền Quyền quản trị viên (Admin)
 */
const isAdmin = (req, res, next) => {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: 'Forbidden: Admin privilege required.' });
  }
  next();
};

module.exports = { verifyTelegramWebappData, isAdmin };
