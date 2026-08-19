const axios = require("axios");
require("dotenv").config();

const TOKEN_URL = process.env.DUBAI_DATA_TOKEN_URL;
const BASE_URL = process.env.DUBAI_DATA_BASE_URL;
const SECURITY_APP_IDENTIFIER = process.env.DUBAI_DATA_SECURITY_APP_IDENTIFIER;
const CLIENT_ID = process.env.DUBAI_DATA_CLIENT_ID;
const CLIENT_SECRET = process.env.DUBAI_DATA_CLIENT_SECRET;

let cachedToken = null;
let tokenExpiresAt = 0;

const fetchAccessToken = async () => {
    const response = await axios.post(
        TOKEN_URL,
        {
            grant_type: "client_credentials",
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
        },
        {
            headers: {
                "Content-Type": "application/json",
                "x-DDA-SecurityApplicationIdentifier": SECURITY_APP_IDENTIFIER,
            },
        }
    );

    const { access_token, expires_in } = response.data;
    cachedToken = access_token;
    // refresh 60s before actual expiry
    tokenExpiresAt = Date.now() + (expires_in - 60) * 1000;

    return cachedToken;
};

const getAccessToken = async () => {
    if (cachedToken && Date.now() < tokenExpiresAt) {
        return cachedToken;
    }
    return fetchAccessToken();
};

const getDataset = async (entity, datasetName, query = {}, isRetry = false) => {
    const token = await getAccessToken();

    try {
        const response = await axios.get(`${BASE_URL}/${entity}/${datasetName}`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
            params: query,
        });

        const contentType = response.headers["content-type"] || "";
        if (contentType.includes("text/html")) {
            const error = new Error(`${entity}/${datasetName} was rejected upstream (gateway/WAF) instead of returning data. The application may not be entitled to this dataset.`);
            error.response = { status: 502, data: { message: error.message } };
            throw error;
        }

        return response.data;
    } catch (error) {
        if (error.response?.status === 401 && !isRetry) {
            cachedToken = null;
            return getDataset(entity, datasetName, query, true);
        }
        throw error;
    }
};

module.exports = { getAccessToken, getDataset };
