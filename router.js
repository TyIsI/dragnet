const EventEmitter = require('events');
const http2 = require("http2");
const {
  HTTP2_HEADER_METHOD,
  HTTP2_HEADER_PATH,
  HTTP2_HEADER_STATUS,
  HTTP2_HEADER_CONTENT_TYPE
} = http2.constants;

const http = require("http");
const https = require("https");

class PathResolver {
  constructor() {
    this.patterns = {};
  }

  add(pattern, handler) {
    this.patterns[`^${pattern}$`] = handler;
  }

  match(value) {
    const expressions = Object.keys(this.patterns);

    if (expressions.length <= 0) {
      return false;
    }

    let match = null;

    for (const expression of expressions) {
      const matches = value.match(new RegExp(expression));

      if (matches) {
        match = {
          expression: expression,
          matches: matches
        };

        break;
      }
    }

    if (!match) {
      return false;
    }

    return {
      matches: match.matches,
      handler: this.patterns[match.expression]
    };
  }
}

class Proxy extends EventEmitter {
  constructor(destination, options = {}) {
    super();
    this.destination = destination;
    this.options = options;
  }

  resolve(headers, matches) {
    let url = this.destination;
    let requestHeaders = headers;
    let requestOptions = this.options;
    if (typeof this.destination === "function") {
      const dest = this.destination(headers, matches);

      if (typeof dest === "string") {
        url = dest;
      } else {
        url = dest.url;
        requestHeaders = dest.headers;
        requestOptions = dest.options || this.options;
      }
    } else {
      if (requestHeaders && requestHeaders.host) {
        const protocolIndex = url.indexOf("://") + 3;
        const hostEndIndex = url.indexOf("/", protocolIndex);
        requestHeaders = {
          ...requestHeaders,
          host: url.substring(protocolIndex, hostEndIndex)
        };
      }
    }

    return {
      url: url,
      headers: requestHeaders,
      options: requestOptions
    };
  }

  upgrade(request, socket, matches) {
    const {
      url,
      headers: requestHeaders,
      options
    } = this.resolve(request.headers, matches);

    let client = https;

    if (url.startsWith("http://") || url.startsWith("ws://")) {
      client = http;
    }

    let req = null;

    try {
      req = client.request(url, {
        method: request.method,
        headers: {
          ...requestHeaders
        },
        ...options
      });
    } catch(e) {
      this.emit("error", e, this);
      return;
    }

    req.on("response", res => {

      let response = `HTTP/${res.httpVersion} ${res.statusCode} ${res.statusMessage}\r\n`;

      response += Object.keys(res.headers).reduce((headers, name) => headers + `${name}: ${res.headers[name]}\r\n`, "");

      response += "\r\n";

      try {
        socket.write(response, "utf8");

        response.socket.pipe(socket);
      } catch(e) {
        this.emit("error", e, this);
      }
    });

    req.on("upgrade", (res, $socket, upgradeHead) => {
      let response = `HTTP/${res.httpVersion} ${res.statusCode} ${res.statusMessage}\r\n`;

      response += Object.keys(res.headers).reduce((headers, name) => headers + `${name}: ${res.headers[name]}\r\n`, "");

      response += "\r\n";

      try {
        socket.write(response, () => {
          try {
            socket.pipe($socket);
            $socket.pipe(socket);
          } catch (e) {
            this.emit("error", e, this);
          }
        });
      } catch(e) {
        this.emit("error", e, this);
      }
    });

    req.on("error", err => {
      const resp = "HTTP/1.1 502 Bad Gateway\r\n" +
        "Connection: close\r\n" +
        "\r\n";

      try {
        socket.end(resp, "utf8");
      } catch(e) {
        this.emit("error", e, err, this);
        return;
      }

      this.emit("error", err, this);
    });

    try {
      req.end();
    } catch(e) {
      this.emit("error", e, this);
    }
  }

  stream(stream, headers, flags, matches) {
    const {
      url,
      headers: requestHeaders,
      options
    } = this.resolve(headers, matches);

    let client = null;

    try {
      client = http2.connect(url, options);
    } catch(e) {
      this.emit("error", e, this);
      return;
    }

    client.on("error", err => {
      try {
        stream.respond({
          [HTTP2_HEADER_CONTENT_TYPE]: "text/plain",
          [HTTP2_HEADER_STATUS]: 502
        }, {endStream: true});
      } catch(e) {
        this.emit("error", e, err, this);
        return;
      } finally {
        client.close();
      }

      this.emit("error", err, this);
    });

    const request = client.request(requestHeaders);

    request.on("response", (resHeaders, resFlags) => {
      try {
        stream.respond(resHeaders);
      } catch(e) {
        this.emit("error", e);
      }
    });

    try {
      request.pipe(stream.$stream);
    } catch(e) {
      this.emit("error", e, this);
    }

    request.on("end", () => {
      client.close();
    });
  }
}

class Router extends EventEmitter {
  constructor(...hosts) {
    super();
    this.hosts = hosts; //TODO confine router matches to these hosts
    this.routes = {};
    this.proxies = new PathResolver();
    this.protocols = new PathResolver();
  }
  
  use(method, path, handler) {
    if (!this.routes[method]) {
      this.routes[method] = new PathResolver();
    }
    
    this.routes[method].add(path, handler);
  }

  protocol(request, socket) {
    const proxy = this.proxies.match(request.path);

    if (proxy) {
      try {
        proxy.handler.upgrade(request, socket, proxy.matches);
      } catch(e) {
        this.emit("error", e, this, proxy.handler);
      }

      return true;
    }

    const protocol = this.protocols.match(request.path);

    if (protocol) {
      try {
        protocol.handler.upgrade(request, socket, protocol.matches);
      } catch(e) {
        this.emit("error", e, this, protocol.handler);
      }

      return true;
    }

    return false;
  }

  upgrade(path, protocol) {
    this.protocols.add(path, protocol);
  }
  
  stream(stream, headers, flags) {
    if (!this.routes || !headers || !headers[HTTP2_HEADER_METHOD] || !headers[HTTP2_HEADER_PATH]) {
      return false;
    }
    
    const method = headers[HTTP2_HEADER_METHOD];
    const path = headers[HTTP2_HEADER_PATH];

    const proxy = this.proxies.match(path);

    if (proxy) {
      try {
        proxy.handler.stream(stream, headers, flags, proxy.matches);
      } catch(e) {
        this.emit("error", e, this, proxy.handler);
      }

      return true;
    }
    
    if (!this.routes[method]) {
      return false;
    }

    const match = this.routes[method].match(path);

    if (!match) {
      return false;
    }

    try {
      match.handler(stream, headers, flags, match.matches);
    } catch(e) {
      this.emit("error", e, this, match.handler);
    }

    return true;
  }

  proxy(path, destination, options) {
    const proxy = new Proxy(destination, options);
    proxy.on("error", this.proxyError.bind(this));
    this.proxies.add(path, proxy);
  }

  proxyError(err, proxy) {
    this.emit("error", err, this, proxy);
  }
}

const methods = [
  "GET",
  "PUT",
  "POST",
  "PATCH",
  "DELETE",
  "CONNECT",
  "HEAD",
  "OPTIONS",
  "TRACE"
];

methods.forEach(method => {
  Router.prototype[method.toLowerCase()] = function (path, handler) {
    this.use(method, path, handler);
  };
});

module.exports = Router;
