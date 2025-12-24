require("dotenv").config(); 
const states = {
    logoCache:{}
}

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

const urlToBase64 = async (url) => {
    if (!url) return null;

    if (states.logoCache[url]) {
        return states.logoCache[url];
    }

    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    const base64 = `data:${response.headers.get("content-type")};base64,${Buffer.from(buffer).toString("base64")}`;

    // Store in cache
    states.logoCache[url] = base64;

    return base64;
};



function getSubdomain(req) {
    let origin = req.headers.origin || req.headers.host || "";
    // let origin = 'https://test01.allbiz.ae';

    if (!origin) return null;

    
    origin = origin.replace(/^https?:\/\//, ""); 
    
     
    origin = origin.split(':')[0];

    const hostParts = origin.split('.');

     
    if (hostParts.length > 2) {
        return hostParts[0];  
    }

    return null;
}



const methods = { 
    getNextDay,
    getCurrentDateTime,
    urlToBase64,
    getSubdomain
}



const helper = {
    states,methods
}


module.exports =  {helper};

