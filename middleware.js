const jwt = require('jsonwebtoken');
require("dotenv").config(); 

const authenticateToken = (req, res, next) => {
  // Get the token from the Authorization header
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access Denied. Token not provided.' });
  }

  try {
    // Verify the token
    const decoded = jwt.verify(token, process.env.SECRET_KEY);
     
    req.authUser = decoded; // Attach user information to the request object
    

    next(); // Proceed to the next middleware or route handler
  } catch (err) {
    // return res.status(403).json({ message: 'Invalid or expired token.',data:null });
    return res.status(403).json({ message: 'Session has expired.',data:null });
    // return res.status(400).json({ message: error.message,data:null});

  }
};

module.exports = authenticateToken;
