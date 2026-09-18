import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const E = await import(`${resolve(root, 'src/shared/core.js')}?benchmark=${Date.now()}`);
const core = E.default || globalThis.ElonsWork;

function readDotEnv(source) {
  return source.split(/\r?\n/).reduce((env, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return env;
    const separator = trimmed.indexOf('=');
    if (separator < 1) return env;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
    env[key] = value;
    return env;
  }, {});
}

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

const dotenv = readDotEnv(await readFile(resolve(root, '.env'), 'utf8').catch(() => ''));
const apiKey = process.env.TYPESAFE_API_KEY || dotenv.TYPESAFE_API_KEY;
const endpoint = process.env.TYPESAFE_API_URL || dotenv.TYPESAFE_API_URL || core.API_ENDPOINT;
const limit = Number(arg('limit', '0')) || 0;
const concurrency = Math.max(1, Math.min(8, Number(arg('concurrency', '3')) || 3));
const requestedIds = new Set(String(arg('id', '') || arg('ids', '')).split(',').map((value) => value.trim()).filter(Boolean));
const jsonOutput = process.argv.includes('--json');

if (!apiKey) {
  console.error('Missing TYPESAFE_API_KEY. Put it in .env or the environment.');
  process.exit(2);
}

const corpus = JSON.parse(await readFile(resolve(root, 'tests/fixtures/comment-corpus.json'), 'utf8'));
const selected = requestedIds.size ? corpus.filter((item) => requestedIds.has(item.id)) : corpus;
if (requestedIds.size && selected.length !== requestedIds.size) {
  const found = new Set(selected.map((item) => item.id));
  const missing = [...requestedIds].filter((id) => !found.has(id));
  console.error(`Unknown corpus id: ${missing.join(', ')}`);
  process.exit(2);
}
const rows = limit > 0 ? selected.slice(0, limit) : selected;
const rules = core.DEFAULT_RULES;
const questions = core.buildQuestions(rules);
const spamTemplateCounts = new Map();
for (const item of corpus) {
  const fingerprint = core.templateFingerprint(item.text);
  if (fingerprint) spamTemplateCounts.set(fingerprint, (spamTemplateCounts.get(fingerprint) || 0) + 1);
}
const results = [];
let cursor = 0;

async function classify(item) {
  const started = Date.now();
  try {
    const inspectionContent = core.composeComment({ username: item.username, text: item.text, templateCount: spamTemplateCounts.get(core.templateFingerprint(item.text)) || 0 });
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: core.MODEL_VERSION, state: { content: inspectionContent }, questions }),
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) return { id: item.id, error: `HTTP_${response.status}`, latencyMs: Date.now() - started };
    const payload = await response.json();
    const decision = core.buildDecision(payload, rules, { content: inspectionContent });
    return { id: item.id, expected: item.label, spam: Boolean(item.spam), predicted: decision.shouldHide ? 'HIDE' : 'ALLOW', results: decision.results, matches: decision.matches.map((match) => ({ ruleId: match.ruleId, probability: match.probability, source: match.source || 'typesafe' })), latencyMs: Date.now() - started };
  } catch (error) {
    return { id: item.id, error: error.name === 'TimeoutError' ? 'API_TIMEOUT' : 'API_UNAVAILABLE', latencyMs: Date.now() - started };
  }
}

async function worker() {
  while (cursor < rows.length) {
    const index = cursor;
    cursor += 1;
    results[index] = await classify(rows[index]);
  }
}

function printDetailedResult(item, result) {
  console.log('\n详细评估结果（默认规则）');
  console.log(`id: ${item.id}`);
  console.log(`category: ${item.category || '—'}`);
  console.log(`expected: ${item.label || '—'}${item.spam ? ' · spam=true' : ''}`);
  console.log(`username: ${item.username || '—'}`);
  console.log(`text: ${item.text || '—'}`);
  const usernameEmoji = core.emojiSignals(item.username || '');
  const bodyEmoji = core.emojiSignals(item.text || '');
  const templateCount = spamTemplateCounts.get(core.templateFingerprint(item.text)) || 0;
  console.log(`emoji: username=${JSON.stringify(usernameEmoji)} body=${JSON.stringify(bodyEmoji)} templateMatches=${templateCount || '—'}`);
  console.log(`latency: ${result.latencyMs}ms`);
  if (result.error) {
    console.log(`error: ${result.error}`);
    return;
  }
  console.log(`predicted: ${result.predicted}`);
  console.log('rules:');
  for (const rule of rules) {
    const probability = Number(result.results[rule.id] || 0);
    const matched = probability >= rule.threshold;
    const localMatch = result.matches.find((match) => match.ruleId === rule.id && match.source);
    const status = localMatch ? `MATCH · ${localMatch.source}` : matched ? 'MATCH' : 'PASS';
    console.log(`  - ${rule.name}: probability=${(probability * 100).toFixed(1)}% threshold=${(rule.threshold * 100).toFixed(0)}% ${status}`);
  }
  console.log(`matches: ${result.matches.length ? result.matches.map((match) => `${match.ruleId} ${(match.probability * 100).toFixed(1)}%`).join(', ') : 'none'}`);
  console.log(`sent-content:\n${core.composeComment({ username: item.username, text: item.text, templateCount })}`);
}

