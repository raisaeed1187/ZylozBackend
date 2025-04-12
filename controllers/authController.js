const sql = require("mssql");
const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
require("dotenv").config(); 
const store = require('../store'); 
const { setCurrentDatabase } = require('../constents').actions;

const SECRET_KEY = process.env.SECRET_KEY;
 
 

const signUp = async (req,res)=>{
    const { username,email, password } = req.body;

    try {
            if (!email || !password || !username) {
                return res.status(400).json({ message: 'Enter required fields!' });
            }
            const pool = await sql.connect(constents.states.config);
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
            await pool
            .request()
            .input("username", sql.NVarChar, username)
            .input("email", sql.NVarChar, email)
            .input("password", sql.NVarChar, hashedPassword)
            .query("INSERT INTO Users (username,email, password) VALUES (@username,@email, @password)");

            res.status(200).json({
                message: 'User registered successfully',
                data: 'user registered'
            });
             
        } catch (error) {
            // console.log(error);
            throw new Error(err.message);

        }
}
// end signUp

const signIn = async (req,res)=>{
    const { email, password } = req.body;

    try {
            if (!email || !password) {
                return res.status(400).json({ message: 'Email & Password is required!' });
            }   
            store.dispatch(setCurrentDatabase('Zyloz')); 
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
                    res.status(400).json({ message: 'Invalid email',data:null});
                }

                const user = result.recordset[0]; 

                const isMatch = await bcrypt.compare(password, user.Password);

                if (!isMatch) {
                    // return res.status(401).json({ message: "Invalid password" });
                    res.status(400).json({ message: 'Invalid password',data:null});

                }

                const token = jwt.sign({ Id: user.ID, username: user.UserName,email:user.Email,database:user.databaseName}, SECRET_KEY, {
                    expiresIn: "5h",
                });
                // constents.methods.setCurrentDatabase(user.databaseName);  
                store.dispatch(setCurrentDatabase(user.databaseName)); 
                
                const data = {
                    userDetails:{
                        email:user.Email,
                        userName:user.UserName,
                        isAdmin: user.IsAdmin,
                        client:user.databaseName
                    },
                    token:token
                }  
            res.status(200).json({
                message: "Login successful",
                data: data
            }); 
            pool.close();
           
             
        } catch (error) {
            console.log(error);
        }
}
// end of signIn


module.exports =  {signUp,signIn} ;
