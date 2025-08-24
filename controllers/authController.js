const sql = require("mssql");
const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
require("dotenv").config(); 
const store = require('../store'); 
const { setCurrentDatabase } = require('../constents').actions;

const SECRET_KEY = process.env.SECRET_KEY;
 
 

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
            // console.log('config login');
            // console.log(config);

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
    
                    const token = jwt.sign({ Id: user.ID, username: user.UserName,staffId: user.StaffId,email:user.Email,database:user.databaseName}, SECRET_KEY, {
                        expiresIn: "5h",
                    });
                    // constents.methods.setCurrentDatabase(user.databaseName);  
                    store.dispatch(setCurrentDatabase(user.databaseName)); 
                    const organizationsQuery = `exec OrganizationProfile_GetOFUser '${user.ID2}'`; 
                    const organizationsQueryResponse = await pool.request().query(organizationsQuery);  
                    const organizations = organizationsQueryResponse.recordset;
                    
                    const data = {
                        userDetails:{
                            id: user.ID2,
                            email:user.Email,
                            userName:user.UserName,
                            isAdmin: user.IsAdmin,
                            client:user.databaseName,
                            permissions:user.Access, 
                        },
                        token:token,
                        organizations:organizations
                    }  
                    return res.status(200).json({
                        message: "Login successful",
                        data: data
                    }); 

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


module.exports =  {signUp,signIn} ;
