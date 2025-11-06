// utils/generateOtp.js
const generateOtp = (length = 6, expiryMinutes = 10) => {
  const otp = Math.floor(
    Math.pow(10, length - 1) + Math.random() * 9 * Math.pow(10, length - 1)
  ).toString();

  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000); // expiry timestamp
  return { otp, expiresAt };
};
 

module.exports = { generateOtp };

