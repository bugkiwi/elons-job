const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('manifest stays within the MVP permission boundary and references shipped entrypoints', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['storage']);
  assert.ok(manifest.host_permissions.includes('https://x.com/*'));
  assert.ok(manifest.host_permissions.includes('https://api.typesafe.ai/*'));
  for (const forbidden of ['tabs', 'history', 'cookies', 'webRequest', '<all_urls>']) {
    assert.equal(JSON.stringify(manifest).includes(forbidden), false, `forbidden permission ${forbidden}`);
  }
  const referenced = [manifest.background.service_worker, manifest.action.default_popup, manifest.options_page, ...manifest.content_scripts[0].js, ...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon)];
  for (const file of referenced) assert.equal(fs.existsSync(path.join(root, file)), true, file);
  for (const resource of manifest.web_accessible_resources.flatMap((entry) => entry.resources)) assert.equal(fs.existsSync(path.join(root, resource)), true, resource);
});

test('extension pages do not load remote scripts or remote fonts', () => {
  for (const file of ['src/popup.html', 'src/settings.html', 'src/onboarding.html']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.equal(/<(script|link)[^>]+https?:\/\//i.test(source), false, file);
  }
});

test('content script does not read storage secrets or call TypeSafe directly', () => {
  const source = fs.readFileSync(path.join(root, 'src/content.js'), 'utf8');
  assert.equal(source.includes('chrome.storage'), false);
  assert.equal(source.includes('typesafeApiKey'), false);
  assert.equal(source.includes('fetch('), false);
});

test('service worker resolves its shared dependency relative to src/', () => {
  const source = fs.readFileSync(path.join(root, 'src/background.js'), 'utf8');
  assert.match(source, /importScripts\(['"]shared\/core\.js['"]\)/);
  assert.equal(source.includes("importScripts('src/shared/core.js')"), false);
});

test('X-injected CSS is scoped to extension placeholder classes', () => {
  const css = fs.readFileSync(path.join(root, 'src/styles/content.css'), 'utf8');
  assert.equal(/(^|[,{\s])(?:html|body|\*)\s*[{,]/m.test(css), false);
  assert.match(css, /\.elon-work-placeholder/);
  assert.match(css, /\.elon-work-check-host/);
  assert.match(css, /\.elon-work-monitor/);
});

test('content inspection sends username and supports force recheck controls', () => {
  const source = fs.readFileSync(path.join(root, 'src/content.js'), 'utf8');
  assert.match(source, /E\.composeComment\(comment\)/);
  assert.match(source, /force: Boolean\(opts\.force\)/);
  assert.match(source, /E\.MESSAGE\.OPEN_SETTINGS/);
});

test('popup puts first-time API setup before telemetry and uses the TypeSafe key prefix', () => {
  const popup = fs.readFileSync(path.join(root, 'src/popup.html'), 'utf8');
  assert.ok(popup.indexOf('id="connectPanel"') < popup.indexOf('id="statusTitle"'));
  assert.match(popup, /placeholder="apikey_…"/);
  assert.match(fs.readFileSync(path.join(root, 'src/onboarding.html'), 'utf8'), /placeholder="apikey_…"/);
});

test('popup status metrics stay compact and horizontal on the narrow popup viewport', () => {
  const popup = fs.readFileSync(path.join(root, 'src/popup.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'src/styles/app.css'), 'utf8');
  assert.match(popup, /class="ew-card ew-card-pad ew-popup-status"/);
  assert.equal(css.includes('body.ew-popup .ew-popup-status .ew-grid-3 { grid-template-columns: repeat(3'), true);
});
