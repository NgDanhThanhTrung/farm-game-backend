const { Telegraf } = require('telegraf');
const moment = require('moment-timezone');
const User = require('./models/User');

const bot = new Telegraf(process.env.BOT_TOKEN);

// Memory-based Rate Limiter (Tối đa 1 lệnh mỗi 3 giây cho mỗi User)
const rateLimitMap = new Map();
bot.use((ctx, next) => {
  if (!ctx.from) return next();
  const userId = ctx.from.id;
  const now = Date.now();
  const lastTime = rateLimitMap.get(userId) || 0;

  if (now - lastTime < 3000) {
    return ctx.reply('⚠️ Vui lòng thao tác chậm lại! (Giới hạn 3 giây/lệnh)');
  }
  rateLimitMap.set(userId, now);
  return next();
});

// Xử lý lệnh /start kết hợp Anti-Cheat Referral System
bot.start(async (ctx) => {
  try {
    const tgId = String(ctx.from.id);
    const username = ctx.from.username || ctx.from.first_name || 'Khaithacvien';
    const payload = ctx.payload; // Lấy tham số ref từ link t.me/bot?start=ref_XXXX

    let user = await User.findOne({ telegramId: tgId });
    
    if (!user) {
      let referredBy = null;

      // FIX LỖI DEEP-LINK: Cắt bỏ tiền tố "ref_" để lấy chính xác Telegram ID của người mời
      if (payload && payload.startsWith('ref_')) {
        const referrerId = payload.replace('ref_', '').trim();
        const isSelfReferral = referrerId === tgId;
        const referrerExists = await User.findOne({ telegramId: referrerId });

        if (referrerExists && !isSelfReferral) {
          referredBy = referrerId;
        }
      }

      user = new User({
        telegramId: tgId,
        username: username,
        isAdmin: tgId === process.env.ADMIN_TELEGRAM_ID,
        referredBy: referredBy,
        isReferralActive: false // Luôn ở trạng thái CHỜ kích hoạt quảng cáo lần đầu
      });
      await user.save();
      
      let welcomeMsg = `Chào mừng ${username} đến với Nông Trại Farm Game! 🌾\nSử dụng các lệnh /checkin hoặc /spin để nhận quà hàng ngày.`;
      if (referredBy) {
        welcomeMsg += `\n\n🔗 Bạn đã được mời bởi người chơi có ID: ${referredBy}. Hãy mở game trên Webview và xem 1 lượt Quảng cáo để nhận quà liên kết cho cả hai!`;
      }
      ctx.reply(welcomeMsg);
    } else {
      ctx.reply(`Chào mừng quay trở lại, ${username}! Hãy tiếp tục thu hoạch nông trại của bạn.`);
    }
  } catch (err) {
    console.error('Bot /start error:', err);
  }
});

// Lệnh /checkin chuẩn múi giờ Việt Nam GMT+7
bot.command('checkin', async (ctx) => {
  try {
    const tgId = String(ctx.from.id);
    const todayStr = moment().tz('Asia/Ho_Chi_Minh').format('YYYY-MM-DD');

    const user = await User.findOne({ telegramId: tgId });
    if (!user) return ctx.reply('Tài khoản chưa được khởi tạo. Vui lòng gõ /start');

    if (user.lastCheckInDateStr === todayStr) {
      return ctx.reply('📅 Hôm nay bạn đã điểm danh rồi! Hãy quay lại sau 00:00 ngày mai.');
    }

    user.lastCheckInDateStr = todayStr;
    user.gold += 100; // Thưởng điểm danh cố định 100 Vàng
    await user.save();

    ctx.reply(`✅ Điểm danh ngày ${todayStr} thành công! Bạn nhận được +100 Vàng. 💰`);
  } catch (err) {
    console.error('Bot /checkin error:', err);
  }
});

// Lệnh /spin vòng quay may mắn hàng ngày (GMT+7)
bot.command('spin', async (ctx) => {
  try {
    const tgId = String(ctx.from.id);
    const todayStr = moment().tz('Asia/Ho_Chi_Minh').format('YYYY-MM-DD');

    const user = await User.findOne({ telegramId: tgId });
    if (!user) return ctx.reply('Tài khoản chưa được khởi tạo. Vui lòng gõ /start');

    if (user.lastSpinDateStr === todayStr) {
      return ctx.reply('🎰 Bạn đã hết lượt quay miễn phí hôm nay! Hãy quay lại sau 00:00.');
    }

    // Tính toán tỷ lệ trúng thưởng ở backend
    const rand = Math.random() * 100;
    let rewardMessage = '';

    if (rand < 80) { // 80% trúng Vàng (random 50-250)
      const goldReward = Math.floor(Math.random() * (250 - 50 + 1)) + 50;
      user.gold += goldReward;
      rewardMessage = `💰 ${goldReward} Vàng`;
    } else if (rand < 95) { // 15% trúng Kim Cương (random 1-5)
      const diamondReward = Math.floor(Math.random() * (5 - 1 + 1)) + 1;
      user.diamonds += diamondReward;
      rewardMessage = `💎 ${diamondReward} Kim Cương`;
    } else { // 5% trúng thẻ x2 tốc độ đào trong 30 phút
      const boostDuration = 30 * 60 * 1000;
      const currentBoost = user.boostUntil && user.boostUntil > new Date() ? user.boostUntil.getTime() : Date.now();
      user.boostUntil = new Date(currentBoost + boostDuration);
      rewardMessage = `⚡ Thẻ x2 tốc độ đào trong 30 phút`;
    }

    user.lastSpinDateStr = todayStr;
    await user.save();

    ctx.reply(`🎰 Vòng quay may mắn chúc mừng bạn đã trúng:\n${rewardMessage}!`);
  } catch (err) {
    console.error('Bot /spin error:', err);
  }
});

module.exports = bot;
