const { Queue } = require("bullmq");
const connection = require("../config/redis");

const emailQueue = new Queue("emailQueue", {
  connection,
  defaultJobOptions: {
    attempts: 3,            // retry 3 times
    backoff: {
      type: "exponential",
      delay: 5000
    },
    removeOnComplete: true,
    removeOnFail: false
  }
});

module.exports = emailQueue;