const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const pool = require('../config/database');
const { projectRoot } = require('../core/paths');
const { isAllowedImage } = require('../core/image-upload');
const {
    avatarCloudinaryStorage,
    destroyCloudinaryUrls,
    destroyUploadedFiles
} = require('../services/cloud-storage');
const { loginRateLimit, passwordResetRateLimit } = require('../middleware/rate-limit');
const queue = require('../services/job-queue');
const { validateBody, stringField, emailField, enumField } = require('../middleware/validate');

const registerValidation = validateBody({
    full_name: stringField({ required: true, min: 1, max: 100, disallowHtml: true, label: 'Họ tên' }),
    email: emailField({ required: true }),
    phone: stringField({ max: 30, disallowHtml: true, label: 'Số điện thoại' }),
    password: stringField({ required: true, min: 6, max: 128, trim: false, label: 'Mật khẩu' })
});
const loginValidation = validateBody({
    email: emailField({ required: true }),
    password: stringField({ required: true, min: 1, max: 128, trim: false, label: 'Mật khẩu' })
});
const emailValidation = validateBody({ email: emailField({ required: true }) });
const resetPasswordValidation = validateBody({
    email: emailField({ required: true }),
    otp: stringField({ required: true, min: 6, max: 6, pattern: /^\d{6}$/, label: 'Mã xác nhận' }),
    password: stringField({ required: true, min: 6, max: 128, trim: false, label: 'Mật khẩu' })
});
const otpValidation = validateBody({
    email: emailField({ required: true }),
    otp: stringField({ required: true, min: 6, max: 6, pattern: /^\d{6}$/, label: 'Mã xác nhận' })
});
const profileValidation = validateBody({
    full_name: stringField({ required: true, min: 1, max: 100, disallowHtml: true, label: 'Họ tên' }),
    phone: stringField({ max: 30, disallowHtml: true, label: 'Số điện thoại' }),
    address: stringField({ max: 500, disallowHtml: true, label: 'Địa chỉ' }),
    birthdate: stringField({ max: 10, pattern: /^\d{4}-\d{2}-\d{2}$/, label: 'Ngày sinh' }),
    gender: enumField(['male', 'female', 'other'], { label: 'Giới tính' })
});
const changePasswordValidation = validateBody({
    old_password: stringField({ required: true, min: 1, max: 128, trim: false, label: 'Mật khẩu cũ' }),
    new_password: stringField({ required: true, min: 6, max: 128, trim: false, label: 'Mật khẩu mới' })
});

// Store OTPs temporarily (in production, use Redis or database)
const otpStore = new Map(); // { email: { otp, expires, attempts } }
const passwordResetRequested = {
    success: true,
    message: 'Nếu email tồn tại, bạn sẽ nhận được mã xác nhận!',
    step: 'otp_sent'
};

