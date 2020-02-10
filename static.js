const fs = require("fs");
const $path = require("path");
const http2 = require("http2");
const {
  HTTP2_HEADER_METHOD,
  HTTP2_HEADER_PATH,
  HTTP2_HEADER_STATUS,
  HTTP2_HEADER_CONTENT_TYPE
} = http2.constants;

const WellKnownContentTypes = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".html": "text/html",
  ".htm": "text/html",
  ".css": "text/css",
  ".apng": "image/apng",
  ".png": "image/png",
  ".bmp": "image/bmp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".cur": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".jfif": "image/jpeg",
  ".pjpeg": "image/jpeg",
  ".pjp": "image/jpeg",
  ".svg": "image/svg+xml",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".webp": "image/webp"
};

function contentType(file) {
  const extn = file.substring(file.lastIndexOf("."));
  
  const known = WellKnownContentTypes[extn];
  
  if (known) {
    return known;
  }
  
  return "text/plain";
}

class Static {
  constructor({ path = ".", base, index = "index.html" } = {}) {
    this.base = base;
    this.path = $path.resolve(path);
    this.index = index;
    
    const stats = fs.statSync(this.path);
    
    if (!stats.isDirectory()) {
      throw new Error("static path must be a directory");
    }
  }
  
  stream(stream, headers, flags) {
    if (!headers || !headers[HTTP2_HEADER_METHOD] || !headers[HTTP2_HEADER_PATH]) {
      return false;
    }
    
    const method = headers[HTTP2_HEADER_METHOD];
    if (method !== "OPTIONS" && method !== "HEAD" && method !== "GET") {
      return false;
    }
    
    let path = headers[HTTP2_HEADER_PATH];

    if (this.base && !path.startsWith(this.base)) {
      return false;
    }

    if (this.index && path.endsWith("/")) {
      path += this.index;
    }

    path = $path.normalize(`/${path}`);
    
    const file = $path.resolve(this.path, `./${path}`);
    
    try {
      const stat = fs.statSync(file);
      if (!stat.isFile()) {
        throw new Error("Resource must be a file");
      }
    } catch(e) {
      stream.respond({
        [HTTP2_HEADER_CONTENT_TYPE]: "text/plain",
        [HTTP2_HEADER_STATUS]: 404
      });
      stream.end("Not Found");
      return true;
    }
    
    return this[method.toLowerCase()](stream, headers, flags, file);
  }
  
  options(stream, headers, flags) {
    stream.respond({
      accept: "OPTIONS, HEAD, GET",
      [HTTP2_HEADER_STATUS]: 200
    }, {
      endStream: true
    });
    
    return true;
  }
  
  head(stream, headers, flags, file) {
    stream.respond({
      [HTTP2_HEADER_CONTENT_TYPE]: contentType(file),
      [HTTP2_HEADER_STATUS]: 200
    }, {
      endStream: true
    });
    
    return true;
  }
  
  get(stream, headers, flags, file) {
    stream.respondWithFile(
      file,
      {
        [HTTP2_HEADER_CONTENT_TYPE]: contentType(file),
        [HTTP2_HEADER_STATUS]: 200
      });
      
    return true;
  }
}

module.exports = Static;
