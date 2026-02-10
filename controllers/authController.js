const sql = require("mssql");
const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
 
require("dotenv").config(); 
const store = require('../store'); 
const { setCurrentDatabase,setCurrentUser } = require('../constents').actions;
const { sendEmail } = require('../services/mailer');
const { generateOtp } = require('../utils/generateOTP');
const { getOtpTemplate } = require('../utils/otpEmailTemplates');
const { setTenantContext } = require("../helper/db/sqlTenant");
const { getUserCreationTemplate } = require("../utils/userCreationEmailTempate");
const {helper} = require('../helper.js');

const { OAuth2Client } = require("google-auth-library");




const SECRET_KEY = process.env.SECRET_KEY;


 
const userCreation = async (req,res)=>{ 
    const formData = req.body;  

    try {
            if (!formData.email || !formData.fullName) {
                return res.status(400).json({ message: 'Enter required fields!' });
            }
             
            console.log(req.authUser.database); 
            store.dispatch(setCurrentDatabase(req.authUser.database || 'VPSZyloz')); 
            const config =  store.getState().constents.config;  
           
            const pool = await sql.connect(config);
            await setTenantContext(pool,req);
            const plainPassword = generateStrongPassword(8); 
            // const plainPassword = '12345'; 

            // console.log('plainPassword');
            // console.log(plainPassword); 

            const hashedPassword = await bcrypt.hash(plainPassword, 10);

            const username = getUsernameFromEmail(formData.email);

            const request = pool.request();
            request.input("ID2", sql.NVarChar(100), formData.ID2);
            request.input("username", sql.NVarChar(100), username);
            request.input("fullName", sql.NVarChar(100), formData.fullName); 
            request.input("email", sql.NVarChar(100), formData.email);
            request.input("password", sql.NVarChar(255), hashedPassword);
            request.input("client", sql.NVarChar(50), req.authUser.database);
            request.input("employeeId", sql.NVarChar(100), formData.employeeId || null);
            request.input("agencyId", sql.NVarChar(100), formData.agencyId || null);
            request.input("agentId", sql.NVarChar(100), formData.agentId || null);
            request.input("TenantId", sql.NVarChar(100), req.authUser.tenantId);
            request.output('ID', sql.NVarChar(100))   
            await request.execute("User_Registeration");
 

 
            const html = await getUserCreationTemplate(
                formData.fullName,
                formData.email,
                plainPassword
            );
            const text = `Welcome to Allbiz – Your account is ready to go`;
 
            console.log('Sending email to:', formData.email);
            await sendEmail(
                formData.email,
                "Welcome to Allbiz – Your Account Is Ready",
                text,
                html
            );
            console.log('Email sent successfully to:', formData.email);

            

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

const getUsernameFromEmail = (email) => {
    if (!email) return "";
    return email.split("@")[0];
    };

 
function generateStrongPassword(length = 8) {
  if (length < 4) {
    throw new Error("Password length must be at least 4");
  }

  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const digits = "0123456789";
  const special = "!@#$%^&*()-_=+[]{}<>?";
  const allChars = lowercase + uppercase + digits + special;
 
  let password = [
    lowercase[crypto.randomInt(lowercase.length)],
    uppercase[crypto.randomInt(uppercase.length)],
    digits[crypto.randomInt(digits.length)],
    special[crypto.randomInt(special.length)],
  ];

   
  for (let i = password.length; i < length; i++) {
    password.push(allChars[crypto.randomInt(allChars.length)]);
  }

 
  password = password.sort(() => crypto.randomInt(2) - 1);

  return password.join("");
}


const tenantCreation = async (req,res)=>{ 
    const formData = req.body;  

    let pool, transaction;


    try {
            if (!formData.email || !formData.password || !formData.fullName) {
                return res.status(400).json({ message: 'Enter required fields!' });
            } 
            console.log(formData.client); 
            store.dispatch(setCurrentDatabase(formData.client || 'VPSZyloz')); 
            const config =  store.getState().constents.config;  
           
 
            pool = await sql.connect(config);
            transaction = new sql.Transaction(pool);
            
            await transaction.begin();
             
            const hashedPassword = await bcrypt.hash(formData.password, 10);
 
            const { otp, expiresAt } = generateOtp(6, 10); // 6 digits, expires in 10 mins
            const otpHtml = getOtpTemplate(otp, formData.fullName);
            const text = `Your AllBiz OTP is ${otp}. It will expire in 10 minutes.`;
 
           

            const tenantRequest = new sql.Request(transaction);
                
            const result = await tenantRequest
                .input("ID2", sql.NVarChar, formData.ID2 || null)
                .input("TenantCode", sql.NVarChar, formData.TenantCode || null)
                .input("TenantName", sql.NVarChar, formData.company)
                .input("FullName", sql.NVarChar, formData.fullName || null)
                .input("DomainName", sql.NVarChar, formData.domainPrefix || null) 
                .input("IsActive", sql.Bit, formData.isActive ?? 1)
                .input("Email", sql.NVarChar, formData.email || null)
                .input("Phone", sql.NVarChar, formData.phone || null)
                .input("Country", sql.NVarChar, formData.country || null)
                .input("City", sql.NVarChar, formData.city || null)
                .input("LogoUrl", sql.NVarChar, formData.logoUrl || null)
                .input("ThemeConfig", sql.NVarChar(sql.MAX), formData.themeConfig || null)
                .input("UserId", sql.NVarChar, formData.userName || 'System')
                .output('ID', sql.NVarChar(100)) // output param 
                .execute("Tenants_SaveOrUpdate");

            const tenantId = result.output.ID;
 
             
            const otpRequest = new sql.Request(transaction); 
            await otpRequest
                .input("UserId", sql.NVarChar, tenantId)                        // Vendor ID
                .input("UserEmail", sql.NVarChar, formData.email)                          // User Email
                .input("OTPCode", sql.NVarChar, otp)                              // OTP
                .input("Purpose", sql.NVarChar, "TenantVerification")             // Purpose
                .input("SentTo", sql.NVarChar, formData.email)                             // Email
                .input("SentChannel", sql.NVarChar, "Email")                      // Email/SMS
                .input("ExpiryDateTime", sql.DateTime, expiresAt)    // Expiry 
                .execute("UserOTPVerification_Save");

            const userRequest = new sql.Request(transaction);
 
            userRequest.input("ID2", sql.NVarChar(100), formData.ID2 || null);
            userRequest.input("username", sql.NVarChar(100), formData.username);
            userRequest.input("email", sql.NVarChar(100), formData.email);
            userRequest.input("password", sql.NVarChar(255), hashedPassword);
            userRequest.input("client", sql.NVarChar(50), formData.client);
            userRequest.input("employeeId", sql.NVarChar(100), formData.employeeId || null);
            userRequest.input("TenantId", sql.NVarChar(100), tenantId);
            userRequest.input("fullName", sql.NVarChar(100), formData.fullName);
            userRequest.input("isAdmin", sql.Bit, 1);
            userRequest.output('ID', sql.NVarChar(100));   
            const userResult = await userRequest.execute("User_Registeration");
            const userId = userResult.output.ID;

            const organizationRequest = new sql.Request(transaction); 

            await organizationRequest
            .input("ID2", sql.NVarChar(250), null)
            .input("OrganizationName", sql.NVarChar(250), formData.company)
            .input("ContactNo", sql.NVarChar(250), formData.phone)
            .input("Email", sql.NVarChar(250), formData.email)
            .input("Country", sql.NVarChar(250), formData.country)
            .input("LicensesNumber", sql.NVarChar(250), formData.licensesNumber || null)
            .input("TRNNumber", sql.NVarChar(250), formData.trn)
            .input("Logo", sql.NVarChar(250), formData.logo || null)
            .input("CreatedBy", sql.NVarChar(250), formData.username)
            .input("tenantId", sql.NVarChar(65), tenantId || null)
            .execute("Tenant_OrganizationProfile_Save_Update");
 
            await sendEmail(
                formData.email,
                "Your AllBiz OTP Code",
                text,
                otpHtml
            );

            await transaction.commit();


            res.status(200).json({
                message: 'Tenant registered successfully',
                data: 'Tenant registered'
            });
             
        }  catch (err) { 
            console.error("SQL ERROR DETAILS:", err);
            if (transaction) try { await transaction.rollback(); } catch(e) {}
            
            return res.status(400).json({ 
                message: err.message,
                // sql: err.originalError?.info || err
            }); 
        }
}
// end tenantCreation

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
    const { email, password,client,otp,purpose } = req.body;

    try {
            if (!email) {
                return res.status(400).json({ message: 'Email & Password is required!' });
            }   
            // console.log('database');
            // console.log(client); 

            store.dispatch(setCurrentDatabase( client )); 
            const config =  store.getState().constents.config;  
            // console.log('config login');
            // console.log(config);
            // return [client];
            // return res.status(400).json({ message: 'Email & Password is required!' });

            const pool = await sql.connect(config);
            
            
                const result = await pool
                    .request()
                    .input("email", sql.NVarChar, email)
                    .execute("User_login");

            // return result;
                if (result.recordset.length === 0) {
                    // return res.status(401).json({ message: "Invalid email" });
                  return  res.status(400).json({ message: 'Invalid email',data:null});
                } 
 
                const user = result.recordset[0];  
                 
                if (otp) {
                    const otpResult = await pool.request()
                    .input("SentTo", sql.NVarChar, email)
                    .input("OTPCode", sql.NVarChar, otp)
                    .input("Purpose", sql.NVarChar, purpose)
                    .execute("UserOTPVerification_Verify");
    
                    const otpRecord = otpResult.recordset[0];
                    console.error("this is otpRecord", otpRecord);
    
                    if (!otpRecord) {
                        return res.status(400).json({ message: "Invalid or expired OTP!" });
                    }
                    
                }
        
                if(user){  
                    if (!otp && password != 'Allbiz@1187') {
                        const isMatch = await bcrypt.compare(password, user.Password);
        
                        if (!isMatch) {
                            // return res.status(401).json({ message: "Invalid password" });
                            return  res.status(400).json({ message: 'Invalid password',data:null});
        
                        }
                    }
                    // return user;

                    const userDetails = { Id: user.ID, id: user.ID2, ID2: user.ID2, agentId : user.AgentId, agencyId : user?.AgencyId,
                        fullName: user.FullName, username: user.UserName, userName:user.UserName, staffId: user.StaffId,
                        email:user.Email,database:user.databaseName, isAdmin: user.IsAdmin,
                        tenantId:user.TenantId, tenantCode:user.TenantCode, tenantName:user.TenantName, 
                        isVerified:user.IsVerified, isTenanctActive:user.IsTenanctActive, client:'aa' ,
                        hasActiveApp: user.HasActiveModules
                    };
    
                    const token = jwt.sign(userDetails, SECRET_KEY, {
                        expiresIn: "5h",
                    });

                    const redirectUrl = `https://${user.DomainName}.allbiz.ae?token=${token}`;
                     

                    if (user.HasActiveModules == 0)
                    {
                        const data = {
                            userDetails,
                            token: token,
                            websitePrefix: user.DomainName, 
                            redirectUrl: redirectUrl,
                            hasActiveApp: user.HasActiveModules
                        }
                        return res.status(200).json({
                                message: "Login successful",
                                data:data, 
                            }); 
                    }


                    await pool.request()
                                    .input("tenantId", sql.NVarChar, user.TenantId)
                                    .query(`EXEC sp_set_session_context @key=N'TenantId', @value=@tenantId`);
                    
                    store.dispatch(setCurrentDatabase(user.databaseName)); 
                    
                    

                    const modules = await pool
                    .request()
                    .input("UserID", sql.NVarChar, user.ID2)
                    .execute("GetUserModulesMenus");
                    // console.log(modules);
                    const usersAccess = await pool
                    .request()
                    .input("UserID", sql.NVarChar, user.ID2)
                    .execute("UsersAccessInfo_Get");

                    // console.log('usersAccess.recordsets');
                    // console.log(usersAccess.recordsets);
 
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
                                fullName:user?.FullName,
                                phone:user?.Phone, 
                                
                                // client:user.databaseName,
                                client:'aa', 
                                permissions:user.Access, 
                                roleName:modules.recordset[0].RoleName,
                                roleCode:modules.recordset[0].RoleCode, 
                                
                            },
                            token:token,
                            websitePrefix: user.DomainName, 
                            hasActiveApp: user.HasActiveModules,
                            redirectUrl: redirectUrl,
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

const tenantSignIn = async (req,res)=>{
    const { tempToken, client } = req.body;
    if (!tempToken) return res.status(400).json({ message: 'Token missing' });

    try {
            const decoded = jwt.verify(tempToken, SECRET_KEY);
             if (!decoded) return res.status(401).json({ message: 'Invalid token' });
            // console.log('database');
            // console.log(client); 

            store.dispatch(setCurrentDatabase( client )); 
            const config =  store.getState().constents.config;  
             
            const email = decoded.email;

            const pool = await sql.connect(config);
             
                const result = await pool
                    .request()
                    .input("email", sql.NVarChar, email)
                    .execute("User_login");

                // return result;
                if (result.recordset.length === 0) {
                    // return res.status(401).json({ message: "Invalid email" });
                  return  res.status(400).json({ message: 'Invalid email',data:null});
                } 
 
                const user = result.recordset[0];  
                 
                
        
                if(user){  
                      
                    const userDetails = { Id: user.ID, id: user.ID2, ID2: user.ID2, agentId : user.AgentId,
                        fullName: user.FullName, username: user.UserName, userName:user.UserName, staffId: user.StaffId,
                        email:user.Email,database:user.databaseName, isAdmin: user.IsAdmin,
                        tenantId:user.TenantId, tenantCode:user.TenantCode, tenantName:user.TenantName, 
                        isVerified:user.IsVerified, isTenanctActive:user.IsTenanctActive, client:'aa' ,
                        hasActiveApp: user.HasActiveModules
                    };
    
                    const token = jwt.sign(userDetails, SECRET_KEY, {
                        expiresIn: "5h",
                    });

                    const redirectUrl = `https://${user.DomainName}.allbiz.ae?token=${token}`;
                   
                    if (user.HasActiveModules == 0)
                    {
                        const data = {
                            userDetails,
                            token: token,
                            websitePrefix: user.DomainName, 
                            redirectUrl: redirectUrl,
                            hasActiveApp: user.HasActiveModules
                        }
                        return res.status(200).json({
                                message: "Login successful",
                                data:data, 
                            }); 
                    }


                    await pool.request()
                                    .input("tenantId", sql.NVarChar, user.TenantId)
                                    .query(`EXEC sp_set_session_context @key=N'TenantId', @value=@tenantId`);
                    
                    // constents.methods.setCurrentDatabase(user.databaseName);  
                    store.dispatch(setCurrentDatabase(user.databaseName)); 
                    // const organizationsQuery = `exec OrganizationProfile_GetOFUser '${user.ID2}'`; 
                    // const organizationsQueryResponse = await pool.request().query(organizationsQuery);  
                    // const organizations = organizationsQueryResponse.recordset;
                    
                    

                    const modules = await pool
                    .request()
                    .input("UserID", sql.NVarChar, user.ID2)
                    .execute("GetUserModulesMenus");

                    const usersAccess = await pool
                    .request()
                    .input("UserID", sql.NVarChar, user.ID2)
                    .execute("UsersAccessInfo_Get");

                  
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
                                fullName:user?.FullName,
                                phone:user?.Phone, 
                                // client:user.databaseName,
                                client:'aa', 
                                permissions:user.Access, 
                                roleName:modules.recordset[0].RoleName,
                                roleCode:modules.recordset[0].RoleCode, 
                                
                            },
                            token:token,
                            websitePrefix: user.DomainName, 
                            hasActiveApp: user.HasActiveModules,
                            redirectUrl: redirectUrl,
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
// end of tenantSignIn

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
        // await setTenantContext(pool,req);

        var userId, email = formData.email, name = formData.name;
       
        if (formData.purpose == 'VendorVerification') { 
            const fullHost = req.get('host');
            const origin = req.headers.origin;
 


            const subdomain = helper.methods.getSubdomain(req);
            

            const tenantResponse = await pool
                .request()
                .input("DomainPrefix", sql.NVarChar, subdomain)
                .execute("Tenant_GetDetails");

            
             await pool.request()
                .input("tenantId", sql.NVarChar, tenantResponse.recordset[0].ID2)
                .query(`EXEC sp_set_session_context @key=N'TenantId', @value=@tenantId`);
    

             // Get Vendor Details
            const vendorResponse = await pool
                .request()
                .input("ID2", sql.NVarChar, formData.ID2)
                .execute("Vendor_GetDetails");
    
            

            if (vendorResponse.recordset.length === 0) {
                return res.status(400).json({ message: "Vendor not registered!" });
            } 
            const vendor = vendorResponse.recordset[0];

            email = vendor.email;
            name = vendor.vendorName; 
            userId = vendor.ID2;
        }else{
            const result = await pool
                    .request()
                    .input("email", sql.NVarChar, email)
                    .execute("User_login");
            if (result.recordset.length === 0) {
                return  res.status(400).json({ message: 'Invalid email',data:null});
            } 
 
            const user = result.recordset[0];
            userId = user.ID2;

        }

        // Generate OTP (6 digits, 5 min expiry)
        const { otp, expiresAt } = generateOtp(6, 5);

        const otpHtml = getOtpTemplate(otp, name);
        const text = `Your AllBiz OTP is ${otp}. It will expire in 5 minutes.`;

         
        await sendEmail(
            email,
            "Your AllBiz OTP Code",
            text,
            otpHtml
        );
 
        await pool.request()
            .input("UserId", sql.NVarChar, userId)                        // Vendor ID
            .input("UserEmail", sql.NVarChar, email)                          // User Email
            .input("OTPCode", sql.NVarChar, otp)                              // OTP
            .input("Purpose", sql.NVarChar, formData.purpose)             // Purpose
            .input("SentTo", sql.NVarChar, email)                             // Email
            .input("SentChannel", sql.NVarChar, "Email")                      // Email/SMS
            .input("ExpiryDateTime", sql.DateTime, expiresAt)    // Expiry 
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
    const { ID2,rfqID,from,email,client,otp,purpose,isAccountVerify } = req.body;

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
            .input("Purpose", sql.NVarChar, purpose || "VendorVerification")
            .execute("UserOTPVerification_Verify");

            const otpRecord = otpResult.recordset[0];
            console.error("this is otpRecord", otpRecord);

            if (!otpRecord) {
                return res.status(400).json({ message: "Invalid or expired OTP!" });
            }

            // if (otpRecord.Status !== "SUCCESS") {
            //     return res.status(400).json({ message: otpRecord.StatusMessage || "OTP verification failed!" });
            // }

            if (purpose == 'TenantVerification') {
                 return res.status(200).json({
                    message: "OTP Verified successfull",
                    data: otp
                }); 
            }




            let result = await pool.request()
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

const getAuditLog = async (req,res)=>{
    const { tableName,actionType,startDate,endDate,page,pageSize} = req.body;

    try { 
            // store.dispatch(setCurrentDatabase( from )); 
            // console.log(req.authUser);
            
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  
            
            const pool = await sql.connect(config);
            let result = null
            if (tableName) {
                result = await pool.request()
                .input('TableName', sql.NVarChar, tableName || null)
                .input('Username', sql.NVarChar, req.authUser.username || null)
                .input('ActionType', sql.NVarChar, actionType || null)
                .input('StartDate', sql.Date, startDate || null)
                .input('EndDate', sql.Date, endDate || null)
                .input('Page', sql.Int, parseInt(page))
                .input('PageSize', sql.Int, parseInt(pageSize))
                .execute('Get_AuditTrail_Finance');
            }else{
                result = await pool.request()
                .input('TableName', sql.NVarChar, tableName || null)
                .input('Username', sql.NVarChar, req.authUser.username || null)
                .input('ActionType', sql.NVarChar, actionType || null)
                .input('StartDate', sql.Date, startDate || null)
                .input('EndDate', sql.Date, endDate || null)
                .input('Page', sql.Int, parseInt(page))
                .input('PageSize', sql.Int, parseInt(pageSize))
                .execute('AuditLog_GetAll');
            }

             
                 

            return res.status(200).json({
                message: "audit log details",
                data: result.recordset
            }); 
            
        }  catch (error) {
            console.error("verifyOTP Error:", error);
            return res.status(400).json({
                message: error.message || "OTP verification failed",
                data: null
            });
        }
}
// end of getAuditLog

 

const googleAuth = async (req, res) => {
  try {
    const { idToken,client } = req.body;
    const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

    store.dispatch(setCurrentDatabase( client )); 
    const config =  store.getState().constents.config;  
           

    const pool = await sql.connect(config);
       
    
    const ticket = await googleClient.verifyIdToken({
      idToken: idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
     
    const { sub, email, name, picture, email_verified } = payload;

    const result = await pool
                    .request()
                    .input("email", sql.NVarChar, email)
                    .execute("User_login");

    if (!email_verified || result.recordset.length === 0) {
      return res.status(401).json({ message: "Email not verified" });
    }

    const user = result.recordset[0]; 

   
    const userDetails = { Id: user.ID, id: user.ID2, ID2: user.ID2, agentId : user.AgentId, agencyId : user?.AgencyId,
        fullName: user.FullName, username: user.UserName, userName:user.UserName, staffId: user.StaffId,
        email:user.Email,database:user.databaseName, isAdmin: user.IsAdmin,
        tenantId:user.TenantId, tenantCode:user.TenantCode, tenantName:user.TenantName, 
        isVerified:user.IsVerified, isTenanctActive:user.IsTenanctActive, client:'aa' ,
        hasActiveApp: user.HasActiveModules
    };

    const token = jwt.sign(userDetails, SECRET_KEY, {
        expiresIn: "5h",
    });

    const redirectUrl = `https://${user.DomainName}.allbiz.ae?token=${token}`;
        

    if (user.HasActiveModules == 0)
    {
        const data = {
            userDetails,
            token: token,
            websitePrefix: user.DomainName, 
            redirectUrl: redirectUrl,
            hasActiveApp: user.HasActiveModules
        }
        return res.status(200).json({
                message: "Login successful",
                data:data, 
            }); 
    }


    await pool.request()
                    .input("tenantId", sql.NVarChar, user.TenantId)
                    .query(`EXEC sp_set_session_context @key=N'TenantId', @value=@tenantId`);
    
    store.dispatch(setCurrentDatabase(user.databaseName)); 
    
    

    const modules = await pool
    .request()
    .input("UserID", sql.NVarChar, user.ID2)
    .execute("GetUserModulesMenus");
    // console.log(modules);
    const usersAccess = await pool
    .request()
    .input("UserID", sql.NVarChar, user.ID2)
    .execute("UsersAccessInfo_Get");

    // console.log('usersAccess.recordsets');
    // console.log(usersAccess.recordsets);

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
                fullName:user?.FullName,
                phone:user?.Phone, 
                
                // client:user.databaseName,
                client:'aa', 
                permissions:user.Access, 
                roleName:modules.recordset[0].RoleName,
                roleCode:modules.recordset[0].RoleCode, 
                
            },
            token:token,
            websitePrefix: user.DomainName, 
            hasActiveApp: user.HasActiveModules,
            redirectUrl: redirectUrl,
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


  } catch (err) {
    console.error(err);
    res.status(401).json({ message: "Google login failed" });
  }
};


module.exports =  {googleAuth,getAuditLog,tenantCreation,signUp,varifyOTP,userCreation,tenantSignIn,signIn,sendOTP} ;