function normalizeEmail(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isValidEmail(value) {
    return value.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validateProfile({ full_name, phone, address, birthdate, gender }) {
    if (typeof full_name !== 'string' || !full_name.trim() || full_name.trim().length > 100) {
        return 'Họ tên phải có từ 1 đến 100 ký tự!';
    }
    if (/[<>]/.test(full_name) || /[<>]/.test(String(phone || '')) || /[<>]/.test(String(address || ''))) {
        return 'Thông tin cá nhân chứa ký tự không hợp lệ!';
    }
    if (phone != null && String(phone).length > 30) return 'Số điện thoại không hợp lệ!';
    if (address != null && String(address).length > 500) return 'Địa chỉ không được vượt quá 500 ký tự!';
    if (birthdate && !/^\d{4}-\d{2}-\d{2}$/.test(String(birthdate))) return 'Ngày sinh không hợp lệ!';
    if (gender && !['male', 'female', 'other'].includes(String(gender))) return 'Giới tính không hợp lệ!';
    return null;
}

// Register
router.post('/register', loginRateLimit, registerValidation, async (req, res) => {
    try {
        const { full_name, phone, password } = req.body;
        const email = normalizeEmail(req.body.email);

        if (!full_name || !email || !password) {
            return res.status(400).json({ error: 'Vui lòng nhập đầy đủ thông tin!' });
        }
        if (typeof password !== 'string' || password.length < 6 || password.length > 128) {
            return res.status(400).json({ error: 'Mật khẩu phải có từ 6 đến 128 ký tự!' });
        }
        const profileError = validateProfile({ full_name, phone });
        if (profileError) return res.status(400).json({ error: profileError });
        if (!isValidEmail(email)) return res.status(400).json({ error: 'Email không hợp lệ!' });

        // Check existing email
        const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Email này đã được đăng ký!' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert user
        const [result] = await pool.query(
            'INSERT INTO users (full_name, email, phone, password) VALUES (?, ?, ?, ?)',
            [full_name.trim(), email, phone ? String(phone).trim() : '', hashedPassword]
        );

        res.json({ success: true, message: 'Đăng ký thành công!' });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Đã xảy ra lỗi!' });
    }
});

// Login
router.post('/login', loginRateLimit, loginValidation, async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
        const { password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Vui lòng nhập email và mật khẩu!' });
        }
        if (!isValidEmail(email) || typeof password !== 'string' || password.length > 128) {
            return res.status(400).json({ error: 'Email hoặc mật khẩu không hợp lệ!' });
        }

        const [users] = await pool.query(
            'SELECT id, full_name, email, password, role FROM users WHERE email = ?',
            [email]
        );
        const user = users[0];

        if (!user || !await bcrypt.compare(password, user.password)) {
            return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng!' });
        }

        // Đổi session ID sau khi xác thực để ngăn session fixation.
        await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
        req.session.user_id = user.id;
        req.session.full_name = user.full_name;
        req.session.role = user.role;
        req.session.support_chat_started_at = new Date().toISOString();

        res.json({
            success: true,
            user: {
                id: user.id,
                full_name: user.full_name,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Đã xảy ra lỗi!' });
    }
});

// Logout
router.post('/logout', (req, res, next) => {
    req.session.destroy(error => {
        if (error) return next(error);
        res.clearCookie('ats.sid', { path: '/' });
        res.json({ success: true });
    });
});

// Get current user
router.get('/me', async (req, res) => {
    try {
        if (!req.session.user_id) {
            return res.json({ user: null });
        }

        const [users] = await pool.query(
            'SELECT id, full_name, email, phone, address, birthdate, gender, role, avatar FROM users WHERE id = ?',
            [req.session.user_id]
        );

        if (users.length === 0) {
            return res.json({ user: null });
        }

        res.json({ user: users[0] });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Đã xảy ra lỗi!' });
    }
});

router.get('/profile-summary', async (req, res) => {
    if (!req.session.user_id) return res.status(401).json({ error: 'Vui lòng đăng nhập!' });
    try {
        const userId = req.session.user_id;
        const [[orderStats]] = await pool.query(
            `SELECT COUNT(*) AS total_orders,
                    COALESCE(SUM(CASE WHEN status = 'delivered' THEN total_price ELSE 0 END), 0) AS total_spent
             FROM orders WHERE user_id = ?`,
            [userId]
        );
        const [[wishlistStats]] = await pool.query('SELECT COUNT(*) AS total_wishlist FROM wishlists WHERE user_id = ?', [userId]);
        const [[reviewStats]] = await pool.query('SELECT COUNT(*) AS total_reviews FROM reviews WHERE user_id = ?', [userId]);
        const [recentOrders] = await pool.query(
            `SELECT o.id, o.payment_code, o.total_price, o.status, o.created_at,
                    (SELECT p.thumbnail FROM order_items oi JOIN products p ON p.id = oi.product_id
                     WHERE oi.order_id = o.id ORDER BY oi.id LIMIT 1) AS thumbnail
             FROM orders o WHERE o.user_id = ? ORDER BY o.created_at DESC LIMIT 5`,
            [userId]
        );
        res.json({
            stats: {
                total_orders: Number(orderStats.total_orders || 0),
                total_wishlist: Number(wishlistStats.total_wishlist || 0),
                total_spent: Number(orderStats.total_spent || 0),
                total_reviews: Number(reviewStats.total_reviews || 0)
            },
            recent_orders: recentOrders
        });
    } catch (error) {
        console.error('Profile summary error:', error);
        res.status(500).json({ error: 'Không thể tải tổng quan tài khoản!' });
    }
});

// Update profile
router.put('/profile', profileValidation, async (req, res) => {
    try {
        if (!req.session.user_id) {
            return res.status(401).json({ error: 'Vui lòng đăng nhập!' });
        }

        const { full_name, phone, address, birthdate, gender } = req.body;
        const profileError = validateProfile({ full_name, phone, address, birthdate, gender });
        if (profileError) return res.status(400).json({ error: profileError });
        await pool.query(
            'UPDATE users SET full_name = ?, phone = ?, address = ?, birthdate = ?, gender = ? WHERE id = ?',
            [full_name.trim(), phone ? String(phone).trim() : '', address ? String(address).trim() : null, birthdate || null, gender || null, req.session.user_id]
        );

        req.session.full_name = full_name.trim();
        res.json({ success: true, message: 'Cập nhật thành công!' });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Đã xảy ra lỗi!' });
    }
});

// Alias: update-profile (backward compatibility)
router.put('/update-profile', profileValidation, async (req, res) => {
    try {
        if (!req.session.user_id) {
            return res.status(401).json({ error: 'Vui lòng đăng nhập!' });
        }

        const { full_name, phone, address, birthdate, gender } = req.body;
        const profileError = validateProfile({ full_name, phone, address, birthdate, gender });
        if (profileError) return res.status(400).json({ error: profileError });
        await pool.query(
            'UPDATE users SET full_name = ?, phone = ?, address = ?, birthdate = ?, gender = ? WHERE id = ?',
            [full_name.trim(), phone ? String(phone).trim() : '', address ? String(address).trim() : null, birthdate || null, gender || null, req.session.user_id]
        );

        req.session.full_name = full_name.trim();
        res.json({ success: true, message: 'Cập nhật thành công!' });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Đã xảy ra lỗi!' });
    }
});

// ============ FORGOT PASSWORD - OTP via Email ============

// Step 1: Request OTP
router.post('/forgot-password', passwordResetRateLimit, emailValidation, async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);

        if (!email) {
            return res.status(400).json({ error: 'Vui lòng nhập email!' });
        }
        if (!isValidEmail(email)) return res.json(passwordResetRequested);

        // Check if user exists
        const [users] = await pool.query('SELECT id, full_name FROM users WHERE email = ?', [email]);
        
        if (users.length === 0) {
            // Don't reveal if email exists or not for security
            return res.json(passwordResetRequested);
        }

        const user = users[0];

        // Generate 6-digit OTP
        const otp = crypto.randomInt(100000, 1000000).toString();
        const expires = Date.now() + 5 * 60 * 1000; // 5 minutes

        // Store OTP
        otpStore.set(email, {
            otp: otp,
            expires: expires,
            attempts: 0,
            user_id: user.id
        });

        // Delete old tokens for this user
        // Send OTP via email
        queue.enqueue('password_reset_email', { email, otp, expiresIn: 5 });

        res.json(passwordResetRequested);
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ error: 'Đã xảy ra lỗi!' });
    }
});

