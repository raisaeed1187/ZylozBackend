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
            console.log(formData.client); 
            store.dispatch(setCurrentDatabase(formData.client || 'Zyloz')); 
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
            request.input("client", sql.NVarChar(50), formData.client);
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


module.exports =  {signUp,userCreation,signIn} ;
