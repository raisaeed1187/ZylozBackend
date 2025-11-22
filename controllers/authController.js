const sql = require("mssql");
const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
require("dotenv").config(); 
const store = require('../store'); 
const { setCurrentDatabase } = require('../constents').actions;
const { sendEmail } = require('../services/mailer');
const { generateOtp } = require('../utils/generateOTP');
const { getOtpTemplate } = require('../utils/otpEmailTemplates');



const SECRET_KEY = process.env.SECRET_KEY;
 
 
const userCreation = async (req,res)=>{
    // const { username,email, password,client } = req.body;
    const formData = req.body;  

    try {
            if (!formData.email || !formData.password || !formData.fullName) {
                return res.status(400).json({ message: 'Enter required fields!' });
            }
            console.log('database');
            console.log(req.authUser.database); 
            store.dispatch(setCurrentDatabase(req.authUser.database || 'Zyloz')); 
            const config =  store.getState().constents.config;  
           
            const pool = await sql.connect(config);
            
            // const existingUser = await pool
            // .request()
            // .input("email", sql.NVarChar, formData.email)
            // .query("SELECT * FROM Users WHERE email = @email");

            // if (existingUser.recordset.length > 0) {
            //      return res.status(400).json({ message: "Email already exists",data:null});
            // } 
            // Hash the password
            const hashedPassword = await bcrypt.hash(formData.password, 10);

            // Insert new user into the database
            // await pool
            // .request()
            // .input("username", sql.NVarChar, username)
            // .input("email", sql.NVarChar, email)
            // .input("password", sql.NVarChar, hashedPassword)
            // .input("client", sql.NVarChar, client) 
            // .query("INSERT INTO Users (username,email, password) VALUES (@username,@email, @password)");
            
            const { otp, expiresAt } = generateOtp(6, 10); // 6 digits, expires in 10 mins
            const otpHtml = getOtpTemplate(otp, formData.fullName);
            const text = `Your AllBiz OTP is ${otp}. It will expire in 10 minutes.`;

            // await sendEmail(
            // formData.email,
            // 'Test Email',
            // 'This is a test email sent from Allbiz.'
            // );

            await sendEmail(
                formData.email,
                "Your AllBiz OTP Code",
                text,
                otpHtml
            );

            const request = pool.request();
            request.input("ID2", sql.NVarChar(100), formData.ID2);
            request.input("username", sql.NVarChar(100), formData.fullName);
            request.input("email", sql.NVarChar(100), formData.email);
            request.input("password", sql.NVarChar(255), hashedPassword);
            request.input("client", sql.NVarChar(50), req.authUser.database);
            request.input("employeeId", sql.NVarChar(100), formData.employeeId || null);

            await request.execute("User_Registeration");
 

            res.status(200).json({
                message: 'User registered successfully',
                data: 'user registered'
            });
             
        } catch (error) {
            // console.log(error);
            throw new Error(error.message);

        }
}
// end userCreation

const signUp = async (req,res)=>{
    const { username,email, password,client } = req.body;

    try {
            if (!email || !password || !username) {
                return res.status(400).json({ message: 'Enter required fields!' });
            }
            console.log('database');
            console.log(client); 
            store.dispatch(setCurrentDatabase(client || 'Zyloz')); 
            const config =  store.getState().constents.config;  
           
            const pool = await sql.connect(config);
            
            const existingUser = await pool
            .request()
            .input("email", sql.NVarChar, email)
            .query("SELECT * FROM Users WHERE email = @email");

            if (existingUser.recordset.length > 0) {
                // return res.status(400).json({ message: "Email already exists" });
                return res.status(400).json({ message: "Email already exists",data:null});
            } 
            // Hash the password
            const hashedPassword = await bcrypt.hash(password, 10);

            // Insert new user into the database
            // await pool
            // .request()
            // .input("username", sql.NVarChar, username)
            // .input("email", sql.NVarChar, email)
            // .input("password", sql.NVarChar, hashedPassword)
            // .input("client", sql.NVarChar, client) 
            // .query("INSERT INTO Users (username,email, password) VALUES (@username,@email, @password)");

            const request = pool.request();
            request.input("ID2", sql.NVarChar(100), '0');
            request.input("username", sql.NVarChar(100), username);
            request.input("email", sql.NVarChar(100), email);
            request.input("password", sql.NVarChar(255), hashedPassword);
            request.input("client", sql.NVarChar(50), client);
            await request.execute("User_Registeration");


            res.status(200).json({
                message: 'User registered successfully',
                data: 'user registered'
            });
             
        } catch (error) {
            // console.log(error);
            throw new Error(error.message);

        }
}
// end signUp

