const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/shared/core.js');

test('default configuration exposes three enabled builtin rules', () => {
  const config = E.createDefaultConfig();
  assert.equal(config.rules.length, 3);
  assert.deepEqual(config.rules.map((rule) => rule.id), ['sexual_content', 'sexual_solicitation', 'spam_behavior']);
  assert.ok(config.rules[0].enabled && config.rules[0].builtin && config.rules[0].threshold === 0.65);
  assert.ok(config.rules[1].enabled && config.rules[1].builtin && config.rules[1].threshold === 0.75);
  assert.equal(config.rules[2].threshold, 0.78);
  assert.equal(config.showCheckControls, true);
  assert.equal(config.dailyLimit, 100000);
  assert.equal(E.activeRules(config).length, 3);
});

test('migrates the legacy default daily limit to 100000', () => {
  const config = E.normalizeConfig({ rulesVersion: 2, dailyLimit: 2000 });
  assert.equal(config.rulesVersion, 3);
  assert.equal(config.dailyLimit, 100000);
  assert.equal(E.normalizeConfig({ rulesVersion: 3, dailyLimit: 2000 }).dailyLimit, 2000);
});

test('normalizeText removes zero-width characters and whitespace only while preserving signals', () => {
  const source = '  骚\u200b🖤❤️  1789699386154\nhttps://x.com/a  ';
  assert.equal(E.normalizeText(source), '骚🖤❤️ 1789699386154 https://x.com/a');
});

test('normalizeText removes the broader invisible-character table', () => {
  const dirty = '\u200d比\u2060\u2060\u200c\u2060\u2060我\u200d\u2060\u200c\u200c\u200d好\u200c\u200d\u200c\u2060\u200c\u200c的\u200c\u2060\u200c\u2060\u200d没\u200d\u200d\u2060\u200d\u200c我\u200c\u200d骚\u2060\u2060\u2060\u2060\u200c\u2060\u200d😟\u200c\u200c\u200c\u2060比\u200c\u200c\u2060\u200c\u2060\u200c\u200d我\u200d\u200d\u2060骚\u200d\u200d\u200d\u200c\u200c的\u200c\u2060\u200d\u200d没\u200c\u200c\u2060我\u200c\u200c\u200d\u200c好\u200c\u200c\u200d看\u200c\u200c\u2060\u200c🌀\u2060\u200c';
  assert.equal(E.normalizeText(dirty), '比我好的没我骚😟比我骚的没我好看🌀');
});

test('comment extraction and TypeSafe content include the display name and handle', () => {
  const article = {
    querySelector(selector) {
      if (selector.includes('/status/')) return { getAttribute: () => '/someone/status/123' };
      if (selector.includes('tweetText')) return { textContent: '恭喜发财，祝你有美好的一天' };
      if (selector.includes('User-Name')) return { textContent: '卫潼笑♥处男免费♥ @example' };
      return null;
    }
  };
  const comment = E.extractComment(article);
  assert.deepEqual(comment, { tweetId: '123', text: '恭喜发财，祝你有美好的一天', author: '卫潼笑♥处男免费♥ @example' });
  const composed = E.composeComment(comment);
  assert.match(composed, /\[用户名\] 卫潼笑♥处男免费♥ @example/);
  assert.match(composed, /\[评论正文\] 恭喜发财，祝你有美好的一天/);
  assert.match(composed, /username_emoji_count=2/);
  assert.match(composed, /body_emoji_count=0/);
});

test('buildQuestions compiles enabled rules into Jev noul questions', () => {
  const questions = E.buildQuestions(E.DEFAULT_RULES);
  assert.equal(questions.sexual_content.type, 'noul');
  assert.match(questions.sexual_content.instructions, /性暗示/);
  assert.match(questions.sexual_content.instructions, /用户名/);
  assert.match(questions.sexual_content.instructions, /emoji/);
  assert.match(questions.sexual_solicitation.instructions, /用户名/);
  assert.equal(questions.spam_behavior.type, 'noul');
  assert.match(questions.spam_behavior.instructions, /模板刷屏/);
  assert.equal(questions.sexual_content.criteria.false.length > 0, true);
});

