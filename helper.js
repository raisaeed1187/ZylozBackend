require("dotenv").config(); 
const states = {

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

const methods = { 
    getNextDay,
    getCurrentDateTime
}

const helper = {
    states,methods
}


module.exports =  {helper};