const colorEnabled = Boolean(process.stdout.isTTY && !process.env.NO_COLOR);
const ansi = (code, value) => colorEnabled ? `\u001b[${code}m${value}\u001b[0m` : value;
const bold = (value) => ansi('1', value);
const green = (value) => ansi('32', value);
const red = (value) => ansi('31', value);
const yellow = (value) => ansi('33', value);
const dim = (value) => ansi('2', value);
const pct = (value) => `${(value * 100).toFixed(1)}%`;
const short = (value, width) => {
  const text = String(value || '');
  return text.length > width ? `${text.slice(0, Math.max(0, width - 1))}…` : text;
};
const progress = (value, width = 12) => {
  const filled = Math.max(0, Math.min(width, Math.round(value * width)));
  return `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`;
};

function printMetricRow(name, count, metric, status, note) {
  const statusText = status ? green('PASS') : red('FAIL');
  console.log(`│ ${name.padEnd(16)} ${String(count).padStart(5)}  ${pct(metric.precision).padStart(8)}  ${pct(metric.recall).padStart(7)}  ${pct(metric.f1).padStart(7)}  ${pct(metric.falsePositiveRate || 0).padStart(7)}  ${statusText.padEnd(colorEnabled ? 14 : 4)} ${note || ''}`);
}

function printMisses(items, label) {
  if (!items.length) return;
  console.log(`\n${bold(`漏检详情 · ${label}`)}`);
  console.log('┌──────────┬──────────────────────────┬────────────┬────────────┬──────────────┐');
  console.log('│ ID       │ Category                 │ 性色情况   │ 引流情况   │ 处理状态     │');
  console.log('├──────────┼──────────────────────────┼────────────┼────────────┼──────────────┤');
  for (const result of items) {
    const item = corpus.find((candidate) => candidate.id === result.id) || {};
    const content = Number(result.results && result.results.sexual_content || 0);
    const solicitation = Number(result.results && result.results.sexual_solicitation || 0);
    const status = result.spam ? '低于模型阈值' : '低于当前阈值';
    console.log(`│ ${result.id.padEnd(8)} │ ${short(item.category, 24).padEnd(24)} │ ${pct(content).padStart(10)} │ ${pct(solicitation).padStart(10)} │ ${short(status, 12).padEnd(12)} │`);
  }
  console.log('└──────────┴──────────────────────────┴────────────┴────────────┴──────────────┘');
}

