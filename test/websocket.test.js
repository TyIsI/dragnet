const {
  HTTP2_HEADER_CONTENT_TYPE,
  HTTP2_HEADER_STATUS
} = require("http2").constants;

const dragnet = require("../index.js");
const Router = require("../router.js");
const Websocket = require("../protocols/websocket");
const createTestCerts = require("./test-certs.js");

(async () => {
  const certs = await createTestCerts();

  const server = dragnet({
    ...certs,
    settings: {
      enableConnectProtocol: true
    }
  });

  const router = new Router();

  router.get("/", stream => {
    stream.respondWithFile("./websocket.test.html", {
      [HTTP2_HEADER_CONTENT_TYPE]: "text/html",
      [HTTP2_HEADER_STATUS]: 200
    });
  });

  const websocket = new Websocket();

  websocket.on("session", session => {
    session.on("text", message => {
      console.log(message);

      session.text(`reply: ${message}`);
    });
  });

  router.upgrade("/ws", websocket);

  server.use(router);

  /*
  server.server.on("unknownProtocol", (socket) => {
    socket.once("data", data => {
      const msg = data.toString("utf8");
      if (!msg.endsWith("\r\n\r\n")) {
        return;
      }

      const lines = msg.split("\r\n").filter(v => v);

      if (lines.length < 4) {
        return;
      }

      const request = lines[0];

      const unquote = v => v.startsWith("'") ? v.slice(1, -1) : v;

      const headers = lines.slice(1).map(header => header.split(": "))
        .reduce((h, kv) => ({
          ...h,
          [unquote(kv[0]).toLowerCase()]: unquote(kv[1])
        }), {});

      const isUpgrade = headers.connection && headers.connection.toLowerCase() === "upgrade";

      if (!isUpgrade) {
        return;
      }

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

      console.log(responseHeaders);

      socket.write(responseHeaders, "utf8", () => {
        console.log("upgraded: create websocket handler");
        socket.on("data", d => {
          let cursor = 0;
          let ctrl = d[cursor++];

          const fin = Boolean(ctrl & 128);
          const rsv1 = Boolean(ctrl & 64);
          const rsv2 = Boolean(ctrl & 32);
          const rsv3 = Boolean(ctrl & 16);
          const opcode = ctrl & 15;

          ctrl = d[cursor++];
          const masked = Boolean(ctrl & 128);
          let len = ctrl & 127;

          if (len === 126) {
            len = (d[cursor++] << 8) + d[cursor++];
          } else if (len === 127) {
            len =
              d[cursor++] << 56 +
              d[cursor++] << 48 +
              d[cursor++] << 40 +
              d[cursor++] << 32 +
              d[cursor++] << 24 +
              d[cursor++] << 16 +
              d[cursor++] << 8 +
              d[cursor++];
          }

          let mask = null;
          if (masked) {
            mask = d.slice(cursor, cursor + 4);
            cursor += 4;
          }

          const maskedData = d.slice(cursor, cursor + len);
          const decoded = Buffer.alloc(len);

          for(let i = 0; i < maskedData.length; i++) {
            decoded[i] = maskedData[i] ^ mask[i%4];
          }

          console.log(decoded.toString("utf8"));
        });
      });

      console.log("data", request, headers);

      const message = "hello worlds";



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
        headerBuf.writeUInt16LE(messageLen, cursor);
        cursor += 2;
      } else if(is16) {
        headerBuf.writeUInt8(126, cursor++);
        headerBuf.writeBigUInt64LE(BigInt(messageLen), cursor);
        cursor += 8;
      } else {
        headerBuf.writeUInt8(messageLen, cursor++);
      }

      const sendBuf = Buffer.concat([headerBuf, messageBuf]);

      console.log(sendBuf.toString("hex"));

      socket.write(sendBuf);
    });
  });
*/


  server.listen(8443);
})();

