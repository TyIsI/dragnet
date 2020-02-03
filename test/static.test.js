const assert = require("assert");
const createTestCerts = require("./test-certs.js");
const request = require("./test-client.js");


const dragnet = require("../index.js");
const Static = require("../static.js");

describe("static", () => {
  it("should serve static files", async () => {
    const certs = await createTestCerts();
    
    const server = dragnet(certs);
    
    server.use(new Static("."));
    
    await server.listen(8443);
    
    const [req, res] = await request({
      ca: certs.cert,
      url: "https://localhost:8443",
      path: "/static.test.html"
    });
    
    assert.deepStrictEqual(res.headers["content-type"], "text/html");
    assert.deepStrictEqual(res.body, "<h1>hello world</h1>\n");
  });
});
