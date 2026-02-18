const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

const generateCode = () => Math.floor(100000 + Math.random() * 900000).toString();

const sendVerificationEmail = async (to, code, type = 'verification') => {
    const subjects = {
        register: 'NovaTrade - Registration Verification Code',
        reset: 'NovaTrade - Password Reset Code',
        transaction: 'NovaTrade - Transaction Verification Code',
        verification: 'NovaTrade - Verification Code',
    };

    const mailOptions = {
        from: `"NovaTrade" <${process.env.SMTP_USER}>`,
        to,
        subject: subjects[type] || subjects.verification,
        html: `
      <div style="max-width:480px;margin:0 auto;font-family:Arial,sans-serif;padding:24px;">
        <div style="text-align:center;margin-bottom:24px;">
          <div style="width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,#1A3A8A,#1A6CFF);display:inline-flex;align-items:center;justify-content:center;color:white;font-weight:800;font-size:18px;">NT</div>
          <h2 style="margin-top:12px;color:#1A1D26;">NovaTrade</h2>
        </div>
        <p style="color:#6B7280;font-size:14px;">Your verification code is:</p>
        <div style="text-align:center;margin:24px 0;">
          <span style="font-size:32px;font-weight:700;color:#1A6CFF;letter-spacing:8px;">${code}</span>
        </div>
        <p style="color:#9CA3AF;font-size:12px;">This code is valid for 10 minutes. Do not share it with anyone.</p>
        <hr style="border:none;border-top:1px solid #E8ECF2;margin:24px 0;" />
        <p style="color:#9CA3AF;font-size:11px;text-align:center;">© 2026 NovaTrade. All rights reserved.</p>
      </div>
    `,
    };

    try {
        await transporter.sendMail(mailOptions);
        return true;
    } catch (err) {
        console.error('[EMAIL ERROR]', err.message);
        return false;
    }
};

module.exports = { generateCode, sendVerificationEmail };
