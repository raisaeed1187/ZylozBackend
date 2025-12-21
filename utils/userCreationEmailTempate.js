
const getUserCreationTemplate = async (
  UserName = "",
  Email = "",
  Password = "" 
)=>`<!DOCTYPE html>

<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Allbiz</title>
</head>

<body style="margin:0; padding:0; background-color:#f3f4f6; font-family:Arial, Helvetica, sans-serif;">

  <!-- Background -->

  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6; padding:40px 0;">
    <tr>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #e5e7eb; padding-top:20px; padding-bottom:10px; text-align:center;">
            <tr>
            <td>
                <img src="https://allbiz.ae/assets/newImages/allbiz_new.png" alt="Allbiz Logo" style="height:28px; margin-bottom:5px;">
                <p style="margin:0; font-size:12px; color:#6b7280;">Allbiz - Inspiring Digital change.</p>
            </td>
            </tr>
        </table>
    </tr>  
  <tr>
      <td align="center">



 
    <!-- Main Container -->
    <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:24px; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,0.08);">

        
      <!-- Header -->
      <tr>
        <td align="center" style="padding:40px 20px; background-color:#f4f1fd;">
          <h1 style="margin:0; font-size:32px; font-weight:bold; color:#111827;">
            Welcome to <span style="color:#633DE2;">Allbiz</span>!
          </h1>
          <p style="margin:10px 0 0; font-size:16px; color:#4b5563;">
            Your account is ready to go
          </p>
        </td>
      </tr>

      <!-- Body -->
      <tr>
        <td style="padding:32px 40px;">

          <p style="margin:0 0 12px; font-size:16px; color:#111827;">
            Hello ${UserName},
          </p>

          <p style="margin:0 0 24px; font-size:15px; color:#4b5563; line-height:1.6;">
            We're thrilled to have you on board. Your
            <strong style="color:#633DE2;">Allbiz</strong> account has been successfully created.
            You can now access the platform using the credentials below.
          </p>

          <!-- Credentials -->
          <table width="100%" cellpadding="0" cellspacing="0"
                 style="background-color:#f4f1fd; border:1px solid #e9e3fa; border-radius:16px; padding:20px; margin-bottom:28px;">
            <tr>
              <td style="font-size:13px; color:#6b7280; padding-bottom:6px;">
                Username
              </td>
            </tr>
            <tr>
              <td style="font-size:15px; color:#111827; font-weight:bold; padding-bottom:16px;">
                ${Email}
              </td>
            </tr>
            <tr>
              <td style="font-size:13px; color:#6b7280; padding-bottom:6px;">
                Temporary Password
              </td>
            </tr>
            <tr>
              <td style="font-size:15px; color:#111827; font-family:monospace; font-weight:bold;">
                ${Password}
              </td>
            </tr>
          </table>

          <!-- CTA -->
          <table align="center" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
            <tr>
              <td bgcolor="#633DE2" style="border-radius:12px;">
                <a href="https://allbiz.ae/auth/signin" target="_blank"
                   style="display:inline-block; padding:16px 36px; font-size:16px; font-weight:bold;
                          color:#ffffff; text-decoration:none; cursor: pointer;">
                  Login to Your Account →
                </a>
              </td>
            </tr>
          </table>

          <!-- Security Notice -->
          <table width="100%" cellpadding="0" cellspacing="0"
                 style="background-color:#fffbeb; border-left:4px solid #FFC727;
                        border-radius:8px; padding:16px; margin-bottom:28px;">
            <tr>
              <td style="font-size:14px; font-weight:bold; color:#92400e; padding-bottom:6px;">
                Important Security Step
              </td>
            </tr>
            <tr>
              <td style="font-size:13px; color:#92400e; line-height:1.5;">
                Please change this temporary password immediately after your first login.
              </td>
            </tr>
          </table>

          <!-- Support -->
          <table width="100%" cellpadding="0" cellspacing="0"
                 style="background-color:#f9fafb; border-radius:16px; padding:20px; text-align:center;">
            <tr>
              <td style="font-size:14px; font-weight:bold; color:#111827; padding-bottom:6px;">
                Questions or need assistance?
              </td>
            </tr>
            <tr>
              <td style="font-size:13px; color:#4b5563; padding-bottom:10px;">
                If you didn’t request this account, please contact our support team.
              </td>
            </tr>
            <tr>
              <td>
                <a href="https://wa.me/971545420778"
                   style="font-size:13px; font-weight:bold; color:#16a34a; text-decoration:none;">
                  Contact Support on WhatsApp
                </a>
              </td>
            </tr>
          </table>

        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td align="center" style="padding:24px; background-color:#f3f4f6;">
          <p style="margin:0; font-size:12px; color:#6b7280;">
            © 2024 Allbiz. All rights reserved.
          </p>
          <p style="margin:6px 0 0; font-size:11px; color:#9ca3af;">
            123 Business Avenue, Suite 100, Innovation City
          </p>
        </td>
      </tr>

    </table>
  </td>
</tr>
 

  </table>

</body>
</html>`;
 

module.exports = { getUserCreationTemplate }; 
