const getRfqTemplate = (
  vendorName = "Vendor",
  companyName = "AllBiz",
  rfqNumber = "RFQ-0001",
  rfqDate = "2025-01-01",
  dueDate = "2025-01-05",
  deliveryDate = "2025-01-05",
  deliveryLocation = "",

  message = ""
) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${companyName} – Request for Quotation (RFQ)</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f7fb; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="padding:40px 0;">
    <tr>
      <td align="center">

        <table role="presentation" cellspacing="0" cellpadding="0" border="0" 
          style="max-width:650px; background:#ffffff; border-radius:10px; 
          box-shadow:0 4px 10px rgba(0,0,0,0.05); overflow:hidden;">

          <!-- HEADER -->
          <tr>
            <td align="center" style="background-color:#f0f2f6; padding:25px;">
                <img src="https://allbiz.ae/assets/newImages/allbiz_new.png" 
                    alt="${companyName} Logo" 
                    width="130" 
                    style="display:block; margin:0 auto;" />
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="padding:40px 35px;">

              <h2 style="color:#003366; font-size:22px; margin:0; text-align:center;">
                Request for Quotation (RFQ)
              </h2>

              <p style="color:#555; font-size:16px; margin:25px 0 10px;">
                Dear <strong>${vendorName}</strong>,
              </p>

              <p style="color:#555; font-size:15px; line-height:1.6;">
                You have been invited to provide a quotation for the attached Request for Quotation (RFQ) from 
                <strong>${companyName}</strong>. Please review the details and submit your best price before the deadline.
              </p>

              ${message
                ? `
                  <div style="background:#f8f9fc; padding:15px 20px; border-left:4px solid #007bff; 
                     margin:20px 0; border-radius:6px; color:#444; font-size:14px; line-height:1.5;">
                    ${message}
                  </div>
                `
                : ""
              }

              <!-- RFQ INFO BOX -->
              <table width="100%" style="margin-top:25px; border-collapse:collapse;">
                <tr>
                  <td style="padding:10px; border:1px solid #e3e6eb; background:#fafbfe;">
                    <strong>RFQ Number:</strong>
                  </td>
                  <td style="padding:10px; border:1px solid #e3e6eb;">${rfqNumber}</td>
                </tr>
                <tr>
                  <td style="padding:10px; border:1px solid #e3e6eb; background:#fafbfe;">
                    <strong>RFQ Date:</strong>
                  </td>
                  <td style="padding:10px; border:1px solid #e3e6eb;">${rfqDate}</td>
                </tr>
                <tr>
                  <td style="padding:10px; border:1px solid #e3e6eb; background:#fafbfe;">
                    <strong>Submission Deadline:</strong>
                  </td>
                  <td style="padding:10px; border:1px solid #e3e6eb;">
                    <span style="color:#d9534f; font-weight:bold;">${dueDate}</span>
                  </td>
                </tr>
              </table>

              <p style="color:#555; font-size:15px; margin-top:25px; line-height:1.6;">
                Please find the RFQ details and attachments included.  
                If you have any questions, feel free to reply to this email.
              </p>

              <!-- CTA BUTTON -->
              <div style="text-align:center; margin:30px 0;">
                <a href="#" 
                  style="background:#007bff; color:white; padding:14px 28px; 
                  border-radius:6px; text-decoration:none; font-size:16px;">
                  View RFQ Details
                </a>
              </div>

              <p style="color:#555; font-size:14px; margin-top:15px; text-align:center;">
                Thank you for your prompt response.
              </p>

            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td align="center" style="background:#f0f2f6; padding:15px; font-size:13px; color:#777;">
              &copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.<br/>
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

