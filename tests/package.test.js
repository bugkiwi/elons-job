const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('manual extension build is documented and targets an unpacked dist directory', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const script = fs.readFileSync(path.join(root, 'scripts/package.mjs'), 'utf8');
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.equal(packageJson.scripts.package, 'node scripts/package.mjs');
  assert.match(script, /Packaged extension in/);
  assert.match(readme, /npm run package/);
  assert.match(readme, /chrome:\/\/extensions/);
  assert.match(readme, /`dist\/`/);
});
