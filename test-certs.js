const { exec } = require("child_process");
const fs = require("fs");

async function createTestCerts() {
  return new Promise((resolve) => {
    exec("openssl req -x509 -newkey rsa:2048 -nodes -sha256 -subj '/CN=localhost' -keyout test-privkey.pem -out test-cert.pem", () => {
      const cert = fs.readFileSync("./test-cert.pem");
      const privkey = fs.readFileSync("./test-privkey.pem");

      fs.unlinkSync("./test-cert.pem");
      fs.unlinkSync("./test-privkey.pem");
  
      resolve({
        cert: cert,
        privkey: privkey
      });
    });
  });
}

module.exports = createTestCerts;
