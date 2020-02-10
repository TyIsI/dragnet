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

  server.listen(8443);
})();

