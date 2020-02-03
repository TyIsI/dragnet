const assert = require("assert");
const createTestCerts = require("./test-certs.js");
const request = require("./test-client.js");

const http2 = require("http2");
const {
  HTTP2_HEADER_STATUS,
  HTTP2_HEADER_CONTENT_TYPE
} = http2.constants;


const version = require("./version.js");

const DragnetServer = require("./dragnet.js");
const Router = require("./router.js");

describe("dragnet.js", async () => {
  const certs = await createTestCerts();
    
  const server = new DragnetServer(certs);
    
  it("should create listener", async () => {
    await server.listen(8443);
    
    assert.ok(true);
  });
  
  it("should have server version header", async () => {
    const [req, res] = await request({
      ca: certs.cert,
      url: "https://localhost:8443",
      path: "/"
    });
    
    assert.deepStrictEqual(res.headers.server, `dragnet/${version()}`);
  });
  
  it("should receive response", async () => {
    const router = new Router();
    router.get("/", (stream) => {
      stream.respond({
        [HTTP2_HEADER_CONTENT_TYPE]: "text/plain",
        [HTTP2_HEADER_STATUS]: 200
      });

      stream.end("hello world");
    });
    
    server.use(router);
    
    const [req, res] = await request({
      ca: certs.cert,
      url: "https://localhost:8443",
      path: "/"
    });

    assert.deepStrictEqual(res.headers.server, `dragnet/${version()}`);
    assert.deepStrictEqual(res.body, "hello world");
  });
  
  it("should shutdown cleanly", async () => {
    await server.close();
    
    assert.ok(true);
  });
});
