const { Worker } = require("bullmq");
const connection = require("../config/redis");
// const { sendEmail } = require("../utils/email");
const { sendEmail } = require("../services/mailer");

console.log("📧 Email worker started...");

new Worker(
  "emailQueue",
  async job => {
    const { to, subject, text, html } = job.data;

    console.log("Sending email to:", to);

    await sendEmail(to, subject, text, html);

    console.log("Email sent to:", to);
  },
  {
    connection,
    concurrency: 5 // send 5 emails in parallel
  }
);