const getRfqTemplateNew = async (
  vendorName = "Vendor",
  vendorEmail = "", 
  vendorID = "",  
  rfqID = "",   
  companyName = "AllBiz",
  rfqNumber = "RFQ-0001",
  rfqDate = "2025-01-01",
  dueDate = "2025-01-05",
  deliveryDate = "2025-01-05",
  deliveryLocation = "",
  message = "",
  baseUrl=""
)=>`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Quotation Request</title>
  <style>
    body { margin: 0; padding: 0; background: #f3f4f6; font-family: Arial, sans-serif; }
    table { border-collapse: collapse; }
    .container { max-width: 600px; margin: 20px auto; background: #ffffff; }
    .btn {
      background: #6f2cf5; color: #ffffff; padding: 14px 24px;
      text-decoration: none; display: inline-block; border-radius: 10px;
      font-weight: bold;
    }
  </style>
</head>

<body>

<!-- MAIN WRAPPER -->
<table width="100%" bgcolor="#f3f4f6">
<tr><td align="center">

<table class="container" width="100%" cellpadding="0" cellspacing="0">

  <!-- TOP HEADER -->
  <tr>
    <td style="padding: 20px; border-bottom: 1px solid #e5e7eb;">
      <table width="100%">
        <tr>
          <td>
            <img src="https://storage.googleapis.com/uxpilot-images-and-a-z/1718890432296_allbiz-logo.png"
                 width="120" style="display:block;">
          </td>
          <td align="right">
            <a href="https://wa.me/971545420778"
               style="background:#22c55e;color:#ffffff;padding:10px 14px;border-radius:6px;
                      text-decoration:none;font-size:14px;">
              WhatsApp Support
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- PURPLE HEADER -->
  <tr>
    <td bgcolor="#6f2cf5" style="padding: 22px; color: #ffffff;">
      <table width="100%">
        <tr>
          <td>
            <h2 style="margin:0; font-size:22px; font-weight:bold;">Allbiz</h2>
            <p style="margin:0; opacity:0.8; font-size:13px;">Inspiring Digital change.</p>
          </td>
          <td align="right">
            <div style="font-size:12px; opacity:0.8;">RFQ #</div>
            <div style="font-size:16px; font-weight:bold;">#${rfqNumber}</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- BODY -->
  <tr>
    <td style="padding: 30px;">

      <!-- Title -->
      <h2 style="font-size:26px; margin:0 0 10px;">New Quotation Request</h2>
      <p style="margin:0 0 20px; color:#555;">Dear ${vendorName},</p>

      <!-- Notification Box -->
      <table width="100%" style="background:#f5f0ff;border:1px solid #e5dbff;padding:15px;border-radius:10px;">
        <tr>
          <td width="50" valign="top">
            <div style="background:#ede4ff;width:40px;height:40px;border-radius:10px;text-align:center;line-height:40px;">
              📄
            </div>
          </td>
          <td>
            <h3 style="margin:0;font-size:16px;">You have a new RFQ from ${companyName}</h3>
            <p style="margin:6px 0 0;font-size:13px;color:#555;">
              A verified buyer is requesting quotes. This is an excellent opportunity to secure a new
              contract and grow your business on Allbiz.
            </p>
          </td>
        </tr>
      </table>

      <br>

      <!-- RFQ DETAILS -->
      <table width="100%" style="border:1px solid #e5e7eb; border-radius:10px; box-shadow:0 2px 6px rgba(0,0,0,0.04);">
        <tr>
          <td style="padding:16px;">
            <table width="100%">
              <tr>
                <td width="50%" style="background:#eef2ff;padding:15px;border-radius:8px;">
                  <b style="font-size:14px;color:#4338ca;">Delivery Location</b><br>
                  <span style="font-size:16px;font-weight:bold;">${deliveryLocation}</span>
                </td>
                <td width="50%" style="background:#fff7ed;padding:15px;border-radius:8px;">
                  <b style="font-size:14px;color:#b45309;">Required By</b><br>
                  <span style="font-size:16px;font-weight:bold;">${deliveryDate}</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <br>

      <!-- SECURE ACCESS BOX -->
      <table width="100%" style="background:#ecfdf5;border:1px solid #bbf7d0;padding:16px;border-radius:10px;">
        <tr>
          <td>
            <h3 style="margin:0;font-size:16px;">🔒 Secure Portal Access</h3>
            <p style="font-size:13px;color:#555;">
              To view complete RFQ details and submit your quotation, access our secure supplier portal.
              An OTP will be sent to your registered email.
            </p>

            <table width="100%" style="background:#ffffff;border:1px solid #bbf7d0;padding:12px;border-radius:8px;">
              <tr>
                <td>
                  <div style="font-size:12px;color:#666;">Your Registered Email</div>
                  <div style="font-size:14px;font-weight:bold;">${vendorEmail}</div>
                </td>
                <td align="right">📧</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <br>

      <!-- CTA BUTTON -->
      <div style="text-align:center;">
        <a href="${baseUrl}/auth/otp-varification/${rfqID}/${vendorID}?email=${vendorEmail}" class="btn" style="color:#fff;">
          🔐 Access Portal & Submit Your Quote
        </a>
        <p style="font-size:12px;color:#777;margin-top:8px;">
          This link is unique and requires OTP verification.
        </p>
      </div>

      <br>

      <!-- WARNING -->
      <table width="100%" style="background:#fffbeb;border-left:4px solid #fbbf24;padding:10px;">
        <tr>
          <td>
            ⏰ <b style="color:#92400e;">Response Deadline</b><br>
            <span style="font-size:13px;color:#b45309;">Submit your quotation by 12 Dec 2025, 5:00 PM GST</span>
          </td>
        </tr>
      </table>

      <br>

      <!-- WHY RESPOND -->
      <table width="100%" style="background:#f5f3ff;border:1px solid #ddd;padding:16px;border-radius:10px;">
        <tr>
          <td>
            <h3 style="margin:0 0 10px;">⭐ Why Respond to This RFQ?</h3>
            <ul style="padding-left:18px; margin:0;">
              <li><b>Verified Buyer:</b> Pre-qualified and ready to purchase</li>
              <li><b>Grow Your Business:</b> Expand your client base</li>
              <li><b>Secure Platform:</b> Safe transactions and logistics support</li>
            </ul>
          </td>
        </tr>
      </table>

      <br>

      <!-- SUPPORT -->
      <table width="100%" style="border:1px solid #e5e7eb;padding:16px;border-radius:10px;">
        <tr>
          <td align="center">
            <h3 style="margin:0 0 10px;">Need Help?</h3>

            <table width="100%">
              <tr>
                <td align="center" style="background:#f9fafb;padding:12px;border-radius:8px;">
                  📱 <br>
                  <b>WhatsApp Support</b><br>
                  +971 54 542 0778
                </td>
                <td align="center" style="background:#f9fafb;padding:12px;border-radius:8px;">
                  ✉️ <br>
                  <b>Email Support</b><br>
                  customercare@allbiz.ae
                </td>
              </tr>
            </table>

          </td>
        </tr>
      </table>

    </td>
  </tr>

  <!-- FOOTER -->
  <tr>
    <td style="background:#f3f4f6;padding:20px;text-align:center;font-size:12px;color:#666;">
      This email was sent from Allbiz – UAE's Premier B2B Marketplace<br><br>
      🔗 LinkedIn &nbsp;|&nbsp; 📸 Instagram
    </td>
  </tr>

</table>

</td></tr>
</table>

</body>
</html>
`;

module.exports = { getRfqTemplate,getRfqTemplateNew };