// Step 2: Verify OTP and resend password
router.post('/reset-password', passwordResetRateLimit, resetPasswordValidation, async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
        const { otp, password } = req.body;

        if (!email || !otp || !password) {
            return res.status(400).json({ error: 'Thông tin không hợp lệ!' });
        }

        if (typeof password !== 'string' || password.length < 6 || password.length > 128) {
            return res.status(400).json({ error: 'Mật khẩu phải có từ 6 đến 128 ký tự!' });
        }

        const emailLower = email;
        const storedOTP = otpStore.get(emailLower);

        // Check if OTP exists
        if (!storedOTP) {
            return res.status(400).json({ error: 'Mã xác nhận đã hết hạn. Vui lòng yêu cầu mã mới!' });
        }

        // Check expiration
        if (Date.now() > storedOTP.expires) {
            otpStore.delete(emailLower);
            return res.status(400).json({ error: 'Mã xác nhận đã hết hạn. Vui lòng yêu cầu mã mới!' });
        }

        // Check attempts
        if (storedOTP.attempts >= 5) {
            otpStore.delete(emailLower);
            return res.status(400).json({ error: 'Bạn đã nhập sai quá nhiều lần. Vui lòng yêu cầu mã mới!' });
        }

        // Verify OTP
        if (storedOTP.otp !== String(otp)) {
            storedOTP.attempts++;
            const attemptsLeft = 5 - storedOTP.attempts;
            return res.status(400).json({ 
                error: `Mã xác nhận không đúng! Còn ${attemptsLeft} lần thử.` 
            });
        }

        // OTP verified - Hash new password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Update password
        await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, storedOTP.user_id]);

        // Delete used OTP
        otpStore.delete(emailLower);

        res.json({ success: true, message: 'Đặt lại mật khẩu thành công!' });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Đã xảy ra lỗi!' });
    }
});

// Verify OTP (check if valid without resetting password)
router.post('/verify-otp', passwordResetRateLimit, otpValidation, async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
        const { otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({ error: 'Vui lòng nhập đầy đủ thông tin!' });
        }

        const emailLower = email;
        const storedOTP = otpStore.get(emailLower);

        if (!storedOTP) {
            return res.status(400).json({ valid: false, error: 'Mã xác nhận đã hết hạn!' });
        }

        if (Date.now() > storedOTP.expires) {
            otpStore.delete(emailLower);
            return res.status(400).json({ valid: false, error: 'Mã xác nhận đã hết hạn!' });
        }

        if (storedOTP.otp !== String(otp)) {
            storedOTP.attempts++;
            if (storedOTP.attempts >= 5) otpStore.delete(emailLower);
            return res.status(400).json({ valid: false, error: 'Mã xác nhận không đúng!' });
        }

        res.json({ valid: true, message: 'Mã xác nhận hợp lệ!' });
    } catch (error) {
        console.error('Verify OTP error:', error);
        res.status(500).json({ error: 'Đã xảy ra lỗi!' });
    }
});