test('config upgrades persisted builtin rules while preserving user threshold and enabled state', () => {
  const config = E.normalizeConfig({ rules: [{ ...E.DEFAULT_RULES[0], instructions: 'old prompt', threshold: 0.91, enabled: false }, { ...E.DEFAULT_RULES[1], threshold: 0.8 }] });
  assert.match(config.rules[0].instructions, /emoji/);
  assert.equal(config.rules[0].threshold, 0.91);
  assert.equal(config.rules[0].enabled, false);
  assert.equal(config.rules[1].threshold, 0.75);
});

test('decision uses pTrue/noul probabilities and local thresholds', () => {
  const rules = [
    { id: 'a', name: 'A', threshold: 0.8, enabled: true },
    { id: 'b', name: 'B', threshold: 0.8, enabled: true },
    { id: 'c', name: 'C', threshold: 0.8, enabled: true }
  ];
  const result = E.buildDecision({ answers: { a: { noul: 0.93 }, b: { pTrue: 0.79 }, c: { probabilities: { true: 0.81 } } } }, rules);
  assert.equal(result.shouldHide, true);
  assert.deepEqual(result.matches.map((item) => item.ruleId), ['a', 'c']);
  assert.equal(result.results.b, 0.79);
});

test('repeated emoji template forces the spam rule into the hide decision', () => {
  const spamRule = E.DEFAULT_RULES.find((rule) => rule.id === 'spam_behavior');
  const content = E.composeComment({ username: 'A @a', text: '恭喜发财🍭 Respectful，祝福你有美好的一天', templateCount: 3 });
  const result = E.buildDecision({ answers: { spam_behavior: { noul: 0.12 } } }, [spamRule], { content });
  assert.equal(result.localSignals.spam.matched, true);
  assert.equal(result.shouldHide, true);
  assert.equal(result.matches[0].ruleId, 'spam_behavior');
  assert.equal(result.matches[0].source, 'page-template-signal');
});

test('emoji substitutions share one page template fingerprint', () => {
  assert.equal(
    E.templateFingerprint('没人比我玩的开了吧🐼我福不黑不信你看🐵'),
    E.templateFingerprint('没人比我玩的开了吧🍂我福不黑不信你看⛺')
  );
});

test('emoji variation selectors do not split equivalent templates', () => {
  assert.equal(
    E.templateFingerprint('没人比我玩的开了吧🐼我福不黑不信你看🐵'),
    E.templateFingerprint('没人比我玩的开了吧🏙️🦐我福不黑不信你看')
  );
});

test('spam score alone does not hide a plain single comment', () => {
  const spamRule = E.DEFAULT_RULES.find((rule) => rule.id === 'spam_behavior');
  const result = E.buildDecision({ answers: { spam_behavior: { noul: 0.99 } } }, [spamRule], { content: '我发的不是普通内容，想看完整版就进群。' });
  assert.equal(result.shouldHide, false);
});

test('invisible-character pollution is a spam signal after the text is cleaned', () => {
  const spamRule = E.DEFAULT_RULES.find((rule) => rule.id === 'spam_behavior');
  const dirty = '\u200d比\u2060我\u200c骚😟\u2060比\u200d我骚🌀';
  const content = E.composeComment({ text: dirty });
  const result = E.buildDecision({ answers: { spam_behavior: { noul: 0.1 } } }, [spamRule], { content });
  assert.match(content, /invisible_char_count=5/);
  assert.match(content, /比我骚😟比我骚🌀/);
  assert.equal(result.localSignals.spam.matched, true);
  assert.equal(result.shouldHide, true);
});

