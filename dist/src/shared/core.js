(function (root) {
  'use strict';

  const APP = 'ElonsWork';
  const STORAGE_KEY = 'elonsWorkConfig';
  const STATS_KEY = 'elonsWorkStats';
  const CACHE_KEY = 'elonsWorkCache';
  const MODEL_VERSION = 'jev-latest';
  const API_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
  const MAX_COMMENT_LENGTH = 4000;
  const MESSAGE = {
    GET_STATE: 'GET_STATE',
    SAVE_API_KEY: 'SAVE_API_KEY',
    TEST_CONNECTION: 'TEST_CONNECTION',
    OPEN_ONBOARDING: 'OPEN_ONBOARDING',
    CLASSIFY_COMMENT: 'CLASSIFY_COMMENT',
    SAVE_CONFIG: 'SAVE_CONFIG',
    RECORD_COMMENT_EVENT: 'RECORD_COMMENT_EVENT',
    CLEAR_CACHE: 'CLEAR_CACHE',
    OPEN_SETTINGS: 'OPEN_SETTINGS'
  };

  const DEFAULT_RULES = [
    {
      id: 'sexual_content',
      name: '色情 / 性暗示',
      description: '隐藏色情、明显性暗示、性挑逗、擦边或自我性化表达的评论。',
      instructions: '判断“用户名 + 评论正文”是否有色情、情色、明显性暗示、性挑逗、擦边或自我性化意图。用户名本身明显表达成人、福利、私密或性化招揽时，即使正文普通也判 true。先去掉 emoji 和装饰符号理解整段语义；隐晦黑话、缩写、谐音、拼音变体、只谈身体、私房内容、重复模板和性化 emoji 都可能是掩饰。代表性锚点包括“只进身体不进生活”“搞hs”“小马开大车”“比我好看的没我骚”，不是封闭关键词表。普通祝福、外貌/艺术/医学/新闻/交通讨论，以及孤立的“大车”、单个敏感词或零散 emoji 不判 true。',
      trueCriteria: '用户名或正文以性、情色、性挑逗、自我性化、成人私密内容或隐晦性暗示为核心；性化语义与密集/连续/重复 emoji 同时出现时提高置信度。',
      falseCriteria: '普通姓名、正常聊天、恋爱、外貌、时尚/艺术、医学、新闻或交通语境；单个敏感词、普通 emoji、夸张账号名或“大车”等词没有性化上下文时不算 true。',
      threshold: 0.65,
      enabled: true,
      builtin: true
    },
    {
      id: 'sexual_solicitation',
      name: '色情引流 / 招揽',
      description: '隐藏通过色情或性暗示吸引私聊、加账号、点击链接或购买服务的评论。',
      instructions: '判断“用户名 + 评论正文”是否把色情、情色、成人私密内容或明显性暗示用于招揽、引流或诱导联系。成人服务、福利、私密、免费招揽或联系方式出现在用户名中时，即使正文普通也判 true。需要结合性化语义与行动号召；识别私信、Telegram/微信、点头像、进群、链接、关注、福利、写真、私密照、完整版、房间号、密码、会员、直播、长数字 ID，以及“成人会员今日特价”这类购买话术。',
      trueCriteria: '性化/成人私密内容与私聊、联系方式、外链、点头像、关注、进群、约会、会员、直播、照片、购买或访问行动组合出现；重复 emoji 只能辅助，不单独构成引流。',
      falseCriteria: '普通姓名/账号名、普通 Telegram/社群、正常链接、新闻、教育、医学、时尚内容；单独出现“私信/关注/链接/会员”或 emoji 不算 true。',
      threshold: 0.75,
      enabled: true,
      builtin: true
    },
    {
      id: 'spam_behavior',
      name: '垃圾评论 / 模板刷屏',
      description: '隐藏重复模板、低质批量评论、异常 emoji 组合和引流式刷屏内容。',
      instructions: '判断 `content` 是否为垃圾评论、批量模板刷屏或低质互动诱导。`page_template_matches >= 2` 是强信号：去掉 emoji、标点和可替换 token 后句式重复时，即使表面是祝福或普通中文也判 true。`invisible_char_count >= 3` 且伴随 emoji 或模板结构时，也判为故意污染/规避检测。重点识别复制粘贴骨架、随机 emoji 插入、空泛互动诱导和批量生成；单条自然评论、孤立 emoji 或单个不可见字符不算 spam。',
      trueCriteria: '去掉 emoji/标点/可替换 token 后的页面近重复句式，随机替换 emoji 的复制模板，或多个不可见字符污染与 emoji/模板结构同时出现；也可结合低质空泛、互动诱导、批量生成特征。',
      falseCriteria: '一次性正常评论、具体观点、真实对话、普通祝福或自然使用 emoji；没有重复/模板证据时不要仅凭短句或 emoji 判 spam。',
      threshold: 0.78,
      enabled: true,
      builtin: true
    }
  ];

  const DEFAULT_CONFIG = {
    enabled: true,
    onboardingCompleted: false,
    rulesVersion: 3,
    commentsOnly: true,
    failOpen: true,
    preload: false,
    showPlaceholder: true,
    showConfidence: true,
    showCheckControls: true,
    maxConcurrency: 3,
    cacheTtlHours: 24,
    dailyLimit: 100000,
    debug: false,
    model: MODEL_VERSION,
    apiEndpoint: API_ENDPOINT,
    rules: DEFAULT_RULES
  };

  const SELECTORS = {
    tweet: 'article[data-testid="tweet"]',
    tweetText: '[data-testid="tweetText"]',
    userName: '[data-testid="User-Name"]',
    tweetLink: 'a[href*="/status/"]'
  };

  const INVISIBLE_CHAR_RE = /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\u2800\u3164\uFEFF]/gu;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalizeThreshold(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? clamp(numeric, 0.5, 0.99) : 0.8;
  }

  function normalizeRule(input, index) {
    const rule = input && typeof input === 'object' ? input : {};
    return {
      id: String(rule.id || `custom_rule_${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, '_'),
      name: String(rule.name || '未命名规则').trim().slice(0, 80),
      description: String(rule.description || rule.trueCriteria || rule.instructions || '').trim().slice(0, 500),
      instructions: String(rule.instructions || '判断 `content` 是否符合以下过滤条件：' + (rule.description || rule.name || '自定义内容') + '。').trim().slice(0, 1200),
      trueCriteria: String(rule.trueCriteria || rule.description || '').trim().slice(0, 800),
      falseCriteria: String(rule.falseCriteria || '').trim().slice(0, 800),
      threshold: normalizeThreshold(rule.threshold),
      enabled: rule.enabled !== false,
      builtin: Boolean(rule.builtin)
    };
  }

  function createDefaultConfig() {
    return clone(DEFAULT_CONFIG);
  }

  function normalizeConfig(input) {
    const raw = input && typeof input === 'object' ? input : {};
    const configuredRules = Array.isArray(raw.rules) && raw.rules.length
      ? raw.rules.map(normalizeRule)
      : clone(DEFAULT_RULES);
    const configuredIds = new Set(configuredRules.map((rule) => rule.id));
    const mergedRules = configuredRules.concat(DEFAULT_RULES.filter((rule) => !configuredIds.has(rule.id)).map(clone));
    const defaultsById = new Map(DEFAULT_RULES.map((rule) => [rule.id, rule]));
    const rules = mergedRules.map((rule) => {
      const builtin = defaultsById.get(rule.id);
      if (!builtin || rule.builtin !== true) return rule;
      const legacyThreshold = Number(raw.rulesVersion || 0) < 2 && ['sexual_content', 'sexual_solicitation'].includes(rule.id) && rule.threshold === 0.8;
      return { ...clone(builtin), enabled: rule.enabled, threshold: legacyThreshold ? builtin.threshold : rule.threshold };
    });
    const legacyDailyLimit = Number(raw.rulesVersion || 0) < 3 && Number(raw.dailyLimit) === 2000;
    return {
      enabled: raw.enabled !== false,
      onboardingCompleted: raw.onboardingCompleted === true,
      rulesVersion: 3,
      commentsOnly: raw.commentsOnly !== false,
      failOpen: raw.failOpen !== false,
      preload: raw.preload === true,
      showPlaceholder: raw.showPlaceholder !== false,
      showConfidence: raw.showConfidence !== false,
      showCheckControls: raw.showCheckControls !== false,
      maxConcurrency: clamp(Number(raw.maxConcurrency) || 3, 1, 8),
      cacheTtlHours: clamp(Number(raw.cacheTtlHours) || 24, 1, 168),
      dailyLimit: legacyDailyLimit ? 100000 : clamp(Number(raw.dailyLimit) || 100000, 1, 100000),
      debug: raw.debug === true,
      model: String(raw.model || MODEL_VERSION).slice(0, 80),
      apiEndpoint: String(raw.apiEndpoint || API_ENDPOINT),
      rules
    };
  }

  function sanitizeConfig(input) {
    return normalizeConfig(input);
  }

  function activeRules(config) {
    return normalizeConfig(config).rules.filter((rule) => rule.enabled);
  }

  function normalizeText(value) {
    return String(value || '')
      .replace(INVISIBLE_CHAR_RE, '')
      .replace(/[\t\n\r ]+/g, ' ')
      .trim()
      .slice(0, MAX_COMMENT_LENGTH);
  }

  function invisibleCharCount(value) {
    return (String(value || '').match(INVISIBLE_CHAR_RE) || []).length;
  }

  const EMOJI_TOKEN_RE = /(?:\p{Extended_Pictographic}|\p{Regional_Indicator})/gu;
  const EMOJI_RUN_RE = /(?:(?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:\uFE0F|\u200D|\p{Emoji_Modifier})*)+/gu;
  const EMOJI_DECORATION_RE = /[\uFE0E\uFE0F\u200D\p{Emoji_Modifier}]/gu;

  function emojiSignals(value) {
    const text = normalizeText(value);
    const tokens = text.match(EMOJI_TOKEN_RE) || [];
    const runs = text.match(EMOJI_RUN_RE) || [];
    const characters = Array.from(text).length;
    const maxRun = runs.reduce((max, run) => Math.max(max, (run.match(EMOJI_TOKEN_RE) || []).length), 0);
    const uniqueTokens = new Set(tokens);
    return {
      count: tokens.length,
      ratio: Number((tokens.length / Math.max(1, characters)).toFixed(3)),
      runs: runs.length,
      maxRun,
      repeats: Math.max(0, tokens.length - uniqueTokens.size)
    };
  }

  function stripEmoji(value) {
    return normalizeText(value).replace(EMOJI_TOKEN_RE, '').replace(EMOJI_DECORATION_RE, '');
  }

  function formatEmojiSignals(label, value) {
    const signals = emojiSignals(value);
    return `${label}_emoji_count=${signals.count},${label}_emoji_ratio=${Math.round(signals.ratio * 100)}%,${label}_emoji_runs=${signals.runs},${label}_emoji_max_run=${signals.maxRun},${label}_emoji_repeats=${signals.repeats}`;
  }

  function templateFingerprint(value) {
    return stripEmoji(value)
      .toLocaleLowerCase()
      .replace(/[a-z]+/gi, '#')
      .replace(/[\p{P}\p{S}\s]+/gu, '')
      .replace(/\d+/g, '#')
      .slice(0, 160);
  }

  function composeComment(input) {
    const comment = input && typeof input === 'object' ? input : { text: input };
    const rawAuthor = String(comment.author || comment.username || comment.userName || '');
    const rawText = String(comment.text || '');
    const author = normalizeText(rawAuthor);
    const text = normalizeText(rawText);
    const content = !author ? text : !text ? `[用户名] ${author}` : `[用户名] ${author}\n[评论正文] ${text}`;
    const authorEmoji = emojiSignals(author);
    const bodyEmoji = emojiSignals(text);
    const templateCount = Number(comment.templateCount) || 0;
    const invisibleCount = Number(comment.invisibleCharCount) || invisibleCharCount(rawAuthor) + invisibleCharCount(rawText);
    if (!authorEmoji.count && !bodyEmoji.count && templateCount < 2 && invisibleCount < 1) return content;
    const strippedAuthor = stripEmoji(author);
    const strippedBody = stripEmoji(text);
    const signals = `${formatEmojiSignals('username', author)}; ${formatEmojiSignals('body', text)}; invisible_char_count=${invisibleCount}; username_without_emoji=${strippedAuthor || '—'}; body_without_emoji=${strippedBody || '—'}${templateCount >= 2 ? `; page_template_matches=${templateCount}` : ''}`;
    return `${content}\n[emoji 结构信号] ${signals}`.slice(0, MAX_COMMENT_LENGTH);
  }

  function buildQuestions(rules) {
    return (rules || []).reduce((questions, rule) => {
      questions[rule.id] = {
        type: 'noul',
        instructions: rule.instructions,
        criteria: {
          true: rule.trueCriteria || '内容符合该规则描述。',
          false: rule.falseCriteria || '内容不符合该规则描述。'
        }
      };
      return questions;
    }, {});
  }

  function getProbability(answer) {
    if (!answer || typeof answer !== 'object') return 0;
    const candidates = [
      answer.pTrue,
      answer.noul,
      answer.probabilities && answer.probabilities.true,
      answer.probabilities && answer.probabilities['true'],
      answer.probabilities && answer.probabilities.yes
    ];
    const found = candidates.find((value) => Number.isFinite(Number(value)));
    return found === undefined ? 0 : clamp(Number(found), 0, 1);
  }

  function readAnswers(payload) {
    if (!payload || typeof payload !== 'object') return {};
    return payload.answers && typeof payload.answers === 'object' ? payload.answers : payload;
  }

  function readSignal(content, name) {
    const match = String(content || '').match(new RegExp(`${name}=([0-9]+)`));
    return match ? Number(match[1]) : 0;
  }

  function localSpamSignal(content) {
    const templateMatches = readSignal(content, 'page_template_matches');
    const bodyEmojiCount = readSignal(content, 'body_emoji_count');
    const invisibleCount = readSignal(content, 'invisible_char_count');
    return {
      templateMatches,
      bodyEmojiCount,
      invisibleCount,
      matched: (templateMatches >= 2 && bodyEmojiCount >= 1) || (invisibleCount >= 3 && (bodyEmojiCount >= 1 || templateMatches >= 2))
    };
  }

  function localObfuscatedSexualSignal(content) {
    const bodyEmojiCount = readSignal(content, 'body_emoji_count');
    const match = String(content || '').match(/body_without_emoji=([^;\n]*)/);
    const body = match ? match[1] : '';
    const representativeAnchor = /只进身体|搞\s*h\s*s|小马开大车|比我好看的没我骚/i.test(body);
    return { bodyEmojiCount, representativeAnchor, matched: bodyEmojiCount >= 2 && representativeAnchor };
  }

  function buildDecision(response, rules, context) {
    const answers = readAnswers(response);
    const results = {};
    const matches = [];
    const localSignals = {
      spam: localSpamSignal(context && context.content),
      sexualObfuscation: localObfuscatedSexualSignal(context && context.content)
    };
    for (const rule of rules || []) {
      const probability = getProbability(answers[rule.id]);
      results[rule.id] = probability;
      const spamModelSupported = localSignals.spam.bodyEmojiCount >= 1 || localSignals.spam.templateMatches >= 2 || localSignals.spam.invisibleCount >= 3;
      if (rule.enabled !== false && probability >= normalizeThreshold(rule.threshold) && (rule.id !== 'spam_behavior' || spamModelSupported)) {
        matches.push({
          ruleId: rule.id,
          name: rule.name,
          probability,
          threshold: normalizeThreshold(rule.threshold)
        });
      }
    }
    const spamRule = (rules || []).find((rule) => rule.id === 'spam_behavior' && rule.enabled !== false);
    if (spamRule && localSignals.spam.matched && !matches.some((match) => match.ruleId === spamRule.id)) {
      matches.push({
        ruleId: spamRule.id,
        name: spamRule.name,
        probability: Math.max(results[spamRule.id] || 0, normalizeThreshold(spamRule.threshold)),
        threshold: normalizeThreshold(spamRule.threshold),
        source: 'page-template-signal'
      });
    }
    const sexualRule = (rules || []).find((rule) => rule.id === 'sexual_content' && rule.enabled !== false);
    if (sexualRule && localSignals.sexualObfuscation.matched && !matches.some((match) => match.ruleId === sexualRule.id)) {
      matches.push({
        ruleId: sexualRule.id,
        name: sexualRule.name,
        probability: Math.max(results[sexualRule.id] || 0, normalizeThreshold(sexualRule.threshold)),
        threshold: normalizeThreshold(sexualRule.threshold),
        source: 'emoji-obfuscation-signal'
      });
    }
    matches.sort((a, b) => b.probability - a.probability);
    return { results, matches, localSignals, shouldHide: matches.length > 0 };
  }

  function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value && typeof value === 'object') {
      return Object.keys(value).sort().reduce((out, key) => {
        out[key] = stableValue(value[key]);
        return out;
      }, {});
    }
    return value;
  }

  function stableStringify(value) {
    return JSON.stringify(stableValue(value));
  }

  function fallbackHash(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
  }

  async function hashText(value) {
    const source = String(value);
    if (root.crypto && root.crypto.subtle && root.TextEncoder) {
      const data = new root.TextEncoder().encode(source);
      const digest = await root.crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
    }
    return fallbackHash(source);
  }

  async function rulesFingerprint(rules) {
    return hashText(stableStringify((rules || []).filter((rule) => rule.enabled !== false).map((rule) => ({
      id: rule.id,
      instructions: rule.instructions,
      trueCriteria: rule.trueCriteria,
      falseCriteria: rule.falseCriteria
    }))));
  }

  async function cacheKey(text, rules, model) {
    const normalized = normalizeText(text);
    const fingerprint = await rulesFingerprint(rules);
    return hashText(stableStringify({ normalized, fingerprint, model: model || MODEL_VERSION }));
  }

  function maskSecret(value) {
    const secret = String(value || '');
    if (!secret) return '';
    if (secret.length <= 8) return '••••••••';
    return `${secret.slice(0, 4)}${'•'.repeat(Math.min(20, secret.length - 8))}${secret.slice(-4)}`;
  }

  function isTweetDetailUrl(url) {
    return /^https:\/\/(?:www\.)?x\.com\/[^/]+\/status\/\d+/.test(String(url || ''));
  }

  function rootTweetId(url) {
    const match = String(url || '').match(/\/status\/(\d+)/);
    return match ? match[1] : null;
  }

  function tweetIdFromArticle(article) {
    if (!article || !article.querySelector) return null;
    const link = article.querySelector(SELECTORS.tweetLink);
    const match = link && String(link.getAttribute('href') || '').match(/\/status\/(\d+)/);
    return match ? match[1] : null;
  }

  function extractComment(article) {
    if (!article || !article.querySelector) return null;
    const textNode = article.querySelector(SELECTORS.tweetText);
    const rawText = textNode ? String(textNode.textContent || '') : '';
    const text = normalizeText(rawText);
    const userNode = article.querySelector(SELECTORS.userName);
    const rawAuthor = userNode ? String(userNode.textContent || '') : '';
    const author = normalizeText(rawAuthor);
    const tweetId = tweetIdFromArticle(article);
    if (!tweetId || !text) return null;
    const dirtyCount = invisibleCharCount(rawText) + invisibleCharCount(rawAuthor);
    return dirtyCount ? { tweetId, text, author, invisibleCharCount: dirtyCount } : { tweetId, text, author };
  }

  function isReplyArticle(article, url) {
    const tweetId = tweetIdFromArticle(article);
    return Boolean(tweetId && tweetId !== rootTweetId(url));
  }

  function storageArea(chromeApi, areaName) {
    return chromeApi && chromeApi.storage && (chromeApi.storage[areaName] || chromeApi.storage.local);
  }

  function storageGet(chromeApi, areaName, key) {
    const area = storageArea(chromeApi, areaName);
    if (!area) return Promise.resolve({});
    return new Promise((resolve) => {
      try {
        area.get(key, (result) => resolve(result || {}));
      } catch (_) {
        resolve({});
      }
    });
  }

  function storageSet(chromeApi, areaName, value) {
    const area = storageArea(chromeApi, areaName);
    if (!area) return Promise.resolve();
    return new Promise((resolve) => {
      try { area.set(value, resolve); } catch (_) { resolve(); }
    });
  }

  function storageRemove(chromeApi, areaName, key) {
    const area = storageArea(chromeApi, areaName);
    if (!area) return Promise.resolve();
    return new Promise((resolve) => {
      try { area.remove(key, resolve); } catch (_) { resolve(); }
    });
  }

  async function loadConfig(chromeApi, includeSecret) {
    const stored = await storageGet(chromeApi, 'local', STORAGE_KEY);
    const config = normalizeConfig(stored[STORAGE_KEY]);
    if (includeSecret) config.typesafeApiKey = String((stored[STORAGE_KEY] || {}).typesafeApiKey || '');
    return config;
  }

  async function saveConfig(chromeApi, patch) {
    const stored = await storageGet(chromeApi, 'local', STORAGE_KEY);
    const current = stored[STORAGE_KEY] || {};
    const next = { ...current, ...sanitizeConfig({ ...current, ...patch }) };
    if (Object.prototype.hasOwnProperty.call(patch || {}, 'typesafeApiKey')) {
      next.typesafeApiKey = String(patch.typesafeApiKey || '').trim();
    } else if (current.typesafeApiKey) {
      next.typesafeApiKey = current.typesafeApiKey;
    }
    await storageSet(chromeApi, 'local', { [STORAGE_KEY]: next });
    return normalizeConfig(next);
  }

  async function getStats(chromeApi) {
    const today = new Date().toISOString().slice(0, 10);
    const stored = await storageGet(chromeApi, 'local', STATS_KEY);
    const stats = stored[STATS_KEY] || {};
    const totalChecked = Number(stats.totalChecked ?? stats.checked) || 0;
    const totalHidden = Number(stats.totalHidden ?? stats.hidden) || 0;
    if (stats.day !== today) {
      return { day: today, requests: 0, checked: 0, hidden: 0, totalChecked, totalHidden, cacheHits: 0, errors: 0, latencyMs: 0, lastError: '', pageChecked: 0, pageHidden: 0, pageSafe: 0, pagePending: 0, pageErrors: 0, pageLatencyMs: 0 };
    }
    return {
      day: today,
      requests: Number(stats.requests) || 0,
      checked: Number(stats.checked) || 0,
      hidden: Number(stats.hidden) || 0,
      totalChecked,
      totalHidden,
      cacheHits: Number(stats.cacheHits) || 0,
      errors: Number(stats.errors) || 0,
      latencyMs: Number(stats.latencyMs) || 0,
      lastError: String(stats.lastError || ''),
      pageChecked: Number(stats.pageChecked) || 0,
      pageHidden: Number(stats.pageHidden) || 0,
      pageSafe: Number(stats.pageSafe) || 0,
      pagePending: Number(stats.pagePending) || 0,
      pageErrors: Number(stats.pageErrors) || 0,
      pageLatencyMs: Number(stats.pageLatencyMs) || 0
    };
  }

  async function updateStats(chromeApi, changes) {
    const next = { ...(await getStats(chromeApi)), ...(changes || {}) };
    await storageSet(chromeApi, 'local', { [STATS_KEY]: next });
    return next;
  }

  function cleanError(error) {
    const code = error && error.code ? String(error.code) : '';
    if (code) return code;
    const status = error && Number(error.status);
    if (status === 401 || status === 403) return 'API_KEY_INVALID';
    if (status === 429) return 'RATE_LIMITED';
    if (status >= 500) return 'API_SERVER_ERROR';
    if (error && error.name === 'AbortError') return 'API_TIMEOUT';
    return 'API_UNAVAILABLE';
  }

  function debugLog(config, event, data) {
    if (!config || !config.debug || !root.console || typeof root.console.debug !== 'function') return;
    const safe = { ...(data || {}) };
    delete safe.apiKey;
    delete safe.typesafeApiKey;
    delete safe.content;
    root.console.debug(`[Elon的工作] ${event}`, safe);
  }

  const exported = {
    APP,
    STORAGE_KEY,
    STATS_KEY,
    CACHE_KEY,
    MODEL_VERSION,
    API_ENDPOINT,
    MAX_COMMENT_LENGTH,
    MESSAGE,
    DEFAULT_RULES,
    DEFAULT_CONFIG,
    SELECTORS,
    clone,
    clamp,
    normalizeRule,
    createDefaultConfig,
    normalizeConfig,
    sanitizeConfig,
    activeRules,
    normalizeText,
    invisibleCharCount,
    emojiSignals,
    stripEmoji,
    templateFingerprint,
    composeComment,
    buildQuestions,
    getProbability,
    readAnswers,
    localSpamSignal,
    localObfuscatedSexualSignal,
    buildDecision,
    stableStringify,
    hashText,
    rulesFingerprint,
    cacheKey,
    maskSecret,
    isTweetDetailUrl,
    rootTweetId,
    tweetIdFromArticle,
    extractComment,
    isReplyArticle,
    storageGet,
    storageSet,
    storageRemove,
    loadConfig,
    saveConfig,
    getStats,
    updateStats,
    cleanError,
    debugLog
  };

  root[APP] = Object.assign(root[APP] || {}, exported);
  if (typeof module !== 'undefined' && module.exports) module.exports = root[APP];
})(typeof globalThis !== 'undefined' ? globalThis : self);
