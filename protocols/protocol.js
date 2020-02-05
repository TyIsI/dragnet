const EventEmitter = require('events');

class Protocol extends EventEmitter {
  constructor(name) {
    super();
    this.name = name;
  }

  upgrade(request, socket, matches) {
    throw new Error("upgrade handler not implemented");
  }
}

module.exports = Protocol;
