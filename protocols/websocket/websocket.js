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

    const fin = Boolean(ctrl & 128); // TODO has more
    // const rsv1 = Boolean(ctrl & 64);
    // const rsv2 = Boolean(ctrl & 32);
    // const rsv3 = Boolean(ctrl & 16);
    const opcode = ctrl & 15;

    ctrl = data[cursor++];
    const masked = Boolean(ctrl & 128);
    let len = ctrl & 127;

    if (len === 126) {
      // len = (d[cursor++] << 8) + data[cursor++];
      len = data.readUInt16LE(cursor);
      cursor += 2;
    } else if (len === 127) {
      len = data.readBigUInt64LE(cursor);
      cursor += 8;
    }

    let mask = null;
    if (masked) {
      mask = data.slice(cursor, cursor + 4);
      cursor += 4;
    }

    const maskedData = data.slice(cursor, cursor + len);
    const decoded = Buffer.alloc(len);

    for(let i = 0; i < maskedData.length; i++) {
      decoded[i] = maskedData[i] ^ mask[i%4];
    }

    // text
    if (opcode === 1) {
      return decoded.toString("utf8");
    }

    return decoded;
  }

  encodeFrame(message) {
    const messageBuf = Buffer.from(message, "utf8");

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

    headerBuf.writeUInt8(0x81, cursor++);

    if (is64) {
      headerBuf.writeUInt8(127, cursor++);
      headerBuf.writeBigUInt64LE(BigInt(messageLen), cursor);
    } else if(is16) {
      headerBuf.writeUInt8(126, cursor++);
      headerBuf.writeUInt16LE(messageLen, cursor);
    } else {
      headerBuf.writeUInt8(messageLen, cursor);
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
