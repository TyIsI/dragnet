const fs = require("fs");
const assert = require("assert");

function getTests() {
  if (process.argv.length > 2) {
    return process.argv.slice(2);
  }

  const files = fs.readdirSync(".");

  return files.filter(file => file.endsWith(".test.js"));
}

const tests = getTests();

(async function test() {
  let pass = true;

  for (const test of tests) {
    const suites = {};
    
    global.describe = (description, suite) => {
      suites[description] = {
        suite: async () => {
          global.it = (should, assertion) => {
            suites[description].asserts[should] = assertion;
          };
      
          return suite();
        },
        asserts: {}
      };
    };
    
    require(`./${test}`);
    
    for(const description of Object.keys(suites)) {
      console.log(description);
      const suite = suites[description];

      await assert.doesNotReject(suite.suite);

      for(const should of Object.keys(suite.asserts)) {
        
        let error = null;
        try {
          await suite.asserts[should]();
        } catch(e) {
          error = e;
        }
        
        const symbol = error ? "✗" : "✓";
        
        console.log(`\t${symbol} it ${should}`);
        if (error) {
          pass = false;
          console.error(`\t\t`, error);
        }
      }
    }
  }
  
  process.exit(pass ? 0 : 1);
})();
