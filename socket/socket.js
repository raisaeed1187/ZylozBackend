let ioInstance = null;

module.exports = {
  setIO: (io) => {
    ioInstance = io;
  },
  getIO: () => ioInstance,
};



