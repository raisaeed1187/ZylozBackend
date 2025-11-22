const getPOSentTemplate = async (
  po = {}, 
  baseUrl=''
)=>`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Quote Status Update</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; font-family: 'Arial', sans-serif; background-color:#f0fdf4;">

<!-- Wrapper Table -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f0fdf4">
  <tr>
    <td align="center" style="padding: 20px;">

      <!-- Main Card -->
      <table width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="border-radius:16px; overflow:hidden; border:1px solid #e5e7eb;">
        
        <tr>
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #e5e7eb; padding-top:20px; padding-bottom:10px; text-align:center;">
              <tr>
                <td>
                  <img src="https://allbiz.ae/assets/newImages/allbiz_new.png" alt="Allbiz Logo" style="height:28px; margin-bottom:5px;">
                  <p style="margin:0; font-size:12px; color:#6b7280;">Allbiz - Inspiring Digital change.</p>
                  <p style="margin:0; font-size:10px; color:#9ca3af;">Connecting buyers and suppliers across UAE</p>
                </td>
              </tr>
            </table>
        </tr>
      
        <!-- Header -->
        <tr>
          <td bgcolor="#10b981" style="padding:40px; text-align:center; color:#ffffff;">
             
            <h1 style="margin:0; font-size:28px;">Congratulations!</h1>
            <p style="margin:5px 0 0; font-size:16px;">Your quotation has been approved</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:30px;">

            <!-- Purchase Order Info -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px; border:1px solid #d1fae5; border-radius:12px; background-color:#ecfdf5; padding:20px;">
              <tr>
                <td style="font-weight:bold; color:#065f46;">PO Reference:</td>
                <td style="font-family:monospace; color:#065f46;">#${po.poCode || ''}</td>
              </tr>
              <tr>
                <td style="font-weight:bold; color:#065f46;">RFQ Reference:</td>
                <td style="font-family:monospace; color:#065f46;">#${po.rfqCode || ''}</td>
              </tr>
              <tr>
                <td style="font-weight:bold; color:#065f46;">Approved on:</td>
                <td style="color:#065f46;">${po.changedAt || ''}</td>
              </tr>
            </table>

            <!-- Download PO Button -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
              <tr>
                <td align="center">
                  <a href="#" style="display:inline-block; background-color:#3b82f6; color:#ffffff; text-decoration:none; padding:12px 24px; border-radius:12px; font-weight:bold;">Download Attached PO Document</a>
                </td>
              </tr>
            </table>

            <!-- Buyer Contact -->
            <!-- Buyer Contact + Delivery Coordination (2-column) -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px; border:1px solid #e5e7eb; border-radius:12px; background-color:#f9fafb;">
                <tr>
                    <!-- Left: Primary Contact -->
                    <td valign="top" width="50%" style="padding:20px; border-right:1px solid #eef2e9;">
                    <table cellpadding="0" cellspacing="0" border="0" width="100%">
                        <tr>
                        <td style="font-weight:bold; color:#111827; padding-bottom:8px;">Primary Contact</td>
                        </tr>
                        <tr>
                        <td style="padding:5px 0; color:#374151;">Name: ${po.contactPerson}</td>
                        </tr>
                        <tr>
                        <td style="padding:5px 0; color:#374151;">Position: ${po.contactPersonPosition || 'Procurement Manager'}</td>
                        </tr>
                        <tr>
                        <td style="padding:5px 0; color:#374151;">Company: ${po.company}</td>
                        </tr>
                        <tr>
                        <td style="padding:10px 0;">
                            <a href="tel:${po.companyContactNo}" style="color:#10b981; text-decoration:none; margin-right:12px; font-size:14px;">📞 ${po.companyContactNo}</a>
                            <a href="mailto:${po.companyEmail}" style="color:#3b82f6; text-decoration:none; font-size:14px;">✉ ${po.companyEmail}</a>
                        </td>
                        </tr>
                    </table>
                    </td>

                    <!-- Right: Delivery Coordination -->
                    <td valign="top" width="50%" style="padding:20px;">
                    <table cellpadding="0" cellspacing="0" border="0" width="100%">
                        <tr>
                        <td style="font-weight:bold; color:#111827; padding-bottom:8px;">Delivery Coordination</td>
                        </tr>
                        <tr>
                        <td style="padding:5px 0; color:#374151;">
                            <strong>Site Address:</strong><br>
                            <span style="color:#374151; font-size:14px; line-height:1.3;">${po.deliveryLocation || ''}</span>
                        </td>
                        </tr>
                        <tr> 
                        </tr>
                        <tr>
                        <td style="padding:10px 0;">
                            <a href="https://wa.me/${po.companyContactNo || '971509876543'}" style="display:inline-block; background-color:#25D366; color:#ffffff; text-decoration:none; padding:8px 12px; border-radius:8px; font-size:14px; margin-right:8px;">
                            WhatsApp
                            </a>
                            <a href="tel:${po.deliveryContactNo || po.companyContactNo}" style="color:#10b981; text-decoration:none; font-size:14px; margin-left:6px;">
                            Call Delivery
                            </a>
                        </td>
                        </tr>
                    </table>
                    </td>
                </tr>
            </table>


            <!-- Next Steps -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px; border:1px solid #e5e7eb; border-radius:12px; padding:20px; background-color:#f9fafb;">
                <tr>
                    <td style="font-weight:bold; color:#111827;">Next Steps</td>
                </tr>
                <tr>
                    <td style="padding:5px 0;">1. Download and review the purchase order</td>
                </tr>
                <tr>
                    <td style="padding:5px 0;">2. Contact buyer to coordinate delivery schedule</td>
                </tr>
                <tr>
                    <td style="padding:5px 0;">3. Update delivery status on your dashboard</td>
                </tr>
            </table>


            <!-- Footer -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #e5e7eb; padding-top:20px; text-align:center;">
              <tr>
                <td>
                  <img src="https://allbiz.ae/assets/newImages/allbiz_new.png" alt="Allbiz Logo" style="height:28px; margin-bottom:5px;">
                  <p style="margin:0; font-size:12px; color:#6b7280;">Allbiz - Inspiring Digital change.</p>
                  <p style="margin:0; font-size:10px; color:#9ca3af;">Connecting buyers and suppliers across UAE</p>
                </td>
              </tr>
            </table>

          </td>
        </tr>

      </table>
      <!-- End Main Card -->

    </td>
  </tr>
</table>

</body>
</html>
`;

module.exports = { getPOSentTemplate };

