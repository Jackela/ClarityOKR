const path = require('path');
const { runCLI } = require('jest');

const projectRoot = path.resolve(__dirname);
const jestConfig = path.join(projectRoot, 'jest.config.cjs');

console.log('Project root:', projectRoot);
console.log('Jest config:', jestConfig);

runCLI(
  {
    config: jestConfig,
    listTests: true,
    verbose: false,
    passWithNoTests: true,
  },
  [projectRoot],
)
  .then((result) => {
    if (result.results && result.results.testResults) {
      console.log('\nFound tests:');
      result.results.testResults.forEach((test, i) => {
        console.log('  ' + (i + 1) + '. ' + (test.testFilePath || test));
      });
      console.log('\nTotal: ' + result.results.testResults.length + ' test files');
    } else {
      console.log('No tests found or unexpected result format');
      console.log('Result:', JSON.stringify(result, null, 2).substring(0, 1000));
    }
    process.exit(0);
  })
  .catch((err) => {
    console.error('Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
