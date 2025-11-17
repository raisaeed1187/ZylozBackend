const getRfqVendorNotSelectedTemplate = async (
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
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Quote Status Update</title>
<style>
    body { margin:0; padding:0; background:#fdf5e6; font-family: Arial, sans-serif; }
    .container { max-width:700px; margin:0 auto; background:#ffffff; border-radius:12px; padding:20px; }
    .header { background:#f9b347; padding:35px 20px; text-align:center; border-radius:12px; color:#ffffff; }
    .section { background:#fff7ed; border:1px solid #ffd9b3; padding:20px; border-radius:10px; margin-bottom:20px; }
    .card { background:#ffffff; border:1px solid #d7e3ff; padding:20px; border-radius:10px; margin-bottom:20px; }
    .title { font-size:20px; font-weight:bold; color:#333; margin-bottom:10px; }
    .text { font-size:14px; color:#555; line-height:1.6; }
    .list-item { margin-bottom: 8px; }
    .button {
        display:inline-block;
        background:#1a936f;
        color:#ffffff;
        padding:12px 22px;
        border-radius:8px;
        text-decoration:none;
        font-weight:bold;
        margin-top:10px;
    }
    .button-secondary {
        display:inline-block;
        background:#666;
        color:#ffffff;
        padding:12px 22px;
        border-radius:8px;
        text-decoration:none;
        font-weight:bold;
        margin-top:10px;
    }
    .footer { text-align:center; font-size:13px; color:#6e6e6e; padding:20px 0; }
</style>
</head>

<body>

<div class="container">

    <!-- HEADER -->
    <div class="header">
        <h1 style="margin:0; font-size:26px;">Thank You for Your Partnership</h1>
        <p style="margin-top:10px; font-size:16px;">Your effort and commitment mean a lot to us</p>
    </div>

    <!-- MESSAGE BLOCK -->
    <div class="section">
        <div class="title">A Heartfelt Thank You</div>
        <p class="text">
            We sincerely appreciate the time, effort, and professionalism you invested in preparing your quotation 
            for <strong>#RFQ-2024-1547</strong>. Your dedication reflects your commitment to excellence and strong business relationships.
        </p>
        <p class="text">
            Your participation enriches the AllBiz marketplace, and we deeply value your continued partnership.
        </p>
    </div>

    <!-- DECISION BLOCK -->
    <div class="card">
        <div class="title">Why Another Supplier Was Selected</div>
        <p class="text">After evaluation, the buyer chose another supplier based on:</p>

        <ul class="text">
            <li class="list-item">More competitive pricing for bulk quantities</li>
            <li class="list-item">Earlier delivery timeline aligned with project requirements</li>
            <li class="list-item">Additional needed certifications</li>
        </ul>
    </div>

    <!-- STRENGTHS BLOCK -->
    <div class="card">
        <div class="title">Your Strengths</div>
        <p class="text">Your quotation stood out for:</p>

        <ul class="text">
            <li class="list-item">Professional presentation and detailed specifications</li>
            <li class="list-item">Fast communication and swift response</li>
            <li class="list-item">Competitive service quality</li>
        </ul>
    </div>

    <!-- RELATIONSHIP BLOCK -->
    <div class="section">
        <div class="title">Let's Continue This Journey</div>
        <p class="text">
            Although this opportunity was awarded elsewhere, your relationship with AllBiz remains strong.
            We are committed to connecting you with opportunities that match your strengths.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:15px; text-align:center;">
            <tr>
                <td><strong style="font-size:18px;">500+</strong><br/><span class="text">Monthly RFQs</span></td>
                <td><strong style="font-size:18px;">1200+</strong><br/><span class="text">Verified Buyers</span></td>
                <td><strong style="font-size:18px;">AED 2M+</strong><br/><span class="text">Daily Transactions</span></td>
            </tr>
        </table>
    </div>

    <!-- ACTIONS -->
    <div style="text-align:center; margin-top:25px;">
        <a href="https://allbiz.ae/dashboard" class="button">Go to Dashboard</a><br/>
        <a href="#" class="button-secondary">Close Window</a>
    </div>

    <!-- FOOTER -->
    <div class="footer">
        <img src="https://storage.googleapis.com/uxpilot-images-and-a-z/1718890432296_allbiz-logo.png" style="height:40px; margin-bottom:10px;" />
        <div><strong>AllBiz – Materials & Services Marketplace</strong></div>
        <div>Connecting businesses across UAE</div>
    </div>

</div>

</body>
</html>
`


module.exports = { getRfqVendorNotSelectedTemplate };

