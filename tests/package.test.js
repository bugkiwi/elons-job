const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('CRX packaging command is documented and keeps signing keys external', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const script = fs.readFileSync(path.join(root, 'scripts/package-crx.mjs'), 'utf8');
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.equal(packageJson.scripts['package:crx'], 'node scripts/package-crx.mjs');
  assert.match(script, /CRX3 Signed Data/);
  assert.match(script, /CRX_PRIVATE_KEY/);
  assert.match(readme, /bun run package:crx/);
  assert.match(gitignore, /dist\/\*\.crx/);
});
