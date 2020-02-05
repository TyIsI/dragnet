const http2 = require("http2");
const fs = require("fs");
const version = require("./version.js");

const {
  HTTP2_HEADER_METHOD,
  HTTP2_HEADER_PATH,
  HTTP2_HEADER_STATUS,
  HTTP2_HEADER_CONTENT_TYPE
} = http2.constants;

const unquote = v => v.startsWith("'") ? v.slice(1, -1) : v;

class DragnetServer {
  constructor(options = {}) {
    const cert = options.cert || (options.certfile ? fs.readFileSync(options.certfile) : null);
    
    if (!cert) {
      throw new Error("public certificate pem required");
    }
    
    const key = options.key || (options.keyfile ? fs.readFileSync(options.keyfile) : null);
    
    if (!key) {
      throw new Error("certificate private key pem required");
    }
    
    this.version = version();
    
    this.defaultHeaders = {
      server: `dragnet/${this.version}`
    };
    
    this.server = http2.createSecureServer({
      cert: cert,
      key: key
    });
    
    this.server.on("error", this.handleError.bind(this));
    this.server.on("stream", this.handleStream.bind(this));
    this.server.on("unknownProtocol", this.handleUnknownProtocol.bind(this));

    this.middlewares = [];
  }
  
  handleError(err) {
    console.error(err);
  }

  handleUnknownProtocol(socket) {
    socket.once("data", data => {
      const msg = data.toString("utf8");
      if (!msg.endsWith("\r\n\r\n")) {
        return;
      }

      const lines = msg.split("\r\n").filter(v => v);

      if (lines.length < 4) {
        return;
      }

      const parts = lines[0].split(" ");
      const method = parts[0];
      const path = parts[1];
      const protocol = parts[2];

      const headers = lines.slice(1).map(header => header.split(": "))
        .reduce((h, kv) => ({
          ...h,
          [unquote(kv[0]).toLowerCase()]: unquote(kv[1])
        }), {});

      const isUpgrade = headers.connection && headers.connection.toLowerCase() === "upgrade";

      if (!isUpgrade) {
        return;
      }

      if (!headers.upgrade) {
        return;
      }

      const request = {
        method: method,
        path: path,
        protocol: protocol,
        headers: headers
      };

      let handled = false;
      for (let middleware of this.middlewares) {
        if (handled) break;

        if (middleware.protocol) {
          handled = middleware.protocol(request, socket);
        }
      }
    });
  }
  
  use(middleware) {
    this.middlewares.push(middleware);
  }
  
  handleStream(stream, headers, flags) {
    const defaultHeaders = this.defaultHeaders;
    
    const synthStream = {
      $stream: stream,
      respond: (headers, ...args) => stream.respond({
          ...defaultHeaders,
          ...headers
        }, ...args),
      end: (...args) => stream.end(...args),
      respondWithFile: (path, headers = {}, options) => stream.respondWithFile(path, {
        ...defaultHeaders,
        ...headers
      }, options)
    };
    
    let handled = false;
    for (let middleware of this.middlewares) {
      if (handled) break;

      if (middleware.stream) {
        handled = middleware.stream(synthStream, headers, flags);
      }
    }
    
    if (handled) {
      return;
    }
    
    synthStream.respond({
      [HTTP2_HEADER_CONTENT_TYPE]: "text/plain",
      [HTTP2_HEADER_STATUS]: 404
    });
    
    synthStream.end("Not Found");  
  }
  
  async listen(port = 443) {
    const server = this.server;
    
    return new Promise((resolve, reject) => {
      server.listen(port, err => {
        if (err) {
          reject(err);
        }
        
        resolve();
      });
    });
  }
  
  async close() {
    const server = this.server;
    
    return new Promise((resolve) => {
      server.close(resolve);
    });
  }
}

module.exports = DragnetServer;
