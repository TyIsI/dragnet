const EventEmitter = require('events');

class WebsocketSession extends EventEmitter {
  constructor(protocol, id, socket, request, matches) {
    super();

    this.protocol = protocol;
    this.id = id;
    this.socket = socket;
    this.request = request;
    this.matches = matches;

    this.socket.on("error", this.error.bind(this));
    this.socket.on("data", this.data.bind(this));
    this.socket.on("close", () => { this.emit("close"); });
  }

  decodeFrame(data) {
    return this.protocol.decodeFrame(data);
  }

  encodeFrame(message) {
    return this.protocol.encodeFrame(message);
  }

  data(data) {
    const message = this.decodeFrame(data);

    this.emit("text", message, this);
  }

  error(message) {
    this.emit("error", message);
  }

  close(status) {
    //TODO probably need to send a control frame to end
    this.socket.end();
  }

  async text(message) {
    const buffer = this.encodeFrame(message);

    return new Promise(resolve => {
      this.socket.write(buffer, resolve);
    });
  }
}

module.exports = WebsocketSession;
