const nodemailer = require('nodemailer');

// Tạo transporter
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[char]);
}

// Kiểm tra kết nối SMTP (chạy 1 lần khi start server)
async function testConnection() {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.log('⚠️ Email SMTP chưa được cấu hình. Các chức năng gửi email sẽ bị vô hiệu hóa.');
        console.log('   Vui lòng cập nhật SMTP_USER và SMTP_PASS trong file .env');
        return false;
    }
    
    try {
        await transporter.verify();
        console.log('✓ Kết nối SMTP email thành công!');
        return true;
    } catch (error) {
        console.log('⚠️ Kết nối SMTP email thất bại:', error.message);
        console.log('   Kiểm tra lại SMTP_USER và SMTP_PASS trong file .env');
        return false;
    }
}

/**
 * Gửi email
 * @param {Object} options - { to, subject, html, text }
 */
async function sendEmail(options) {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.log('⚠️ Email không thể gửi - SMTP chưa được cấu hình');
        console.log('   Nội dung email:', options.subject);
        return false;
    }
    
    try {
        const info = await transporter.sendMail({
            from: `"${process.env.SITE_NAME || 'Website'}" <${process.env.SMTP_USER}>`,
            to: options.to,
            subject: options.subject,
            text: options.text || options.html.replace(/<[^>]*>/g, ''), // Plain text fallback
            html: options.html
        });
        console.log(`✓ Email đã gửi: ${options.subject}`);
        return true;
    } catch (error) {
        console.error('✗ Gửi email thất bại:', error.message);
        return false;
    }
}

/**
 * Gửi email đơn hàng
 */
async function sendOrderEmail(order, user, items) {
    const siteName = process.env.SITE_NAME || 'Cửa Hàng';
    const siteUrl = process.env.SITE_URL || 'http://localhost:3000';
    const safeSiteName = escapeHtml(siteName);
    const safeSiteUrl = escapeHtml(siteUrl);
    
    const statusText = {
        'pending': 'Chờ xác nhận',
        'confirmed': 'Đã xác nhận',
        'shipping': 'Đang giao hàng',
        'delivered': 'Đã giao hàng',
        'cancelled': 'Đã hủy'
    };
    
    const itemsHtml = items.map(item => `
        <tr>
            <td style="padding: 10px; border-bottom: 1px solid #eee;">${escapeHtml(item.name)}${[item.ram, item.storage, item.color].filter(Boolean).length ? `<br><small>${escapeHtml([item.ram, item.storage, item.color].filter(Boolean).join(' / '))}</small>` : ''}</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(item.price)}</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(item.price * item.quantity)}</td>
        </tr>
    `).join('');
    
    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #007bff; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">${safeSiteName}</h1>
            <p style="margin: 5px 0 0;">Xác nhận đơn hàng #${escapeHtml(order.payment_code)}</p>
        </div>
        
        <div style="padding: 20px;">
            <p>Xin chào <strong>${escapeHtml(user.full_name || user.email)}</strong>,</p>
            <p>Cảm ơn bạn đã đặt hàng! Đơn hàng của bạn đã được tiếp nhận.</p>
            
            <h3 style="border-bottom: 2px solid #007bff; padding-bottom: 10px;">Thông tin đơn hàng</h3>
            <table style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td style="padding: 5px 0;"><strong>Mã đơn hàng:</strong></td>
                    <td style="padding: 5px 0;">#${escapeHtml(order.payment_code)}</td>
                </tr>
                <tr>
                    <td style="padding: 5px 0;"><strong>Ngày đặt:</strong></td>
                    <td style="padding: 5px 0;">${new Date(order.created_at).toLocaleString('vi-VN')}</td>
                </tr>
                <tr>
                    <td style="padding: 5px 0;"><strong>Trạng thái:</strong></td>
                    <td style="padding: 5px 0;"><span style="background: #ffc107; padding: 3px 10px; border-radius: 3px;">${escapeHtml(statusText[order.status] || order.status)}</span></td>
                </tr>
            </table>
            
            <h3 style="border-bottom: 2px solid #007bff; padding-bottom: 10px;">Sản phẩm</h3>
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background: #f8f9fa;">
                        <th style="padding: 10px; text-align: left;">Sản phẩm</th>
                        <th style="padding: 10px; text-align: center;">SL</th>
                        <th style="padding: 10px; text-align: right;">Đơn giá</th>
                        <th style="padding: 10px; text-align: right;">Thành tiền</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                </tbody>
            </table>
            
            <table style="width: 100%; margin-top: 20px;">
                <tr>
                    <td style="padding: 5px 0;">Tạm tính:</td>
                    <td style="padding: 5px 0; text-align: right;">${formatCurrency(order.total_price - order.shipping_fee + order.discount_amount)}</td>
                </tr>
                ${order.discount_amount > 0 ? `
                <tr style="color: #28a745;">
                    <td style="padding: 5px 0;">Giảm giá:</td>
                    <td style="padding: 5px 0; text-align: right;">-${formatCurrency(order.discount_amount)}</td>
                </tr>
                ` : ''}
                <tr>
                    <td style="padding: 5px 0;">Phí vận chuyển:</td>
                    <td style="padding: 5px 0; text-align: right;">${order.shipping_fee === 0 ? 'Miễn phí' : formatCurrency(order.shipping_fee)}</td>
                </tr>
                <tr style="font-size: 1.2em; font-weight: bold;">
                    <td style="padding: 10px 0;">Tổng cộng:</td>
                    <td style="padding: 10px 0; text-align: right; color: #007bff;">${formatCurrency(order.total_price)}</td>
                </tr>
            </table>
            
            <h3 style="border-bottom: 2px solid #007bff; padding-bottom: 10px;">Địa chỉ giao hàng</h3>
            <p style="margin: 0;">
                <strong>${escapeHtml(order.shipping_name)}</strong><br>
                📞 ${escapeHtml(order.shipping_phone)}<br>
                📍 ${escapeHtml(order.shipping_address)}
            </p>
            
            <p style="margin-top: 30px; text-align: center;">
                <a href="${safeSiteUrl}/order/${encodeURIComponent(order.id)}" style="background: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                    Xem chi tiết đơn hàng
                </a>
            </p>
        </div>
        
        <div style="background: #f8f9fa; padding: 15px; text-align: center; font-size: 12px; color: #666;">
            <p style="margin: 0;">Email này được gửi tự động từ ${safeSiteName}.</p>
            <p style="margin: 5px 0 0;">© ${new Date().getFullYear()} ${safeSiteName}. All rights reserved.</p>
        </div>
    </div>
    `;
    
    return sendEmail({
        to: user.email,
        subject: `[${siteName}] Xác nhận đơn hàng #${order.payment_code}`,
        html: html
    });
}

