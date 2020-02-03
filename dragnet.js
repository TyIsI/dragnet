const http2 = require("http2");
const fs = require("fs");
const version = require("./version.js");

const {
  HTTP2_HEADER_METHOD,
  HTTP2_HEADER_PATH,
  HTTP2_HEADER_STATUS,
  HTTP2_HEADER_CONTENT_TYPE
} = http2.constants;

class DragnetServer {
  constructor(options = {}) {
    const cert = options.cert || (options.certfile ? fs.readFileSync(options.certfile) : null);
    
    if (!cert) {
      throw new Error("public certificate pem required");
    }
    
    const privkey = options.privkey || (options.privkeyfile ? fs.readFileSync(options.privkeyfile) : null);
    
    if (!privkey) {
      throw new Error("certificate private key pem required");
    }
    
    this.version = version();
    
    this.defaultHeaders = {
      server: `dragnet/${this.version}`
    };
    
    this.server = http2.createSecureServer({
      cert: cert,
      key: privkey
    });
    
    this.server.on("error", this.handleError.bind(this));
    this.server.on("stream", this.handleStream.bind(this));
    
    this.middlewares = [];
  }
  
  handleError(err) {
    console.error(err);
  }
  
  use(middleware) {
    this.middlewares.push(middleware);
  }
  
  handleStream(stream, headers, flags) {
    const defaultHeaders = this.defaultHeaders;
    
    const synthStream = {
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

      handled = middleware.handle(synthStream, headers, flags);
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
