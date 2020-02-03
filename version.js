const path = require("path");
const fs = require("fs");

function version() {
  const pkg = JSON.parse(fs.readFileSync(`${path.dirname(module.filename)}/package.json`));
  
  return pkg.version;
}

module.exports = version;