function printDashboard() {
  const sexualMetric = {
    precision,
    recall,
    f1,
    falsePositiveRate: falsePositives.length / Math.max(1, scored.filter((result) => result.expected === 'ALLOW').length)
  };
  const spamMetric = {
    precision: spamPrecision,
    recall: spamRecall,
    f1: spamPrecision + spamRecall ? (2 * spamPrecision * spamRecall) / (spamPrecision + spamRecall) : 0,
    falsePositiveRate: spamFalsePositives.length / Math.max(1, spamSamples.filter((result) => result.expected === 'ALLOW').length)
  };
  const sexualPass = sexualMetric.recall === 1 && sexualMetric.falsePositiveRate === 0;
  const spamPass = spamSamples.length === 0 || (spamMetric.recall === 1 && spamMetric.falsePositiveRate === 0);
  const filter = requestedIds.size ? ` · ids=${[...requestedIds].join(',')}` : '';

  console.log('');
  console.log(bold('╭─ JEV BENCHMARK ─────────────────────────────────────────────╮'));
  console.log(`│ ${bold('Endpoint')}  ${short(endpoint, 53)}`);
  console.log(`│ ${bold('Samples')}   ${completed.length}/${rows.length} completed${filter}`);
  console.log(`│ ${bold('Split')}     ${scored.length} sexual-rule · ${spamSamples.length} spam · ${errors.length} errors`);
  console.log(`│ ${bold('Latency')}   ${Math.round(averageLatency)}ms average`);
  console.log('╰─────────────────────────────────────────────────────────────╯');

  console.log(`\n${bold('规则轨道')}`);
  console.log('┌────────────────┬───────┬──────────┬─────────┬─────────┬─────────┬────────┐');
  console.log('│ Track          │ Cases │ Prec.    │ Recall  │ F1      │ FP rate │ Status │');
  console.log('├────────────────┼───────┼──────────┼─────────┼─────────┼─────────┼────────┤');
  printMetricRow('sexual-rules', scored.length, sexualMetric, sexualPass, '默认规则');
  if (spamSamples.length) printMetricRow('spam-samples', spamSamples.length, spamMetric, spamPass, '模型 + 页面信号');
  console.log('└────────────────┴───────┴──────────┴─────────┴─────────┴─────────┴────────┘');

  console.log(`\n${bold('指标概览')}`);
  console.log(`  sexual recall  ${progress(sexualMetric.recall)} ${pct(sexualMetric.recall)}  ${sexualPass ? green('通过') : red('需关注')}`);
  if (spamSamples.length) console.log(`  spam recall    ${progress(spamMetric.recall)} ${pct(spamMetric.recall)}  ${spamPass ? green('通过') : yellow('待实现')}`);
  if (errors.length) console.log(`\n${red('Errors')}  ${errors.map((result) => `${result.id}:${result.error}`).join(', ')}`);
  printMisses(falseNegatives, 'sexual rules');
  printMisses(spamFalseNegatives.map((result) => ({ ...result, spam: true })), 'spam samples');
  if (falsePositives.length) printMisses(falsePositives, 'false positives');
}

await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, worker));
const completed = results.filter((result) => !result.error);
const errors = results.filter((result) => result.error);
const scored = completed.filter((result) => !result.spam);
const spamSamples = completed.filter((result) => result.spam);
const positives = scored.filter((result) => result.predicted === 'HIDE');
const expectedPositives = scored.filter((result) => result.expected === 'HIDE');
const truePositives = scored.filter((result) => result.expected === 'HIDE' && result.predicted === 'HIDE').length;
const falsePositives = scored.filter((result) => result.expected === 'ALLOW' && result.predicted === 'HIDE');
const falseNegatives = scored.filter((result) => result.expected === 'HIDE' && result.predicted === 'ALLOW');
const spamRule = rules.find((rule) => rule.id === 'spam_behavior');
const spamRuleMatch = (result) => spamRule && (Number(result.results && result.results[spamRule.id] || 0) >= spamRule.threshold || result.matches.some((match) => match.ruleId === spamRule.id));
const spamPositives = spamSamples.filter(spamRuleMatch);
const spamExpectedPositives = spamSamples.filter((result) => result.expected === 'HIDE');
const spamTruePositives = spamSamples.filter((result) => result.expected === 'HIDE' && spamRuleMatch(result)).length;
const spamFalsePositives = spamSamples.filter((result) => result.expected === 'ALLOW' && spamRuleMatch(result));
const spamFalseNegatives = spamSamples.filter((result) => result.expected === 'HIDE' && !spamRuleMatch(result));
const precision = positives.length ? truePositives / positives.length : 0;
const recall = expectedPositives.length ? truePositives / expectedPositives.length : 0;
const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
const spamPrecision = spamPositives.length ? spamTruePositives / spamPositives.length : 0;
const spamRecall = spamExpectedPositives.length ? spamTruePositives / spamExpectedPositives.length : 0;
const averageLatency = completed.length ? completed.reduce((sum, result) => sum + result.latencyMs, 0) / completed.length : 0;

if (jsonOutput) {
  console.log(JSON.stringify({ endpoint, corpusSize: rows.length, completed: completed.length, scored: scored.length, spamSamples: spamSamples.length, errors, metrics: { precision, recall, f1, falsePositiveRate: falsePositives.length / Math.max(1, scored.filter((result) => result.expected === 'ALLOW').length), averageLatencyMs: Math.round(averageLatency) }, spamMetrics: { precision: spamPrecision, recall: spamRecall, expectedHide: spamExpectedPositives.length, predictedHide: spamPositives.length, falsePositives: spamFalsePositives.length, falseNegatives: spamFalseNegatives.length }, predictions: results, falsePositives, falseNegatives, spamFalsePositives, spamFalseNegatives }, null, 2));
} else {
  if (requestedIds.size === 1 && rows.length === 1) {
    printDetailedResult(rows[0], results[0]);
    process.exitCode = errors.length ? 1 : 0;
    process.exit();
  }
  printDashboard();
}

process.exitCode = errors.length ? 1 : 0;