// Đổi mật khẩu khi đã đăng nhập (cần mật khẩu cũ)
router.put('/change-password', changePasswordValidation, async (req, res) => {
    try {
        if (!req.session.user_id) {
            return res.status(401).json({ error: 'Vui lòng đăng nhập!' });
        }

        const { old_password, new_password } = req.body;

        if (!old_password || !new_password) {
            return res.status(400).json({ error: 'Vui lòng nhập đầy đủ thông tin!' });
        }

        if (typeof old_password !== 'string' || typeof new_password !== 'string' || new_password.length < 6 || new_password.length > 128 || old_password.length > 128) {
            return res.status(400).json({ error: 'Mật khẩu mới phải có từ 6 đến 128 ký tự!' });
        }

        if (old_password === new_password) {
            return res.status(400).json({ error: 'Mật khẩu mới phải khác mật khẩu cũ!' });
        }

        // Lấy thông tin user hiện tại
        const [users] = await pool.query(
            'SELECT id, password FROM users WHERE id = ?',
            [req.session.user_id]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'Người dùng không tồn tại!' });
        }

        const user = users[0];

        // Kiểm tra mật khẩu cũ
        const isMatch = await bcrypt.compare(old_password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: 'Mật khẩu cũ không chính xác!' });
        }

        // Hash mật khẩu mới
        const hashedPassword = await bcrypt.hash(new_password, 10);

        // Cập nhật
        await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, req.session.user_id]);

        res.json({ success: true, message: 'Đổi mật khẩu thành công!' });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ error: 'Đã xảy ra lỗi!' });
    }
});

// Upload avatar
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Chỉ giữ đường dẫn này để dọn các avatar local được tạo bởi phiên bản cũ.
const avatarDir = path.join(projectRoot, 'public', 'uploads', 'avatars');

const avatarUpload = multer({
    storage: avatarCloudinaryStorage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
    fileFilter: (req, file, cb) => {
        if (isAllowedImage(file)) cb(null, true);
        else cb(new Error('Chỉ chấp nhận file ảnh (jpg, png, gif, webp)!'));
    }
});

function requireLogin(req, res, next) {
    if (!req.session.user_id) return res.status(401).json({ error: 'Vui lòng đăng nhập!' });
    next();
}

const handleAvatarUpload = (req, res, next) => avatarUpload.single('avatar')(req, res, error => {
    if (!error) return next();
    const message = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE'
        ? 'Ảnh đại diện không được vượt quá 2MB!'
        : error.message || 'Ảnh đại diện không hợp lệ!';
    return res.status(error.status === 503 ? 503 : error.status === 502 ? 502 : 400).json({ error: message });
});

async function removeStoredAvatar(avatarPath) {
    if (!avatarPath) return;
    if (/^https:\/\/res\.cloudinary\.com\//i.test(String(avatarPath))) {
        await destroyCloudinaryUrls([avatarPath]);
        return;
    }
    if (!String(avatarPath).startsWith('/uploads/avatars/')) return;
    const filePath = path.join(avatarDir, path.basename(avatarPath));
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (error) {}
}

router.post('/upload-avatar', requireLogin, handleAvatarUpload, async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Vui lòng chọn file ảnh!' });
        }

        const [users] = await pool.query('SELECT avatar FROM users WHERE id = ?', [req.session.user_id]);
        if (users.length === 0) {
            await destroyUploadedFiles([req.file]);
            return res.status(404).json({ error: 'Tài khoản không tồn tại!' });
        }
        const avatarUrl = req.file.path;
        await pool.query('UPDATE users SET avatar = ? WHERE id = ?', [avatarUrl, req.session.user_id]);
        await removeStoredAvatar(users[0].avatar);

        res.json({
            success: true,
            message: 'Cập nhật avatar thành công!',
            avatar_url: avatarUrl
        });
    } catch (error) {
        if (req.file) await destroyUploadedFiles([req.file]);
        console.error('Upload avatar error:', error);
        res.status(500).json({ error: 'Đã xảy ra lỗi!' });
    }
});

// Xóa avatar (reset về mặc định)
router.delete('/avatar', async (req, res) => {
    try {
        if (!req.session.user_id) {
            return res.status(401).json({ error: 'Vui lòng đăng nhập!' });
        }

        const [users] = await pool.query('SELECT avatar FROM users WHERE id = ?', [req.session.user_id]);
        await pool.query('UPDATE users SET avatar = NULL WHERE id = ?', [req.session.user_id]);
        if (users.length > 0) await removeStoredAvatar(users[0].avatar);

        res.json({ success: true, message: 'Đã xóa avatar!' });
    } catch (error) {
        console.error('Delete avatar error:', error);
        res.status(500).json({ error: 'Đã xảy ra lỗi!' });
    }
});

module.exports = router;
