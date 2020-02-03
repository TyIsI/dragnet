const { exec } = require("child_process");
const fs = require("fs");

async function createTestCerts() {
  return new Promise((resolve) => {
    exec("openssl req -x509 -newkey rsa:2048 -nodes -sha256 -subj '/CN=localhost' -keyout test-key.pem -out test-cert.pem", () => {
      const cert = fs.readFileSync("./test-cert.pem");
      const key = fs.readFileSync("./test-key.pem");

      fs.unlinkSync("./test-cert.pem");
      fs.unlinkSync("./test-key.pem");
  
      resolve({
        cert: cert,
        key: key
      });
    });
  });
}

module.exports = createTestCerts;
