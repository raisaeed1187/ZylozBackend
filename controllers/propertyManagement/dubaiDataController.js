const { getDataset, getFullDataset } = require("../../services/dubaiDataService");

const buildQuery = (reqQuery) => {
    const { column, filter, page, pageSize, limit, order_by, order_dir, offset, startDate, endDate } = reqQuery;
    const query = {};

    if (column) query.column = column;
    if (page) query.page = page;
    if (pageSize) query.pageSize = pageSize;
    if (limit) query.limit = limit;
    if (order_by) query.order_by = order_by;
    if (order_dir) query.order_dir = order_dir;
    if (offset) query.offset = offset;

    const filterParts = [];
    if (filter) filterParts.push(filter);
    if (startDate) filterParts.push(`instance_date>=${startDate}`);
    if (endDate) filterParts.push(`instance_date<=${endDate}`);
    if (filterParts.length) query.filter = filterParts.join(",");

    return query;
};

// If the caller asks for a specific page, honor it (manual paging).
// Otherwise fetch and merge every page so the response isn't capped at 1000 records.
const fetchDataset = (entity, datasetName, reqQuery) => {
    const query = buildQuery(reqQuery);
    return reqQuery.page ? getDataset(entity, datasetName, query) : getFullDataset(entity, datasetName, query);
};

const getDldBuildings = async (req, res) => {
    try {
        const data = await fetchDataset("dld", "dld_buildings-open-api", req.query);
        return res.status(200).json({ message: "DLD buildings data loaded successfully!", data });
    } catch (error) {
        console.error("getDldBuildings ERROR:", error.response?.data || error.message);
        return res.status(error.response?.status || 500).json({
            message: error.response?.data?.message || "Failed to fetch DLD buildings data",
            data: null,
        });
    }
};


const getDldTransactions = async (req, res) => {
    try {
        const data = await fetchDataset("dld", "dld_transactions-open-api", req.query);
        return res.status(200).json({ message: "DLD transactions data loaded successfully!", data });
    } catch (error) {
        console.error("getDldTransactions ERROR:", error.response?.data || error.message);
        return res.status(error.response?.status || 500).json({
            message: error.response?.data?.message || "Failed to fetch DLD transactions data",
            data: null,
        });
    }
};


const getDldTransactionGroups = async (req, res) => {
    try {
        const data = await fetchDataset("dld", "dld_lkp_transaction_groups-open-api", req.query);
        return res.status(200).json({ message: "DLD transaction groups data loaded successfully!", data });
    } catch (error) {
        console.error("getDldTransactionGroups ERROR:", error.response?.data || error.message);
        return res.status(error.response?.status || 500).json({
            message: error.response?.data?.message || "Failed to fetch DLD transaction groups data",
            data: null,
        });
    }
};


const getDldTransactionProcedures = async (req, res) => {
    try {
        const data = await fetchDataset("dld", "dld_lkp_transaction_procedures-open-api", req.query);
        return res.status(200).json({ message: "DLD transaction procedures data loaded successfully!", data });
    } catch (error) {
        console.error("getDldTransactionProcedures ERROR:", error.response?.data || error.message);
        return res.status(error.response?.status || 500).json({
            message: error.response?.data?.message || "Failed to fetch DLD transaction procedures data",
            data: null,
        });
    }
};



module.exports = { getDldBuildings, getDldTransactionGroups, getDldTransactions, getDldTransactionProcedures };
