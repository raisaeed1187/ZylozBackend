const getRfqSubmittedTemplate = async (
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
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Quotation Submitted</title>
</head>
<body style="margin:0; padding:0; font-family: 'Inter', sans-serif; background-color:#f5f5f5;">

  <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f5f5">
    <tr>
      <td align="center" style="padding: 20px;">

        <!-- Container -->
        <table width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="border-radius:16px; border:1px solid #e5e7eb;">
          
          <!-- Header -->
          <tr>
            <td align="center" bgcolor="#22c55e" style="border-top-left-radius:16px; border-top-right-radius:16px; padding:40px; color:#ffffff;">
              <div style="font-size:40px; margin-bottom:10px;">✔</div>
              <h1 style="margin:0; font-size:24px; font-weight:bold;">Quotation Submitted Successfully!</h1>
              <p style="margin:5px 0 0;">Thank you for your prompt response</p>
            </td>
          </tr>

          <!-- Confirmation Box -->
          <tr>
            <td style="padding:30px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#d1fae5; border:2px solid #22c55e; border-radius:12px; padding:15px;">
                <tr>
                  <td width="40" valign="top">
                    <!-- Icon -->
                    <div style="width:40px; height:40px; background-color:#bbf7d0; border-radius:8px; text-align:center; line-height:40px; color:#16a34a; font-size:20px;">💵</div>
                  </td>
                  <td style="padding-left:10px; font-size:14px; color:#065f46;">
                    <strong>Your quotation has been received</strong><br>
                    Reference ID: <span style="font-family:monospace; font-weight:bold;">#${rfqNumber}</span><br>
                    Submitted on: <span style="font-weight:600;">${rfqDate}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Steps -->
          <tr>
            <td style="padding:0 30px 30px 30px;">
              <h2 style="font-size:18px; font-weight:bold; margin-bottom:15px;">What Happens Next?</h2>
              
              <!-- Step 1 -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:10px;">
                <tr>
                  <td width="30" align="center" style="background-color:#bfdbfe; border-radius:50%; font-weight:bold; color:#1d4ed8;">1</td>
                  <td style="padding-left:10px; font-size:14px; background-color:#ffffff; border:1px solid #bfdbfe; border-radius:8px; padding:10px;">
                    <strong>Buyer Evaluation</strong><br>
                    The buyer will evaluate all quotations and compare pricing, terms, and delivery schedules.
                  </td>
                </tr>
              </table>

              <!-- Step 2 -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:10px;">
                <tr>
                  <td width="30" align="center" style="background-color:#e9d5ff; border-radius:50%; font-weight:bold; color:#7c3aed;">2</td>
                  <td style="padding-left:10px; font-size:14px; background-color:#ffffff; border:1px solid #e9d5ff; border-radius:8px; padding:10px;">
                    <strong>Clarifications or BAFO Request</strong><br>
                    The buyer may request clarifications OR ask for a <strong>BAFO (Best And Final Offer)</strong>.<br>
                    <span style="display:inline-block; background-color:#f3e8ff; padding:5px; border-radius:4px;">🔔 You'll be notified immediately if required.</span>
                  </td>
                </tr>
              </table>

              <!-- Step 3 -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="30" align="center" style="background-color:#bbf7d0; border-radius:50%; font-weight:bold; color:#15803d;">3</td>
                  <td style="padding-left:10px; font-size:14px; background-color:#ffffff; border:1px solid #bbf7d0; border-radius:8px; padding:10px;">
                    <strong>Final Decision & Notification</strong><br>
                    You'll receive an instant update on AllBiz regarding the outcome.<br>
                    <span style="display:inline-block; background-color:#d1fae5; padding:5px; border-radius:4px;">📈 Track under "My Quotations" in your dashboard.</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Support -->
          <tr>
            <td style="padding:0 30px 30px 30px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#e0f2fe; border:2px solid #60a5fa; border-radius:12px; padding:15px;">
                <tr>
                  <td width="40" valign="top">
                    <div style="width:40px; height:40px; background-color:#bae6fd; border-radius:8px; text-align:center; line-height:40px; color:#0284c7;">🎧</div>
                  </td>
                  <td style="padding-left:10px; font-size:14px; color:#0c4a6e;">
                    <strong>Need Assistance?</strong><br>
                    <a href="https://wa.me/971545420778" style="color:#047857; text-decoration:none;">WhatsApp: +971 54 542 0778</a><br>
                    <a href="mailto:customercare@allbiz.ae" style="color:#0369a1; text-decoration:none;">Email: customercare@allbiz.ae</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td bgcolor="#f3f4f6" style="padding:20px; text-align:center; font-size:12px; color:#6b7280;">
              <img src="https://allbiz.ae/assets/newImages/allbiz_new.png" alt="Allbiz Logo" width="80" style="margin-bottom:5px;">
              <div>Allbiz - Inspiring Digital change.</div>
              <div>Connecting buyers and suppliers across UAE</div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`


module.exports = { getRfqSubmittedTemplate };
