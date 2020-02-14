const crypto = require('crypto');
const Protocol = require("../protocol.js");
const WebsocketSession = require("./websocket.session.js");

const {
  OPCODE_CONNECTION_CLOSE,
  OPCODE_TEXT_FRAME,
  OPCODE_BINARY_FRAME,
  STATUS_NORMAL_CLOSURE
} = require("./constants.js");

class Websocket extends Protocol {
  constructor() {
    super("websocket");

    this.on("upgrade", this.upgrade.bind(this));

    this.id = 0;
    this.sessions = new Map();
  }

  nextid() {
    return this.id++;
  }

  decodeFrame(data) {
    let cursor = 0;
    let ctrl = data[cursor++];

    const fin = Boolean(ctrl & 128);
    const rsv1 = Boolean(ctrl & 64);
    const rsv2 = Boolean(ctrl & 32);
    const rsv3 = Boolean(ctrl & 16);
    const opcode = ctrl & 15;

    ctrl = data[cursor++];
    const masked = Boolean(ctrl & 128);
    let len = ctrl & 127;

    if (len === 126) {
      len = (data[cursor++] << 8) + data[cursor++];
    } else if (len === 127) {
      len = (data[cursor++] << 56)
        + (data[cursor++] << 48)
        + (data[cursor++] << 40)
        + (data[cursor++] << 32)
        + (data[cursor++] << 24)
        + (data[cursor++] << 16)
        + (data[cursor++] << 8)
        + data[cursor++];
    }

    let mask = null;
    if (masked) {
      mask = data.slice(cursor, cursor + 4);
      cursor += 4;
    }

    const buffer = data.slice(cursor);

    return {
      fin: fin,
      rsv1: rsv1,
      rsv2: rsv2,
      rsv3: rsv3,
      opcode: opcode,
      len: len,
      mask: mask,
      buffer: buffer
    };
  }

  unmask(data, mask) {
    if (!mask || mask.length !== 4) {
      return data;
    }

    const buffer = Buffer.alloc(data.length);

    for(let i = 0; i < data.length; i++) {
      buffer[i] = data[i] ^ mask[i%4];
    }

    return buffer;
  }

  encodeFrame(opcode, message = "", status) {
    const messageBuf = opcode === OPCODE_BINARY_FRAME ? Buffer.from(message) : Buffer.from(message, "utf8");

    let size = 2;
    let cursor = 0;
    let messageLen = messageBuf.length;
    let is16 = messageLen > 125;
    const is64 = messageLen > 65535;

    if (is64) {
      size += 8;
      is16 = false;
    }

    if (is16) {
      size += 2;
    }

    const headerBuf = Buffer.alloc(size);

    cursor = headerBuf.writeUInt8(0x80 | opcode, cursor);

    if (is64) {
      cursor = headerBuf.writeUInt8(127, cursor);

      cursor = headerBuf.writeUInt8((messageLen & 0xff00000000000000) >> 56, cursor);
      cursor = headerBuf.writeUInt8((messageLen & 0x00ff000000000000) >> 48, cursor);
      cursor = headerBuf.writeUInt8((messageLen & 0x0000ff0000000000) >> 40, cursor);
      cursor = headerBuf.writeUInt8((messageLen & 0x000000ff00000000) >> 32, cursor);
      cursor = headerBuf.writeUInt8((messageLen & 0x00000000ff000000) >> 24, cursor);
      cursor = headerBuf.writeUInt8((messageLen & 0x0000000000ff0000) >> 16, cursor);
      cursor = headerBuf.writeUInt8((messageLen & 0x000000000000ff00) >> 8, cursor);
      cursor = headerBuf.writeUInt8(messageLen & 0x00000000000000ff, cursor);
    } else if(is16) {
      cursor = headerBuf.writeUInt8(126, cursor);
      cursor = headerBuf.writeUInt8((messageLen & 0x0000ff00) >> 8, cursor);
      cursor = headerBuf.writeUInt8(messageLen & 0x000000ff, cursor);
    } else if (!is64 && !is16) {
      cursor = headerBuf.writeUInt8(messageLen, cursor);
    }

    if (opcode === OPCODE_CONNECTION_CLOSE && (status || message)) {
      const code = status || STATUS_NORMAL_CLOSURE;

      const statusBuf = Buffer.alloc(2);
      statusBuf.writeUInt16LE(code, 0);

      return Buffer.concat([headerBuf, statusBuf, messageBuf]);
    }

    return Buffer.concat([headerBuf, messageBuf]);
  }

  broadcast(message) {
    for(let [id, session] of this.sessions) {
      session.send(message);
    }
  }

  upgrade(request, socket, matches) {
    const { headers } = request;
    const isWebsocket = headers.upgrade && headers.upgrade.toLowerCase() === "websocket";

    if (!isWebsocket) {
      return;
    }

    const key = headers["sec-websocket-key"];

    if (!key) {
      return;
    }

    const accept = `${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`;

    const sha1 = crypto.createHash("sha1");
    sha1.update(accept);
    const hash = sha1.digest("base64");

    const responseHeaders =
      "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${hash}\r\n` +
      "\r\n";

    socket.write(responseHeaders, "utf8", () => {
      const id = this.nextid();
      const session = new WebsocketSession(this, id, socket, request, matches);
      this.sessions.set(id, session);
      session.on("close", () => {
        this.sessions.delete(id);
      });
      this.emit("session", session);
    });
  }
}

module.exports = Websocket;
