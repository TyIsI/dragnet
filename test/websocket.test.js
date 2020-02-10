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

  const server2 = dragnet(certs);

  const router = new Router();
  const router2 = new Router();

  router.get("/", stream => {
    stream.respondWithFile("./websocket.test.html", {
      [HTTP2_HEADER_CONTENT_TYPE]: "text/html",
      [HTTP2_HEADER_STATUS]: 200
    });
  });

  const websocket = new Websocket();
  const websocket2 = new Websocket();

  websocket.on("session", session => {
    session.on("text", message => {
      console.log(`server1: ${message}`);

      session.text(`server1: ${message}`);
    });
  });

  websocket2.on("session", session => {
    session.on("text", message => {
      console.log(`server2: ${message}`);

      session.text(`server2: ${message}`);
    });

    session.on("close", (me) => {
      console.log("goodbye " + me.id);
    });
  });

  router.upgrade("/ws", websocket);
  router2.upgrade("/", websocket2);

  router.proxy("/ws2", "https://localhost:8444/", { ca: certs.cert });

  server.use(router);
  server2.use(router2);

  server.listen(8443);
  server2.listen(8444);
})();
