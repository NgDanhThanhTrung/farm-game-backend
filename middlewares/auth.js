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
    
    // Sắp xếp các tham số theo bảng chữ cái alphabet để tạo data-check-string
    const dataCheckArr = [];
    urlParams.sort();
    for (const [key, value] of urlParams.entries()) {
      if (key !== 'hash') {
        dataCheckArr.push(`${key}=${value}`);
      }
    }
    const dataCheckString = dataCheckArr.join('\n');

    // Tạo Secret Key từ Bot Token
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(process.env.BOT_TOKEN || '')
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
    
    // Tìm hoặc khởi tạo User trong Database để đính kèm vào payload req
    let user = await User.findOne({ telegramId: String(tgUser.id) });
    if (!user) {
      user = await User.create({
        telegramId: String(tgUser.id),
        username: tgUser.username || '',
        isAdmin: String(tgUser.id) === process.env.ADMIN_TELEGRAM_ID
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
