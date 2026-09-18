(function () {
  'use strict';
  const E = globalThis.ElonsWork;
  const $ = (id) => document.getElementById(id);
  let state = null;
  let editingId = null;

  function send(type, payload) {
    return new Promise((resolve) => chrome.runtime.sendMessage({ type, payload }, (response) => resolve(response || { ok: false, error: 'NO_RESPONSE' })));
  }

  function showToast(message, kind) {
    const node = $('toast'); node.textContent = message; node.className = `ew-toast ${kind || ''}`;
    setTimeout(() => node.classList.add('ew-hidden'), 2500);
  }

  async function persist(patch) {
    const response = await send(E.MESSAGE.SAVE_CONFIG, patch);
    if (!response.ok) { showToast(`保存失败：${response.error || 'UNKNOWN_ERROR'}`, 'error'); return false; }
    await refresh();
    showToast('已保存到本地', 'success');
    return true;
  }

  function createRuleCard(rule) {
    const card = document.createElement('div'); card.className = 'ew-rule-card';
    const copy = document.createElement('div'); copy.className = 'ew-rule-card-copy';
    const title = document.createElement('div'); title.className = 'ew-rule-card-title';
    const name = document.createElement('span'); name.textContent = rule.name; title.append(name);
    const kind = document.createElement('span'); kind.className = 'ew-chip'; kind.textContent = rule.builtin ? 'SYSTEM_DEFAULT' : 'CUSTOM_RULE'; title.append(kind);
    const threshold = document.createElement('span'); threshold.className = `ew-chip ${rule.threshold < .7 ? 'amber' : ''}`; threshold.textContent = `阈值 ${Math.round(rule.threshold * 100)}%`; title.append(threshold);
    const desc = document.createElement('div'); desc.className = 'ew-rule-card-desc'; desc.textContent = rule.description; copy.append(title, desc);
    const actions = document.createElement('div'); actions.className = 'ew-rule-actions';
    const edit = document.createElement('button'); edit.className = 'ew-button ghost small'; edit.textContent = '编辑'; edit.addEventListener('click', () => openRuleModal(rule)); actions.append(edit);
    if (!rule.builtin) { const remove = document.createElement('button'); remove.className = 'ew-button danger small'; remove.textContent = '删除'; remove.addEventListener('click', async () => { if (window.confirm(`删除规则“${rule.name}”？`)) await persist({ rules: state.config.rules.filter((item) => item.id !== rule.id) }); }); actions.append(remove); }
    const toggle = document.createElement('label'); toggle.className = 'ew-toggle'; const input = document.createElement('input'); input.type = 'checkbox'; input.checked = rule.enabled; const track = document.createElement('span'); toggle.append(input, track); input.addEventListener('change', async () => { const rules = state.config.rules.map((item) => item.id === rule.id ? { ...item, enabled: input.checked } : item); await persist({ rules }); }); actions.append(toggle);
    card.append(copy, actions); return card;
  }

  function renderRules() {
    const list = $('settingsRuleList'); list.replaceChildren(...state.config.rules.map(createRuleCard));
    const active = state.config.rules.filter((rule) => rule.enabled).length;
    $('sideRuleCount').textContent = `${active} 活跃`;
  }

  function render() {
    const config = state.config; const stats = state.stats;
    $('headerStatus').innerHTML = state.hasApiKey ? '<span class="ew-dot"></span> 防护已就绪' : '<span class="ew-dot warn"></span> 需要 API Key';
    $('enabledToggle').checked = config.enabled; $('commentsOnlyToggle').checked = config.commentsOnly; $('failOpenToggle').checked = config.failOpen;
    $('placeholderToggle').checked = config.showPlaceholder; $('checkControlsToggle').checked = config.showCheckControls; $('confidenceToggle').checked = config.showConfidence; $('preloadToggle').checked = config.preload; $('debugToggle').checked = config.debug;
    $('apiKeyField').value = state.apiKeyMask || '';
    $('apiBadge').textContent = state.hasApiKey ? `CONNECTED${stats.latencyMs ? ` · ${stats.latencyMs}ms` : ''}` : 'NOT CONNECTED'; $('apiBadge').className = `ew-chip ${state.hasApiKey ? 'green' : 'amber'}`;
    $('sideHiddenCount').textContent = String(stats.hidden || 0);
    $('quotaLabel').textContent = `${(stats.requests || 0).toLocaleString()} / ${(config.dailyLimit || 0).toLocaleString()}`;
    $('quotaProgress').style.width = `${Math.min(100, ((stats.requests || 0) / Math.max(1, config.dailyLimit)) * 100)}%`;
    $('concurrencySelect').value = String(config.maxConcurrency); $('dailyLimitInput').value = String(config.dailyLimit); $('cacheTtlSelect').value = String(config.cacheTtlHours);
    $('requestPreview').textContent = JSON.stringify({ model: config.model, state: { content: '<comment text>' }, questions: E.buildQuestions(E.activeRules(config)) }, null, 2);
    renderRules();
  }

  async function refresh() { const response = await send(E.MESSAGE.GET_STATE); if (response.ok) { state = response; render(); } }

  function openRuleModal(rule) {
    editingId = rule ? rule.id : null; $('modalTitle').textContent = rule ? `编辑规则 · ${rule.name}` : '添加自定义过滤规则';
    $('ruleName').value = rule ? rule.name : ''; $('ruleDescription').value = rule ? rule.description : ''; $('ruleFalseCriteria').value = rule ? (rule.falseCriteria || '') : ''; $('ruleThreshold').value = rule ? Math.round(rule.threshold * 100) : 80; $('thresholdValue').textContent = `${$('ruleThreshold').value}%`;
    $('ruleName').readOnly = Boolean(rule && rule.builtin); $('ruleDescription').readOnly = Boolean(rule && rule.builtin); $('ruleFalseCriteria').readOnly = Boolean(rule && rule.builtin); $('modalBackdrop').classList.remove('ew-hidden'); $('ruleName').focus();
  }

  function closeRuleModal() { $('modalBackdrop').classList.add('ew-hidden'); editingId = null; }

  $('enabledToggle').addEventListener('change', (event) => persist({ enabled: event.target.checked }));
  $('commentsOnlyToggle').addEventListener('change', (event) => persist({ commentsOnly: event.target.checked }));
  $('failOpenToggle').addEventListener('change', (event) => persist({ failOpen: event.target.checked }));
  $('placeholderToggle').addEventListener('change', (event) => persist({ showPlaceholder: event.target.checked }));
  $('checkControlsToggle').addEventListener('change', (event) => persist({ showCheckControls: event.target.checked }));
  $('confidenceToggle').addEventListener('change', (event) => persist({ showConfidence: event.target.checked }));
  $('preloadToggle').addEventListener('change', (event) => persist({ preload: event.target.checked }));
  $('debugToggle').addEventListener('change', (event) => persist({ debug: event.target.checked }));
  $('concurrencySelect').addEventListener('change', (event) => persist({ maxConcurrency: Number(event.target.value) }));
  $('dailyLimitInput').addEventListener('change', (event) => persist({ dailyLimit: Number(event.target.value) }));
  $('cacheTtlSelect').addEventListener('change', (event) => persist({ cacheTtlHours: Number(event.target.value) }));
  $('ruleThreshold').addEventListener('input', (event) => { $('thresholdValue').textContent = `${event.target.value}%`; });
  $('addRuleButton').addEventListener('click', () => openRuleModal()); $('closeModalButton').addEventListener('click', closeRuleModal); $('cancelRuleButton').addEventListener('click', closeRuleModal); $('modalBackdrop').addEventListener('click', (event) => { if (event.target === $('modalBackdrop')) closeRuleModal(); });
  $('ruleForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = $('ruleName').value.trim(); const description = $('ruleDescription').value.trim(); const falseCriteria = $('ruleFalseCriteria').value.trim(); const threshold = Number($('ruleThreshold').value) / 100;
    if (!name || !description) return;
    let rules;
    if (editingId) rules = state.config.rules.map((rule) => rule.id === editingId ? { ...rule, name, description, trueCriteria: description, falseCriteria, threshold, instructions: rule.builtin ? rule.instructions : '判断 `content` 是否符合以下过滤条件：' + description + '。' } : rule);
    else { const id = `custom_${Date.now().toString(36)}`; rules = [...state.config.rules, { id, name, description, instructions: '判断 `content` 是否符合以下过滤条件：' + description + '。', trueCriteria: description, falseCriteria, threshold, enabled: true, builtin: false }]; }
    if (await persist({ rules })) closeRuleModal();
  });

  $('testKeyButton').addEventListener('click', async () => { const message = $('apiMessage'); message.classList.add('ew-hidden'); const result = await send(E.MESSAGE.TEST_CONNECTION); if (result.ok) { showToast(`连接成功 · ${result.latencyMs}ms`, 'success'); } else { message.textContent = `连接失败：${result.error || 'API_UNAVAILABLE'}`; message.classList.remove('ew-hidden'); } });
  let editingKey = false;
  $('changeKeyButton').addEventListener('click', async () => { const field = $('apiKeyField'); if (!editingKey) { editingKey = true; field.readOnly = false; field.value = ''; field.placeholder = 'apikey_…'; field.focus(); $('changeKeyButton').textContent = '保存'; return; } const key = field.value.trim(); const result = await send(E.MESSAGE.TEST_CONNECTION, { apiKey: key }); if (!result.ok) { $('apiMessage').textContent = `连接失败：${result.error || 'API_UNAVAILABLE'}`; $('apiMessage').classList.remove('ew-hidden'); return; } await send(E.MESSAGE.SAVE_API_KEY, { apiKey: key }); await send(E.MESSAGE.SAVE_CONFIG, { onboardingCompleted: true }); editingKey = false; field.readOnly = true; $('changeKeyButton').textContent = '更换'; showToast('新 API Key 已保存', 'success'); await refresh(); });
  $('revokeKeyButton').addEventListener('click', async () => { if (!window.confirm('删除本地 TypeSafe API Key？删除后插件将保持放行。')) return; await send(E.MESSAGE.SAVE_API_KEY, { apiKey: '' }); showToast('API Key 已从本地删除', 'success'); await refresh(); });
  $('clearCacheButton').addEventListener('click', async () => { await send(E.MESSAGE.CLEAR_CACHE); showToast('分类缓存已清除', 'success'); });
  $('saveAllButton').addEventListener('click', () => showToast('当前配置已实时同步到浏览器本地存储', 'success'));
  $('exportButton').addEventListener('click', () => { const safe = E.sanitizeConfig(state.config); const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), config: safe }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'elons-work-config.json'; link.click(); URL.revokeObjectURL(url); showToast('已导出（不包含 API Key）', 'success'); });
  document.querySelectorAll('[data-target]').forEach((button) => button.addEventListener('click', () => { document.getElementById(button.dataset.target).scrollIntoView({ behavior: 'smooth', block: 'start' }); document.querySelectorAll('[data-target]').forEach((node) => node.classList.toggle('active', node === button)); }));
  refresh();
})();
