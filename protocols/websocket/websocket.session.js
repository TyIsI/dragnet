const EventEmitter = require('events');

const {
  OPCODE_TEXT_FRAME,
  OPCODE_BINARY_FRAME,
  OPCODE_CONNECTION_CLOSE,
  OPCODE_PING,
  OPCODE_PONG,
  STATUS_GOING_AWAY
} = require("./constants.js");

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
    this.socket.on("close", () => { this.emit("close", this); });
  }

  decodeFrame(data) {
    return this.protocol.decodeFrame(data);
  }

  encodeFrame(opcode, message) {
    return this.protocol.encodeFrame(opcode, message);
  }

  data(data) {
    const { opcode, message } = this.decodeFrame(data);

    if (opcode === OPCODE_TEXT_FRAME) {
      this.emit("text", message, this);
      return;
    }

    if (opcode === OPCODE_BINARY_FRAME) {
      this.emit("binary", message, this);
      return;
    }

    if(opcode === OPCODE_PING) {
      this.pong();
      this.emit("ping", message, this);
      return;
    }

    if (opcode === OPCODE_CONNECTION_CLOSE) {
      this.close(STATUS_GOING_AWAY);
      return;
    }

    this.emit("unknown", { opcode, message }, this);
  }

  error(message) {
    this.emit("error", message);
  }

  pong() {
    this.send(OPCODE_PONG);
  }

  async send(opcode, message) {
    const buffer = this.encodeFrame(opcode, message);

    return new Promise(resolve => {
      this.socket.write(buffer, resolve);
    });
  }

  async text(message) {
    return this.send(OPCODE_TEXT_FRAME, message);
  }

  async binary(message) {
    return this.send(OPCODE_BINARY_FRAME, message);
  }

  async close(status, reason) {
    const buffer = this.encodeFrame(OPCODE_CONNECTION_CLOSE, reason, status);

    return new Promise(resolve => {
      this.socket.end(buffer, resolve);
    });
  }
}

module.exports = WebsocketSession;