/**
 * Gửi mã OTP đặt lại mật khẩu
 */
async function sendPasswordResetOTP(email, otp, expiresIn) {
    const siteName = process.env.SITE_NAME || 'Cửa Hàng';
    const safeSiteName = escapeHtml(siteName);
    
    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
        <div style="background: #dc3545; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">${safeSiteName}</h1>
            <p style="margin: 5px 0 0;">Yêu cầu đặt lại mật khẩu</p>
        </div>
        
        <div style="padding: 30px; text-align: center;">
            <p>Xin chào,</p>
            <p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.</p>
            
            <div style="background: #f8f9fa; padding: 20px; margin: 20px 0; border-radius: 10px;">
                <p style="margin: 0; color: #666;">Mã xác nhận của bạn:</p>
                <h2 style="margin: 10px 0; font-size: 2.5em; letter-spacing: 10px; color: #333;">${escapeHtml(otp)}</h2>
            </div>
            
            <p style="color: #dc3545;"><strong>Mã này sẽ hết hạn sau ${expiresIn} phút!</strong></p>
            <p>Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.</p>
        </div>
        
        <div style="background: #f8f9fa; padding: 15px; text-align: center; font-size: 12px; color: #666;">
            <p style="margin: 0;">© ${new Date().getFullYear()} ${safeSiteName}</p>
        </div>
    </div>
    `;
    
    return sendEmail({
        to: email,
        subject: `[${siteName}] Mã xác nhận đặt lại mật khẩu`,
        html: html
    });
}

/**
 * Gửi email chào mừng khi đăng ký Google
 */
async function sendWelcomeEmail(user) {
    const siteName = process.env.SITE_NAME || 'Cửa Hàng';
    const siteUrl = process.env.SITE_URL || 'http://localhost:3000';
    const safeSiteName = escapeHtml(siteName);
    const safeSiteUrl = escapeHtml(siteUrl);
    
    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
        <div style="background: #28a745; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">Chào mừng đến với ${safeSiteName}!</h1>
        </div>
        
        <div style="padding: 30px; text-align: center;">
            <p>Xin chào <strong>${escapeHtml(user.full_name || user.email)}</strong>,</p>
            <p>Tài khoản của bạn đã được tạo thành công bằng Google!</p>
            
            <p style="margin-top: 30px;">
                <a href="${safeSiteUrl}" style="background: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                    Bắt đầu mua sắm
                </a>
            </p>
        </div>
        
        <div style="background: #f8f9fa; padding: 15px; text-align: center; font-size: 12px; color: #666;">
            <p style="margin: 0;">© ${new Date().getFullYear()} ${safeSiteName}</p>
        </div>
    </div>
    `;
    
    return sendEmail({
        to: user.email,
        subject: `Chào mừng đến với ${siteName}!`,
        html: html
    });
}

// Helper function
function formatCurrency(amount) {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

module.exports = {
    transporter,
    sendEmail,
    testConnection,
    sendOrderEmail,
    sendPasswordResetOTP,
    sendWelcomeEmail
};
