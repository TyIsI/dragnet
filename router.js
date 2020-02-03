const http2 = require("http2");
const {
  HTTP2_HEADER_METHOD,
  HTTP2_HEADER_PATH,
  HTTP2_HEADER_STATUS,
  HTTP2_HEADER_CONTENT_TYPE
} = http2.constants;

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

function createProxyHandler(destination, options) {
  return function proxyHandler(stream, headers, flags, matches) {
    let url = destination;
    let requestHeaders = headers;
    if (typeof destination === "function") {
      const dest = destination(headers, matches);

      if (typeof dest === "string") {
        url = dest;
      } else {
        url = dest.url;
        requestHeaders = dest.headers;
      }
    }

    const client = http2.connect(url, options);

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
  };
}

class Router {
  constructor() {
    this.routes = {};
    this.proxies = new PathResolver();
  }
  
  use(method, path, handler) {
    if (!this.routes[method]) {
      this.routes[method] = new PathResolver();
    }
    
    this.routes[method].add(path, handler);
  }
  
  handle(stream, headers, flags) {
    if (!this.routes || !headers || !headers[HTTP2_HEADER_METHOD] || !headers[HTTP2_HEADER_PATH]) {
      return false;
    }
    
    const method = headers[HTTP2_HEADER_METHOD];
    const path = headers[HTTP2_HEADER_PATH];

    const proxy = this.proxies.match(path);

    if (proxy) {
      proxy.handler(stream, headers, flags, proxy.matches);

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
    this.proxies.add(path, createProxyHandler(destination, options));
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
