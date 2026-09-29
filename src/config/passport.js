/**
 * Google OAuth Configuration
 * 
 * Hướng dẫn setup:
 * 1. Truy cập: https://console.cloud.google.com/
 * 2. Tạo project mới hoặc chọn project hiện có
 * 3. APIs & Services → Credentials → Create Credentials → OAuth client ID
 * 4. Application type: Web application
 * 5. Thêm Authorized redirect URI: http://localhost:3000/auth/google/callback
 * 6. Copy Client ID và Client Secret vào .env
 */

const GoogleStrategy = require('passport-google-oauth20').Strategy;
const pool = require('./database');
const bcrypt = require('bcryptjs');

function safeProfileName(profile) {
    const name = profile.displayName || profile.name?.givenName || 'Người dùng Google';
    return String(name).replace(/[<>]/g, '').trim().slice(0, 100) || 'Người dùng Google';
}

function configureGoogleOAuth(passport) {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        console.log('⚠️ Google OAuth chưa được cấu hình. Đăng nhập Google tạm thời bị vô hiệu hóa.');
        return false;
    }
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback',
        scope: ['profile', 'email']
    },
    async (accessToken, refreshToken, profile, done) => {
        try {
            const profileEmail = String(profile.emails?.[0]?.value || '').trim().toLowerCase();
            if (!profileEmail) return done(new Error('Google account has no email'), null);
            const profileName = safeProfileName(profile);
            // Kiểm tra user đã tồn tại chưa
            const [existingUsers] = await pool.query(
                'SELECT id, email, full_name, role, google_id FROM users WHERE google_id = ? OR email = ?',
                [profile.id, profileEmail]
            );

            if (existingUsers.length > 0) {
                // User đã tồn tại - cập nhật google_id nếu chưa có
                const user = existingUsers[0];
                if (!user.google_id) {
                    await pool.query('UPDATE users SET google_id = ? WHERE id = ?', [profile.id, user.id]);
                }
                return done(null, {
                    id: user.id,
                    email: user.email,
                    full_name: user.full_name,
                    role: user.role
                });
            }

            // Tạo user mới
            const randomPassword = bcrypt.hashSync(Math.random().toString(36), 10);
            const [result] = await pool.query(
                `INSERT INTO users (full_name, email, google_id, password, role, created_at) 
                 VALUES (?, ?, ?, ?, 'customer', NOW())`,
                [
                    profileName,
                    profileEmail,
                    profile.id,
                    randomPassword
                ]
            );

            const newUser = {
                id: result.insertId,
                email: profileEmail,
                full_name: profileName,
                role: 'customer'
            };

            // Gửi email chào mừng (async, không block)
            const queue = require('../services/job-queue');
            queue.enqueue('welcome_email', { user: newUser });

            return done(null, newUser);
        } catch (error) {
            console.error('Google OAuth error:', error);
            return done(error, null);
        }
    }));

    // Serialize user vào session - CHỈ lưu id để session nhỏ gọn
    passport.serializeUser((user, done) => {
        done(null, user.id);
    });

    // Deserialize user từ session - user bây giờ CHỈ là id
    passport.deserializeUser(async (id, done) => {
        try {
            const [users] = await pool.query(
                'SELECT id, email, full_name, role FROM users WHERE id = ?',
                [id]
            );
            if (users.length > 0) {
                done(null, users[0]);
            } else {
                done(new Error('User not found'), null);
            }
        } catch (error) {
            done(error, null);
        }
    });
    return true;
}

module.exports = configureGoogleOAuth;
