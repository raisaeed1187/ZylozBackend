const jwt = require('jsonwebtoken');
require("dotenv").config(); 
const store = require('./store'); 
const { setCurrentDatabase,setCurrentUser } = require('./constents').actions;
const sql = require("mssql");


const bcrypt = require("bcrypt");

const authenticateToken = async (req, res, next) => {
  // Get the token from the Authorization header
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access Denied. Token not provided.' });
  }

  //  const hashedPassword = await bcrypt.hash('NFSAdmin$', 10);
  
  //  console.log('hashedPassword');
  //  console.log(hashedPassword);


  try {
    // Verify the token
    const decoded = jwt.verify(token, process.env.SECRET_KEY);
     
    req.authUser = decoded; // Attach user information to the request object
    
    store.dispatch(setCurrentDatabase(req.authUser.database));
    store.dispatch(setCurrentUser(req.authUser));  

    next(); // Proceed to the next middleware or route handler
  } catch (err) {
    // return res.status(403).json({ message: 'Invalid or expired token.',data:null });
    return res.status(403).json({ message: 'Session has expired.',data:null });
    // return res.status(400).json({ message: error.message,data:null});

  }
};

module.exports = authenticateToken;
