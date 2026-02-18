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
      <div style="max-width:480px;margin:0 auto;font-family:Arial,sans-serif;background:#F4F6FA;padding:0;">
        <div style="background:linear-gradient(135deg,#1A3A8A,#1A6CFF);padding:32px 24px;text-align:center;border-radius:0 0 0 0;">
          <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
            <tr>
              <td style="vertical-align:middle;padding-right:10px;">
                <div style="width:44px;height:44px;background:rgba(255,255,255,0.2);border-radius:10px;display:inline-block;line-height:44px;text-align:center;">
                  <span style="font-size:22px;">💎</span>
                </div>
              </td>
              <td style="vertical-align:middle;">
                <span style="font-size:24px;font-weight:800;color:white;letter-spacing:1px;">Nova<span style="color:#00C087;">Trade</span></span>
              </td>
            </tr>
          </table>
          <p style="color:rgba(255,255,255,0.8);font-size:13px;margin:8px 0 0;">Professional Crypto Trading Platform</p>
        </div>
        <div style="background:white;padding:32px 24px;margin:0;">
          <p style="color:#6B7280;font-size:14px;margin-bottom:8px;">Your verification code is:</p>
          <div style="text-align:center;margin:24px 0;background:#F4F6FA;border-radius:12px;padding:24px;">
            <span style="font-size:36px;font-weight:800;color:#1A6CFF;letter-spacing:10px;">${code}</span>
          </div>
          <p style="color:#9CA3AF;font-size:13px;text-align:center;">This code is valid for <strong>10 minutes</strong>. Do not share it with anyone.</p>
          <hr style="border:none;border-top:1px solid #E8ECF2;margin:24px 0;" />
          <p style="color:#9CA3AF;font-size:11px;text-align:center;">© 2026 NovaTrade. All rights reserved.</p>
        </div>
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