test('emoji-obfuscated representative sexual phrase forces the sexual rule', () => {
  const sexualRule = E.DEFAULT_RULES.find((rule) => rule.id === 'sexual_content');
  const content = E.composeComment({ username: '有腿🔥 @a', text: '是💼这个出处吧🚀啊啊小马开🍀大车!', templateCount: 0 });
  const result = E.buildDecision({ answers: { sexual_content: { noul: 0.43 } } }, [sexualRule], { content });
  assert.equal(result.localSignals.sexualObfuscation.matched, true);
  assert.equal(result.shouldHide, true);
  assert.equal(result.matches[0].source, 'emoji-obfuscation-signal');
});

test('disabled rules never produce a match', () => {
  const result = E.buildDecision({ answers: { muted: { noul: 1 } } }, [{ id: 'muted', name: 'Muted', threshold: 0.5, enabled: false }]);
  assert.equal(result.shouldHide, false);
  assert.deepEqual(result.matches, []);
});

test('cache key changes with normalized content, rule instructions, or model but not threshold', async () => {
  const base = [{ id: 'rule', instructions: 'same', trueCriteria: 'yes', falseCriteria: 'no', threshold: 0.8, enabled: true }];
  const thresholdOnly = [{ ...base[0], threshold: 0.9 }];
  const instructionChange = [{ ...base[0], instructions: 'changed' }];
  assert.equal(await E.cacheKey(' hello ', base, 'jev-latest'), await E.cacheKey('hello', thresholdOnly, 'jev-latest'));
  assert.notEqual(await E.cacheKey('hello', base, 'jev-latest'), await E.cacheKey('hello', instructionChange, 'jev-latest'));
  assert.notEqual(await E.cacheKey('hello', base, 'jev-latest'), await E.cacheKey('hello', base, 'jev-next'));
});

test('X scope recognises only detail URLs and skips the root tweet', () => {
  const url = 'https://x.com/elonmusk/status/123456789?x=1';
  assert.equal(E.isTweetDetailUrl(url), true);
  assert.equal(E.rootTweetId(url), '123456789');
  assert.equal(E.isTweetDetailUrl('https://x.com/home'), false);
  const fakeArticle = { querySelector(selector) { return selector.includes('/status/') ? { getAttribute: () => '/someone/status/123456789' } : { textContent: 'root' }; } };
  assert.equal(E.isReplyArticle(fakeArticle, url), false);
});

test('storage config sanitises keys for UI and keeps keys out of normal config', async () => {
  const data = {};
  const area = {
    get(key, callback) { callback({ [key]: data[key] }); },
    set(value, callback) { Object.assign(data, value); callback(); },
    remove(key, callback) { delete data[key]; callback(); }
  };
  const fakeChrome = { storage: { local: area } };
  await E.saveConfig(fakeChrome, { typesafeApiKey: 'apikey_secret', enabled: false });
  const safe = await E.loadConfig(fakeChrome, false);
  const withSecret = await E.loadConfig(fakeChrome, true);
  assert.equal(safe.typesafeApiKey, undefined);
  assert.equal(withSecret.typesafeApiKey, 'apikey_secret');
  assert.equal(safe.enabled, false);
  assert.equal(E.maskSecret('apikey_secret'), 'apik•••••cret');
});

test('privacy-safe debug logging strips API keys and raw text', () => {
  const seen = [];
  const previous = global.console;
  global.console = { debug: (_event, payload) => seen.push(payload) };
  E.debugLog({ debug: true }, 'event', { apiKey: 'secret', content: 'private', contentHash: 'hash' });
  global.console = previous;
  assert.deepEqual(seen, [{ contentHash: 'hash' }]);
});

test('error mapping is fail-open friendly and never returns raw error text', () => {
  assert.equal(E.cleanError({ status: 401, message: 'Bearer secret' }), 'API_KEY_INVALID');
  assert.equal(E.cleanError({ status: 429 }), 'RATE_LIMITED');
  assert.equal(E.cleanError({ status: 503 }), 'API_SERVER_ERROR');
  assert.equal(E.cleanError({ name: 'AbortError', message: 'secret' }), 'API_TIMEOUT');
  assert.equal(E.cleanError({ message: 'secret endpoint=https://private' }), 'API_UNAVAILABLE');
});
