// store.js
const { configureStore } = require('@reduxjs/toolkit');
const constentsSlice = require('./constents');

const store = configureStore({
    reducer: {
        constents: constentsSlice.reducer
    }
});

module.exports = store;

