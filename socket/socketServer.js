const sql = require("mssql");
const store = require("../store");
const { setCurrentDatabase, setCurrentUser } = require('../constents').actions;

let io;
let lastPendingIds = new Set();

function initSocketServer(ioInstance) {
  io = ioInstance;

  io.on("connection", (socket) => {
    console.log("🟢 Client connected:", socket.id);

    socket.on("disconnect", () => {
      console.log("🔴 Client disconnected:", socket.id);
    });
  });

  startOrderPolling();
}

async function fetchLaundryOrders(client = "VPSLaundry971") {
  try {
    store.dispatch(setCurrentDatabase(client));
    store.dispatch(setCurrentUser("System"));
    const config = store.getState().constents.config;

    const pool = await sql.connect(config);
    const result = await pool
      .request()
      .input("ID2", sql.NVarChar(65), null)
      .input("isWeb", sql.Bit, 1)
      .execute("LaundryOrders_Get");
    // console.log('get laundry ordres');
    // console.log(result.recordset);

    return result.recordset;
  } catch (error) {
    console.error("Error fetching orders:", error.message);
    return [];
  }
}

function startOrderPolling() {
  setInterval(async () => {
    const orders = await fetchLaundryOrders();
    const pendingOrders = orders.filter((o) => o.Status === "Pending");

    const currentPendingIds = new Set(pendingOrders.map((o) => o.ID2));
    const newOrders = [...currentPendingIds].filter((id) => !lastPendingIds.has(id));

    if (newOrders.length > 0) {
      console.log("🔔 New pending orders:", newOrders);
      io.emit("newPendingOrders", pendingOrders); // send new pending orders to all clients
    } else {
      // TEST EMIT (you can remove this after confirming)
      io.emit("testEvent", { message: "Hello from Node.js!" });
    }

    lastPendingIds = currentPendingIds;
  }, 3000); // every 3 seconds
}

module.exports = { initSocketServer };
