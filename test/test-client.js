const http2 = require("http2");


async function request({ ca, url, path } = {}) {
  if (!ca) {
    throw new Error("ca required");
  }
  
  if (!url) {
    throw new Error("url required");
  }
  
  return new Promise((resolve, reject) => {
    const client = http2.connect(url, { ca: ca });
    
    let failed = false;
    
    client.on("error", (err) => {
      failed = true;
      client.close();
      reject(err);
    });
    
    const req = {
      path: path
    };
    
    const res = {
      headers: {},
      body: ""
    };
    
    const request = client.request({
      ":path": path
    });
    
    request.on("response", (headers, flags) => {
      res.headers = headers;
      res.flags = flags;
    });
    
    request.setEncoding("utf8");
    
    request.on("data", chunk => res.body += chunk);
    
    request.on("end", () => {
      client.close();
      if (!failed) {
        resolve([req, res]);
      }
    });
    
    request.end();
  });
}

module.exports = request;
