const path = require("path");
const fs = require("fs");

function version() {
  const package = JSON.parse(fs.readFileSync(`${path.dirname(module.filename)}/package.json`));
  
  return package.version;
}

module.exports = version;