const signIn = async (req,res)=>{
    const { email, password,client } = req.body;

    try {
            if (!email || !password) {
                return res.status(400).json({ message: 'Email & Password is required!' });
            }   
            console.log('database');
            console.log(client); 

            store.dispatch(setCurrentDatabase( client )); 
            const config =  store.getState().constents.config;  
            console.log('config login');
            console.log(config);

            const pool = await sql.connect(config);
            
            const result = await pool
                .request()
                .input("email", sql.NVarChar, email)
                .query("SELECT * FROM Users WHERE email = @email");

                if (result.recordset.length === 0) {
                    // return res.status(401).json({ message: "Invalid email" });
                  return  res.status(400).json({ message: 'Invalid email',data:null});
                } 
 
                const user = result.recordset[0]; 
                console.log('user');
                console.log(user); 
                if(user){ 
                    console.log('inside user');
                    const isMatch = await bcrypt.compare(password, user.Password);
    
                    if (!isMatch) {
                        // return res.status(401).json({ message: "Invalid password" });
                      return  res.status(400).json({ message: 'Invalid password',data:null});
    
                    }
    
                    const token = jwt.sign({ Id: user.ID,ID2: user.ID2, username: user.UserName,staffId: user.StaffId,email:user.Email,database:user.databaseName}, SECRET_KEY, {
                        expiresIn: "5h",
                    });
                    // constents.methods.setCurrentDatabase(user.databaseName);  
                    store.dispatch(setCurrentDatabase(user.databaseName)); 
                    const organizationsQuery = `exec OrganizationProfile_GetOFUser '${user.ID2}'`; 
                    const organizationsQueryResponse = await pool.request().query(organizationsQuery);  
                    // const organizations = organizationsQueryResponse.recordset;
                    
                    const modules = await pool
                    .request()
                    .input("UserID", sql.NVarChar, user.ID2)
                    .execute("GetUserModulesMenus");

                    const usersAccess = await pool
                    .request()
                    .input("UserID", sql.NVarChar, user.ID2)
                    .execute("UsersAccessInfo_Get");

                    console.log('usersAccess.recordsets');
                    console.log(usersAccess.recordsets);

                    // const userInfo = usersAccess.recordsets[0][0];
                    // const roles = usersAccess.recordsets[1];
                    const organizations = usersAccess.recordsets[2];
                    const branches = usersAccess.recordsets[3];
                    
                    if (modules.recordset.length > 0) {
                        // console.log(modules.recordset);
                        const data = {
                            userDetails:{
                                id: user.ID2,
                                email:user.Email,
                                userName:user.UserName,
                                isAdmin: user.IsAdmin,
                                // client:user.databaseName,
                                client:'aa', 
                                permissions:user.Access, 
                                roleName:modules.recordset[0].RoleName,
                                roleCode:modules.recordset[0].RoleCode, 
                            },
                            token:token,
                            organizations:organizations,
                            branches:branches, 
                            modules: modules.recordset,
                        }  
                        return res.status(200).json({
                            message: "Login successful",
                            data: data
                        }); 
                        
                    }else{
                      return  res.status(400).json({ message: 'Un Authenticated User',data:null});
                    }


                    pool.close();
                }else{
                    console.log('in else condition');
                   return  res.status(400).json({ message: 'User not found',data:null});
                }
                pool.close();
            
        } catch (error) {
            console.log(error);
           return res.status(400).json({ message: error.message,data:null});

        }
}
// end of signIn

