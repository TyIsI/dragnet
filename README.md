# dragnet
HTTP2 stream server

# install

`npm install dragnet`

# example

generate localhost certificate:
`openssl req -x509 -newkey rsa:2048 -nodes -sha256 -subj '/CN=localhost' -keyout localhost-key.pem -out localhost-cert.pem`

server.js
```$xslt
const fs = require("fs");
const {
  HTTP2_HEADER_CONTENT_TYPE,
  HTTP2_HEADER_STATUS
} = require("http2").constants;
const dragnet = require("dragnet");
const Router = require("dragnet/router");

const server = dragnet({
  cert: fs.readFileSync("localhost-cert.pem"),
  key: fs.readFileSync("localhost-key.pem")
});

const router = new Router();

router.get("/(.*)", (stream, headers, flags, matches) => {
  stream.respond({
    [HTTP2_HEADER_CONTENT_TYPE]: "text/plain",
    [HTTP2_HEADER_STATUS]: 200
  });

  stream.end(`path part: ${matches[1]}`);
});

server.use(router);

server.listen(8443);
```

# http2 upstream proxy example

generate localhost certificate:
`openssl req -x509 -newkey rsa:2048 -nodes -sha256 -subj '/CN=localhost' -keyout localhost-key.pem -out localhost-cert.pem`

server1.js
```$xslt
const fs = require("fs");
const {
  HTTP2_HEADER_PATH
} = require("http2").constants;
const dragnet = require("dragnet");
const Router = require("dragnet/router");

const server = dragnet({
  cert: fs.readFileSync("localhost-cert.pem"),
  key: fs.readFileSync("localhost-key.pem")
});

const router = new Router();

const urlResolver = (headers, matches) => {
  return {
    url: "https://localhost:8444",
    headers: {
      ...headers,
      [HTTP2_HEADER_PATH]: `/${matches[1]}`
    }
  };
};

// ClientHttp2Session.request options
const options = { ca: cert };

router.proxy(
  "/proxy/(.*)",
  urlResolver,
  options
);

server.use(router);

server.listen(8443);
```

server2.js
```$xslt
const fs = require("fs");
const {
  HTTP2_HEADER_CONTENT_TYPE,
  HTTP2_HEADER_STATUS
} = require("http2").constants;
const dragnet = require("dragnet");
const Router = require("dragnet/router");

const server = dragnet({
  cert: fs.readFileSync("localhost-cert.pem"),
  key: fs.readFileSync("localhost-key.pem")
});

const router = new Router();

router.get("/(.*)", (stream, headers, flags, matches) => {
  stream.respond({
    [HTTP2_HEADER_CONTENT_TYPE]: "text/plain",
    [HTTP2_HEADER_STATUS]: 200
  });

  stream.end(`path part: ${matches[1]}`);
});

server.use(router);

server.listen(8444);
```
