require("dotenv").config(); 
const { createSlice } = require('@reduxjs/toolkit');

const sql = require("mssql");  
const SECRET_KEY = process.env.SECRET_KEY;
const states = {
    // config1:{
    //     user:"sa",
    //     password:"AZ123$%^",
    //     server:"10.0.0.6",
    //     port:1433,
    //     database:"reflexion",
    //     options:{
    //         trustServerCertificate:true,
    //         trustedConnection:false,
    //         enableArithAbort:true,
    //         // instancename:"SQLEXPRESS", 
    //     }
    // },
    config:{
        user: process.env.DB_USER,
        password:  process.env.DB_PASSWORD,
        server:process.env.DB_SERVER,
        port:parseInt(process.env.DB_PORT, 10), 
        database:process.env.DB_DATABASE, 
        pool: {
            max: 10,
            min: 0,
            idleTimeoutMillis: 30000
        },
        requestTimeout: 60000, // 60 seconds
        connectionTimeout: 30000,
        // pool: { max: 1, min: 0, idleTimeoutMillis: 500 },
        options:{
            trustServerCertificate:true,
            trustedConnection:false,
            enableArithAbort:true,
            // instancename:"SQLEXPRESS", 
            connectionTimeout: 60000,  
            requestTimeout: 600000, 
        }
    },
    // config:null,
    user:{
        Id:1,
        username:'Saeed Anwar'
    }
}

const constentsSlice = createSlice({
    name: 'constents',
    initialState: states,
    reducers: {
         
        setCurrentDatabase: (state, action) => { 
            state.config = {
                user: process.env.DB_USER,
                password:  process.env.DB_PASSWORD,
                server:process.env.DB_SERVER,
                port:parseInt(process.env.DB_PORT, 10), 
                database:action.payload, 
                // pool: { max: 1, min: 0, idleTimeoutMillis: 500 },
                options:{
                    trustServerCertificate:true,
                    trustedConnection:false,
                    enableArithAbort:true,
                    // encrypt: true,
                    // instancename:"SQLEXPRESS", 
                }
            };
        },
        getDBConnection: async (state, action) => { 
            const config = {
                user: process.env.DB_USER,
                password:  process.env.DB_PASSWORD,
                server:process.env.DB_SERVER,
                port:parseInt(process.env.DB_PORT, 10), 
                database:action.payload, 
                pool: { max: 1, min: 0, idleTimeoutMillis: 500 },
                options:{
                    trustServerCertificate:true,
                    trustedConnection:false,
                    enableArithAbort:true, 
                }
            }; 
            const pool = new sql.ConnectionPool(config);
            await pool.connect();
            return pool;
        },
        setCurrentUser:  (state, action) => {   
            state.user = action.payload; 
        },
        
         
    }
});

 
// get next n day
function getNextDay(n) {

    const currentDate = new Date();
    if (parseInt(n) > 0)  {
        const waisTime = currentDate.getTime() + parseInt(n) * 24 * 3600 * 1000;
        return new Date(waisTime);
    } else {
        return currentDate;
    }
}
function getCurrentDateTime() {
    const now = new Date();

    // Get the individual components (year, month, date, hours, minutes, seconds)
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0'); // months are 0-indexed
    const date = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    // Format the date in MSSQL DATETIME format
    return `${year}-${month}-${date} ${hours}:${minutes}:${seconds}`;
}
function setCurrentUser(user) { 
    states.user = user; 
}
function setCurrentDatabase(database) {  
    states.config = {
        user: process.env.DB_USER,
        password:  process.env.DB_PASSWORD,
        server:process.env.DB_SERVER,
        port:parseInt(process.env.DB_PORT, 10), 
        database:database, 
        pool: { max: 1, min: 0, idleTimeoutMillis: 500 },
        options:{
            trustServerCertificate:true,
            trustedConnection:false,
            enableArithAbort:true,
            encrypt: true,
            // instancename:"SQLEXPRESS", 
        }
    };
}; 
 
function getStartOfMonth(date){
    // return date ? new Date(date).toISOString().slice(0, 10).replace("T", " ") : null;
    const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);  
    const year = startOfMonth.getFullYear();
    const month = String(startOfMonth.getMonth() + 1).padStart(2, '0');
    const day = String(startOfMonth.getDate()).padStart(2, '0'); 
    const formattedDate = `${year}-${month}-${day}`; 
    return formattedDate;
};
 

const methods = { 
    getNextDay,
    getCurrentDateTime,
    setCurrentUser,
    setCurrentDatabase,
    getStartOfMonth
}

const constents = {
    states,methods
}


// module.exports =  {constents};
module.exports = constentsSlice;

