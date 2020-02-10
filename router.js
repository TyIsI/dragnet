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

class Proxy {
  constructor(destination, options) {
    this.destination = destination;
    this.options = options;
  }

  resolve(headers, matches) {
    let url = this.destination;
    let requestHeaders = headers;
    if (typeof this.destination === "function") {
      const dest = this.destination(headers, matches);

      if (typeof dest === "string") {
        url = dest;
      } else {
        url = dest.url;
        requestHeaders = dest.headers;
      }
    }

    return {
      url: url,
      headers: requestHeaders
    };
  }

  upgrade(request, socket, matches) {
    const {
      url,
      headers: requestHeaders
    } = this.resolve(request.headers, matches);


    let client = https;

    if (url.startsWith("http://") || url.startsWith("ws://")) {
      client = http;
    }

    const req = client.request(url, {
      method: request.method,
      headers: {
        ...requestHeaders
      },
      ...this.options
    });

    req.on("response", res => {

      let response = `HTTP${res.httpVersion} ${res.statusCode} ${res.statusMessage}\r\n`;

      response += Object.keys(res.headers).reduce((headers, name) => headers + `${name}: ${res.headers[name]}\r\n`, "");

      response += "\r\n";

      socket.write(response, "utf8");

      response.socket.pipe(socket);
    });

    req.on("upgrade", (res, $socket, upgradeHead) => {
      let response = `HTTP${res.httpVersion} ${res.statusCode} ${res.statusMessage}\r\n`;

      response += Object.keys(res.headers).reduce((headers, name) => headers + `${name}: ${res.headers[name]}\r\n`, "");

      response += "\r\n";

      socket.write(response);
      socket.pipe($socket);
      $socket.pipe(socket);
    });

    req.on("error", err => {
      const resp = "HTTP/1.1 502 Bad Gateway\r\n" +
        "Connection: close\r\n" +
        "\r\n";

      socket.end(resp, "utf8");
    });

    req.end();
  }

  stream(stream, headers, flags, matches) {
    const {
      url,
      headers: requestHeaders
    } = this.resolve(headers, matches);

    const client = http2.connect(url, this.options);

    client.on("error", err => {
      stream.respond({
        [HTTP2_HEADER_CONTENT_TYPE]: "text/plain",
        [HTTP2_HEADER_STATUS]: 502
      }, { endStream: true });
      client.close();
    });

    const request = client.request(requestHeaders);

    request.on("response", (resHeaders, resFlags) => {
      stream.respond(resHeaders);
    });

    request.pipe(stream.$stream);

    request.on("end", () => {
      client.close();
    });
  }
}

class Router {
  constructor() {
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
      proxy.handler.upgrade(request, socket, proxy.matches);

      return true;
    }

    const protocol = this.protocols.match(request.path);

    if (protocol) {
      protocol.handler.upgrade(request, socket, protocol.matches);

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
      proxy.handler.stream(stream, headers, flags, proxy.matches);

      return true;
    }
    
    if (!this.routes[method]) {
      return false;
    }

    const match = this.routes[method].match(path);

    if (!match) {
      return false;
    }

    match.handler(stream, headers, flags, match.matches);

    return true;
  }

  proxy(path, destination, options) {
    this.proxies.add(path, new Proxy(destination, options));
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
