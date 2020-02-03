const http2 = require("http2");
const {
  HTTP2_HEADER_METHOD,
  HTTP2_HEADER_PATH
} = http2.constants;

class Router {
  constructor() {
    this.routes = {};
  }
  
  use(method, path, handler) {
    if (!this.routes[method]) {
      this.routes[method] = {};
    }
    
    this.routes[method][path] = handler;
  }
  
  handle(stream, headers, flags) {
    if (!this.routes || !headers || !headers[HTTP2_HEADER_METHOD] || !headers[HTTP2_HEADER_PATH]) {
      return false;
    }
    
    const method = headers[HTTP2_HEADER_METHOD];
    const path = headers[HTTP2_HEADER_PATH];
    
    if (!this.routes[method]) {
      return false;
    }
    
    if (!this.routes[method][path]) {
      return false;
    }

    this.routes[method][path](stream, headers, flags);

    return true;
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
