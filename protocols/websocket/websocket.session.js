const EventEmitter = require('events');

const {
  OPCODE_TEXT_FRAME,
  OPCODE_BINARY_FRAME,
  OPCODE_CONNECTION_CLOSE,
  OPCODE_PING,
  OPCODE_PONG,
  STATUS_GOING_AWAY,
  OPCODE_CONTINUATION_FRAME
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

    this.previous = null;
  }

  unmask(data, mask) {
    return this.protocol.unmask(data, mask);
  }

  decodeFrame(data, resume) {
    return this.protocol.decodeFrame(data, resume);
  }

  encodeFrame(opcode, message) {
    return this.protocol.encodeFrame(opcode, message);
  }

  data(data) {
    if (this.previous && this.previous.buffer && this.previous.len - this.previous.buffer.length > 0) {
      this.previous.buffer = Buffer.concat([this.previous.buffer, data]);

      if (this.previous.len - this.previous.buffer.length === 0) {
        const { fin, buffer, mask, opcode } = this.previous;
        const decoded = this.unmask(buffer, mask);

        if (fin) {
          this.previous = null;
          this.handle(opcode, decoded);
        } else {
          this.previous.len = 0;
          this.previous.buffer = null;

          if (!this.previous.decoded) {
            this.previous.decoded = decoded;
          } else {
            this.previous.decoded = Buffer.concat([this.previous.decoded, decoded]);
          }
        }
      }

      return;
    }

    const frame = this.decodeFrame(data);

    if (frame.len > frame.buffer.length && !this.previous) {
      this.previous = frame;
      return;
    }

    if (frame.opcode === OPCODE_CONTINUATION_FRAME) {
      if (!this.previous) {
        return; // discard
      }

      if (this.previous.buffer && this.previous.len === this.previous.buffer.length) {
        const { mask, buffer } = this.previous;

        const decoded = this.unmask(buffer, mask);

        this.previous.len = 0;
        this.previous.buffer = null;

        if (!this.previous.decoded) {
          this.previous.decoded = decoded;
        } else {
          this.previous.decoded = Buffer.concat([this.previous.decoded, decoded]);
        }

        if (!frame.fin) {
          this.previous.mask = frame.mask;
          this.previous.len = frame.len;
          this.previous.buffer = frame.buffer;

          return;
        }
      }
    }

    if (!frame.fin) {
      if (!this.previous) {
        this.previous = frame;
      }

      this.previous.mask = frame.mask;
      this.previous.len = frame.len;
      this.previous.buffer = frame.buffer;

      return;
    }

    const { opcode } = this.previous || frame;

    const unmasked = this.unmask(frame.buffer, frame.mask);

    const decoded = this.previous && this.previous.decoded ? Buffer.concat([this.previous.decoded, unmasked]) : unmasked;

    this.handle(opcode, decoded);
  }

  handle(opcode, decoded) {
    if (opcode === OPCODE_TEXT_FRAME) {
      this.emit("text", decoded.toString("utf8"), this);
      return;
    }

    if (opcode === OPCODE_BINARY_FRAME) {
      this.emit("binary", decoded, this);
      return;
    }

    if(opcode === OPCODE_PING) {
      this.pong();
      this.emit("ping", decoded, this);
      return;
    }

    if (opcode === OPCODE_CONNECTION_CLOSE) {
      this.close(STATUS_GOING_AWAY);
      return;
    }

    this.emit("unknown", opcode, decoded, this);
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