const sendOTP = async (req, res) => {
    const formData = req.body;

    try {
        
         
        if (!formData.email) {
            return res.status(400).json({ message: "Email are required!" });
        }

        // Switch database
        store.dispatch(setCurrentDatabase(formData.from));
        const config = store.getState().constents.config;

        const pool = await sql.connect(config);

        // Get Vendor Details
        const vendorResponse = await pool
            .request()
            .input("ID2", sql.NVarChar, formData.ID2)
            .execute("Vendor_GetDetails");

        if (vendorResponse.recordset.length === 0) {
            return res.status(400).json({ message: "Vendor not registered!" });
        }

        const vendor = vendorResponse.recordset[0];

        // Generate OTP (6 digits, 5 min expiry)
        const { otp, expiresAt } = generateOtp(6, 5);

        const otpHtml = getOtpTemplate(otp, vendor.vendorName || formData.name);
        const text = `Your AllBiz OTP is ${otp}. It will expire in 5 minutes.`;

        const email = vendor.email || formData.email;

        // Send Email
        await sendEmail(
            email,
            "Your AllBiz OTP Code",
            text,
            otpHtml
        );
 
        await pool.request()
            .input("UserId", sql.NVarChar, vendor.ID2)                        // Vendor ID
            .input("UserEmail", sql.NVarChar, email)                          // User Email
            .input("OTPCode", sql.NVarChar, otp)                              // OTP
            .input("Purpose", sql.NVarChar, "VendorVerification")             // Purpose
            .input("SentTo", sql.NVarChar, email)                             // Email
            .input("SentChannel", sql.NVarChar, "Email")                      // Email/SMS
            .input("ExpiryDateTime", sql.DateTime, expiresAt)                 // Expiry
            .execute("UserOTPVerification_Save");

        return res.status(200).json({
            message: "OTP sent successfully",
            expiresAt,
            // DEBUG_OTP: otp  // remove in production
        });

    } catch (error) {
        console.error("sendOTP Error:", error.message);
        return res.status(500).json({
            message: "Failed to send OTP",
            error: error.message
        });
    }
};


const varifyOTP = async (req,res)=>{
    const { ID2,rfqID,from,email,client,otp } = req.body;

    try {
            if (!email || !otp) {
                return res.status(400).json({ message: "Email & OTP are required!" });
            }   

            store.dispatch(setCurrentDatabase( from )); 
            const config =  store.getState().constents.config;  
           

            const pool = await sql.connect(config);
            
            
            const otpResult = await pool.request()
            .input("SentTo", sql.NVarChar, email)
            .input("OTPCode", sql.NVarChar, otp)
            .input("Purpose", sql.NVarChar, "VendorVerification")
            .execute("UserOTPVerification_Verify");

            const otpRecord = otpResult.recordset[0];
            console.error("this is otpRecord", otpRecord);

            if (!otpRecord) {
                return res.status(400).json({ message: "Invalid or expired OTP!" });
            }

            // if (otpRecord.Status !== "SUCCESS") {
            //     return res.status(400).json({ message: otpRecord.StatusMessage || "OTP verification failed!" });
            // }


            let result = await await pool.request()
                        .input('ID2', sql.NVarChar(65), rfqID)
                        .input('OrganizationId', sql.NVarChar(65), null)
                        .input('VendorId', sql.NVarChar(65), ID2) 
                        .execute('RFQ_Get');
                


                if (result.recordset.length === 0) {
                    // return res.status(401).json({ message: "Invalid email" });
                  return  res.status(400).json({ message: 'Invalid email',data:null});
                } 
 
                const user = result.recordset[0];  

                if(user){ 
                    const vendorEmail = user.vendorEmail; 
                    
                    const token = jwt.sign({ Id: ID2,ID2: user.ID2, username: user.vendorName,staffId: ID2,email:vendorEmail,database:from}, SECRET_KEY, {
                        expiresIn: "5h",
                    });
                      
                    
                    if (result.recordset.length > 0) { 
                        const data = {
                            userDetails:{
                                id: user.ID2,
                                email:user.vendorEmail,
                                userName:user.vendorName,
                                isAdmin: user?.IsAdmin || 0, 
                                client:'aa',  
                            },
                            token:token, 
                        }  
                        return res.status(200).json({
                            message: "Login successful",
                            data: data
                        }); 
                        
                    }else{
                      return  res.status(400).json({ message: 'Un Authenticated User',data:null});
                    } 
                }else{ 
                   return  res.status(400).json({ message: 'User not found',data:null});
                } 
            
        }  catch (error) {
            console.error("verifyOTP Error:", error);
            return res.status(400).json({
                message: error.message || "OTP verification failed",
                data: null
            });
        }
}
// end of signIn

module.exports =  {signUp,varifyOTP,userCreation,signIn,sendOTP} ;
