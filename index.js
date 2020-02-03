const Dragnet = require("./dragnet.js");

function createDragnetServer(options) {
  return new Dragnet(options);
}

module.exports = createDragnetServer;
