const assert = require("assert");
const createTestCerts = require("./test-certs.js");
const request = require("./test-client.js");

const http2 = require("http2");
const {
  HTTP2_HEADER_STATUS,
  HTTP2_HEADER_CONTENT_TYPE,
  HTTP2_HEADER_PATH
} = http2.constants;


const version = require("./version.js");

const dragnet = require("./index.js");
const Router = require("./router.js");

describe("router.js[proxy]", async () => {
  const certs = await createTestCerts();

  const server1 = dragnet(certs);
  const server2 = dragnet(certs);

  const router1 = new Router();
  const router2 = new Router();

  server1.use(router1);
  server2.use(router2);

  router1.proxy("/", "https://localhost:8444/", { ca: certs.cert });
  router1.proxy("/server2", (headers, matches) => {
    return {
      url: "https://localhost:8444/",
      headers: {
        ...headers,
        [HTTP2_HEADER_PATH]: "/rewritten"
      }
    }
  }, { ca: certs.cert });
  router1.proxy("/server2/(.*)/(.*)", (headers, matches) => {
    return {
      url: `https://localhost:${matches[1]}/`,
      headers: {
        ...headers,
        [HTTP2_HEADER_PATH]: `/${matches[2]}`
      }
    }
  }, { ca: certs.cert });

  router2.get("/", (stream) => {
    stream.respond({
      [HTTP2_HEADER_CONTENT_TYPE]: "text/plain",
      [HTTP2_HEADER_STATUS]: 200
    });

    stream.end("straight proxy");
  });

  router2.get("/rewritten", (stream) => {
    stream.respond({
      [HTTP2_HEADER_CONTENT_TYPE]: "text/plain",
      [HTTP2_HEADER_STATUS]: 200
    });

    stream.end("rewritten path");
  });

  router2.get("/regex", (stream) => {
    stream.respond({
      [HTTP2_HEADER_CONTENT_TYPE]: "text/plain",
      [HTTP2_HEADER_STATUS]: 200
    });

    stream.end("regex resolved");
  });

  await server1.listen(8443);
  await server2.listen(8444);

  it("should handle straight proxy requests to server2", async () => {
    const [req, res] = await request({
      ca: certs.cert,
      url: "https://localhost:8443",
      path: "/"
    });

    assert.deepStrictEqual(res.headers.server, `dragnet/${version()}`);
    assert.deepStrictEqual(res.body, "straight proxy");
  });

  it("should handle rewritten proxy requests to server2", async () => {
    const [req, res] = await request({
      ca: certs.cert,
      url: "https://localhost:8443",
      path: "/server2"
    });

    assert.deepStrictEqual(res.headers.server, `dragnet/${version()}`);
    assert.deepStrictEqual(res.body, "rewritten path");
  });

  it('should receive regex matches in destination resolver', async () => {
    const [req, res] = await request({
      ca: certs.cert,
      url: "https://localhost:8443",
      path: "/server2/8444/regex"
    });

    assert.deepStrictEqual(res.headers.server, `dragnet/${version()}`);
    assert.deepStrictEqual(res.body, "regex resolved");
  });

  it("should shutdown cleanly", async () => {
    await server1.close();
    await server2.close();

    assert.ok(true);
  });
});
