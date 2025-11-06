 
const getOtpTemplate = (otp, userName = "User") => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AllBiz OTP Verification</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f7fb; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="padding:40px 0;">
    <tr>
      <td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="max-width:600px; background:#ffffff; border-radius:10px; box-shadow:0 4px 10px rgba(0,0,0,0.05); overflow:hidden;">
          <tr>
            <td align="center" style="background-color:#f0f2f6; padding:25px;">
                <img src="https://allbiz.ae/assets/newImages/allbiz_new.png" 
                    alt="AllBiz Logo" 
                    width="120" 
                    style="display:block; margin:0 auto;" />
            </td>
          </tr>
          <tr>
            <td style="padding:40px 30px; text-align:center;">
              <h2 style="color:#003366; font-size:22px; margin:0;">Your One-Time Password (OTP)</h2>
              <p style="color:#555; font-size:16px; margin-top:15px;">
                Hello <strong>${userName}</strong>,<br />
                Use the OTP below to verify your identity with <strong>AllBiz</strong>.
              </p>
              <div style="display:inline-block; background:#007bff; color:#fff; padding:15px 35px; border-radius:6px; font-size:28px; letter-spacing:6px; margin:20px 0; font-weight:bold;">
                ${otp}
              </div>
              <p style="color:#666; font-size:14px; margin-top:15px;">
                This OTP is valid for <strong>10 minutes</strong>.<br/>
                Do not share it with anyone.
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="background:#f0f2f6; padding:15px; font-size:13px; color:#777;">
              &copy; ${new Date().getFullYear()} AllBiz. All rights reserved.<br/>
              <a href="https://allbiz.ae" style="color:#007bff; text-decoration:none;">Visit our website</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;


module.exports = { getOtpTemplate };
