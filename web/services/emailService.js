const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransporter({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: process.env.SMTP_SECURE === 'true' || false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
    }
});

/**
 * Send verification email to user
 * @param {string} email - User email address
 * @param {string} token - Verification token
 * @param {string} username - User's username
 * @returns {Promise} Transporter send promise
 */
async function sendVerificationEmail(email, token, username) {
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const verificationLink = `${baseUrl}/auth/verify/${token}`;

    const mailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: email,
        subject: 'Verify Your Email - AD Challenge',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    body { font-family: Arial, sans-serif; background: #f4f4f4; }
                    .container { max-width: 600px; margin: 20px auto; background: white; padding: 20px; border-radius: 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
                    .header { color: #333; text-align: center; border-bottom: 2px solid #007bff; padding-bottom: 10px; }
                    .content { color: #555; line-height: 1.6; margin: 20px 0; }
                    .button { display: inline-block; background: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; text-align: center; }
                    .button:hover { background: #0056b3; }
                    .expiry { color: #ff6b6b; font-weight: bold; }
                    .footer { color: #999; font-size: 12px; text-align: center; margin-top: 20px; border-top: 1px solid #eee; padding-top: 10px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h2>Welcome to AD Challenge! 🎯</h2>
                    </div>
                    <div class="content">
                        <p>Hi <strong>${username}</strong>,</p>
                        <p>Thank you for registering! To complete your registration and unlock your account, please verify your email by clicking the button below:</p>
                        <div style="text-align: center;">
                            <a href="${verificationLink}" class="button">Verify Email</a>
                        </div>
                        <p>Or copy and paste this link in your browser:</p>
                        <p><code>${verificationLink}</code></p>
                        <p><span class="expiry">⚠️ This link expires in 10 minutes. Act fast!</span></p>
                        <p>After verifying your email, you'll be able to create and join teams.</p>
                        <p>If you didn't create this account, you can safely ignore this email.</p>
                    </div>
                    <div class="footer">
                        <p>&copy; 2024 AD Challenge. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
        `
    };

    return transporter.sendMail(mailOptions);
}

/**
 * Send password reset email
 * @param {string} email - User email address
 * @param {string} token - Reset token
 * @returns {Promise} Transporter send promise
 */
async function sendPasswordResetEmail(email, token, username) {
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const resetLink = `${baseUrl}/auth/reset/${token}`;

    const mailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: email,
        subject: 'Reset Your Password - AD Challenge',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    body { font-family: Arial, sans-serif; background: #f4f4f4; }
                    .container { max-width: 600px; margin: 20px auto; background: white; padding: 20px; border-radius: 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
                    .header { color: #333; text-align: center; border-bottom: 2px solid #007bff; padding-bottom: 10px; }
                    .content { color: #555; line-height: 1.6; margin: 20px 0; }
                    .button { display: inline-block; background: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; text-align: center; }
                    .button:hover { background: #0056b3; }
                    .expiry { color: #ff6b6b; font-weight: bold; }
                    .footer { color: #999; font-size: 12px; text-align: center; margin-top: 20px; border-top: 1px solid #eee; padding-top: 10px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h2>Password Reset Request</h2>
                    </div>
                    <div class="content">
                        <p>Hi <strong>${username}</strong>,</p>
                        <p>We received a request to reset your password. Click the button below to reset it:</p>
                        <div style="text-align: center;">
                            <a href="${resetLink}" class="button">Reset Password</a>
                        </div>
                        <p>Or copy and paste this link:</p>
                        <p><code>${resetLink}</code></p>
                        <p><span class="expiry">⚠️ This link expires in 10 minutes.</span></p>
                        <p>If you didn't request this, you can ignore this email.</p>
                    </div>
                    <div class="footer">
                        <p>&copy; 2024 AD Challenge. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
        `
    };

    return transporter.sendMail(mailOptions);
}

module.exports = {
    sendVerificationEmail,
    sendPasswordResetEmail
};
