const assert = require("assert");
const createTestCerts = require("./test-certs.js");
const DragnetServer = require("../dragnet.js");
const dragnet = require("../index.js");

describe("index.js", () => {
  it("should export creation function", () => {
    assert.ok(typeof dragnet === "function", "index.js does not export creation function");
  });
  
  it("should create instance of DragnetServer", async () => {
    const certs = await createTestCerts();

    const server = dragnet(certs);

    assert.ok(server instanceof DragnetServer, "dragnet() from index.js does not create DragnetServer instance");
  });
});
