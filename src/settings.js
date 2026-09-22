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
    const kind = document.createElement('span'); kind.className = 'ew-chip'; kind.textContent = rule.builtin ? 'SYSTEM_SPEC' : 'CUSTOM_SPEC'; title.append(kind);
    const desc = document.createElement('div'); desc.className = 'ew-rule-card-desc'; desc.textContent = rule.description; copy.append(title, desc);
    const actions = document.createElement('div'); actions.className = 'ew-rule-actions';
    const edit = document.createElement('button'); edit.className = 'ew-button ghost small'; edit.textContent = '编辑'; edit.addEventListener('click', () => openRuleModal(rule)); actions.append(edit);
    if (!rule.builtin) { const remove = document.createElement('button'); remove.className = 'ew-button danger small'; remove.textContent = '删除'; remove.addEventListener('click', async () => { if (window.confirm(`删除识别规则“${rule.name}”？`)) { const recognitionRules = state.config.commentRecognition.rules.filter((item) => item.id !== rule.id); const filteringRules = state.config.commentFiltering.rules.filter((item) => item.id !== rule.id); await persist({ commentRecognition: { rules: recognitionRules }, commentFiltering: { rules: filteringRules } }); } }); actions.append(remove); }
    card.append(copy, actions); return card;
  }

  function renderRules() {
    const list = $('settingsRuleList'); list.replaceChildren(...state.config.commentRecognition.rules.map(createRuleCard));
  }

  function createFilterCard(filterRule) {
    const rule = state.config.rules.find((candidate) => candidate.id === filterRule.id) || filterRule;
    const card = document.createElement('div'); card.className = 'ew-rule-card';
    const copy = document.createElement('div'); copy.className = 'ew-rule-card-copy';
    const title = document.createElement('div'); title.className = 'ew-rule-card-title';
    const name = document.createElement('span'); name.textContent = rule.name; title.append(name);
    const kind = document.createElement('span'); kind.className = 'ew-chip'; kind.textContent = 'FILTER_POLICY'; title.append(kind);
    const desc = document.createElement('div'); desc.className = 'ew-rule-card-desc'; desc.textContent = rule.description || '评论命中该识别规范时的本地过滤策略。'; copy.append(title, desc);
    const actions = document.createElement('div'); actions.className = 'ew-rule-actions ew-filter-rule-actions';
    const thresholdField = document.createElement('label'); thresholdField.className = 'ew-filter-threshold';
    const thresholdValue = document.createElement('span'); thresholdValue.className = 'ew-mono'; thresholdValue.textContent = `${Math.round(filterRule.threshold * 100)}%`;
    thresholdField.append('阈值 ', thresholdValue);
    const threshold = document.createElement('input'); threshold.className = 'ew-range'; threshold.type = 'range'; threshold.min = '50'; threshold.max = '99'; threshold.value = String(Math.round(filterRule.threshold * 100)); thresholdField.appendChild(threshold);
    threshold.addEventListener('input', () => { thresholdValue.textContent = `${threshold.value}%`; });
    threshold.addEventListener('change', () => {
      const rules = state.config.commentFiltering.rules.map((item) => item.id === filterRule.id ? { ...item, threshold: Number(threshold.value) / 100 } : item);
      persist({ commentFiltering: { rules } });
    });
    const toggle = document.createElement('label'); toggle.className = 'ew-toggle'; const input = document.createElement('input'); input.type = 'checkbox'; input.checked = filterRule.enabled; const track = document.createElement('span'); toggle.append(input, track); input.addEventListener('change', () => { const rules = state.config.commentFiltering.rules.map((item) => item.id === filterRule.id ? { ...item, enabled: input.checked } : item); persist({ commentFiltering: { rules } }); });
    actions.append(thresholdField, toggle); card.append(copy, actions); return card;
  }

  function renderCommentFilters() {
    $('commentFilterList').replaceChildren(...state.config.commentFiltering.rules.map(createFilterCard));
  }

  function render() {
    const config = state.config; const stats = state.stats;
    $('headerStatus').innerHTML = state.hasApiKey ? '<span class="ew-dot"></span> 防护已就绪' : '<span class="ew-dot warn"></span> 需要 API Key';
    $('enabledToggle').checked = config.enabled; $('commentsOnlyToggle').checked = config.commentsOnly; $('failOpenToggle').checked = config.failOpen;
    $('placeholderToggle').checked = config.showPlaceholder; $('checkControlsToggle').checked = config.showCheckControls; $('confidenceToggle').checked = config.showConfidence; $('preloadToggle').checked = config.preload; $('debugToggle').checked = config.debug;
    $('postRecognitionDescription').value = config.postRecognition.description;
    $('postRecognitionInstructions').value = config.postRecognition.instructions;
    $('postRecognitionTrueCriteria').value = config.postRecognition.trueCriteria;
    $('postRecognitionFalseCriteria').value = config.postRecognition.falseCriteria;
    $('postFilteringEnabledToggle').checked = config.postFiltering.enabled;
    $('postSlopThreshold').value = String(Math.round(config.postFiltering.threshold * 100)); $('postSlopThresholdValue').textContent = `${Math.round(config.postFiltering.threshold * 100)}%`;
    $('postShowStampToggle').checked = config.postFiltering.showStamp; $('postShowOverlayToggle').checked = config.postFiltering.showOverlay; $('postWeakenHoverToggle').checked = config.postFiltering.weakenOnHover;
    $('apiKeyField').value = state.apiKeyMask || '';
    $('apiBadge').textContent = state.hasApiKey ? `CONNECTED${stats.latencyMs ? ` · ${stats.latencyMs}ms` : ''}` : 'NOT CONNECTED'; $('apiBadge').className = `ew-chip ${state.hasApiKey ? 'green' : 'amber'}`;
    $('sideHiddenCount').textContent = String(stats.hidden || 0);
    $('quotaLabel').textContent = `${(stats.requests || 0).toLocaleString()} / ${(config.dailyLimit || 0).toLocaleString()}`;
    $('quotaProgress').style.width = `${Math.min(100, ((stats.requests || 0) / Math.max(1, config.dailyLimit)) * 100)}%`;
    $('concurrencySelect').value = String(config.maxConcurrency); $('dailyLimitInput').value = String(config.dailyLimit); $('cacheTtlSelect').value = String(config.cacheTtlHours);
    $('requestPreview').textContent = JSON.stringify({
      model: config.model,
      comment: { state: { content: '<comment text>' }, questions: E.buildQuestions(E.activeRules(config)) },
      post: { state: { content: '<post text>' }, questions: E.buildSlopQuestions(E.slopRuleFromConfig(config)) }
    }, null, 2);
    renderRules();
    renderCommentFilters();
  }

  async function refresh() { const response = await send(E.MESSAGE.GET_STATE); if (response.ok) { state = response; render(); } }

  function openRuleModal(rule) {
    editingId = rule ? rule.id : null; $('modalTitle').textContent = rule ? `编辑识别规范 · ${rule.name}` : '添加自定义识别规范';
    $('ruleName').value = rule ? rule.name : ''; $('ruleDescription').value = rule ? rule.description : ''; $('ruleInstructions').value = rule ? (rule.instructions || '') : ''; $('ruleTrueCriteria').value = rule ? (rule.trueCriteria || '') : ''; $('ruleFalseCriteria').value = rule ? (rule.falseCriteria || '') : '';
    $('ruleName').readOnly = Boolean(rule && rule.builtin); $('ruleDescription').readOnly = Boolean(rule && rule.builtin); $('ruleInstructions').readOnly = Boolean(rule && rule.builtin); $('ruleTrueCriteria').readOnly = Boolean(rule && rule.builtin); $('ruleFalseCriteria').readOnly = Boolean(rule && rule.builtin); $('modalBackdrop').classList.remove('ew-hidden'); $('ruleName').focus();
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
  $('savePostRecognitionButton').addEventListener('click', () => {
    const postRecognition = { ...state.config.postRecognition, description: $('postRecognitionDescription').value.trim(), instructions: $('postRecognitionInstructions').value.trim(), trueCriteria: $('postRecognitionTrueCriteria').value.trim(), falseCriteria: $('postRecognitionFalseCriteria').value.trim() };
    if (!postRecognition.description || !postRecognition.instructions || !postRecognition.trueCriteria || !postRecognition.falseCriteria) { showToast('帖子识别规范不能为空', 'error'); return; }
    persist({ postRecognition });
  });
  $('postFilteringEnabledToggle').addEventListener('change', (event) => persist({ postFiltering: { ...state.config.postFiltering, enabled: event.target.checked } }));
  $('postSlopThreshold').addEventListener('input', (event) => { $('postSlopThresholdValue').textContent = `${event.target.value}%`; });
  $('postSlopThreshold').addEventListener('change', (event) => persist({ postFiltering: { ...state.config.postFiltering, threshold: Number(event.target.value) / 100 } }));
  $('postShowStampToggle').addEventListener('change', (event) => persist({ postFiltering: { ...state.config.postFiltering, showStamp: event.target.checked } }));
  $('postShowOverlayToggle').addEventListener('change', (event) => persist({ postFiltering: { ...state.config.postFiltering, showOverlay: event.target.checked } }));
  $('postWeakenHoverToggle').addEventListener('change', (event) => persist({ postFiltering: { ...state.config.postFiltering, weakenOnHover: event.target.checked } }));
  $('concurrencySelect').addEventListener('change', (event) => persist({ maxConcurrency: Number(event.target.value) }));
  $('dailyLimitInput').addEventListener('change', (event) => persist({ dailyLimit: Number(event.target.value) }));
  $('cacheTtlSelect').addEventListener('change', (event) => persist({ cacheTtlHours: Number(event.target.value) }));
  $('addRuleButton').addEventListener('click', () => openRuleModal()); $('closeModalButton').addEventListener('click', closeRuleModal); $('cancelRuleButton').addEventListener('click', closeRuleModal); $('modalBackdrop').addEventListener('click', (event) => { if (event.target === $('modalBackdrop')) closeRuleModal(); });
  $('ruleForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = $('ruleName').value.trim(); const description = $('ruleDescription').value.trim(); const instructions = $('ruleInstructions').value.trim(); const trueCriteria = $('ruleTrueCriteria').value.trim(); const falseCriteria = $('ruleFalseCriteria').value.trim();
    if (!name || !description) return;
    let recognitionRules = state.config.commentRecognition.rules;
    let filteringRules = state.config.commentFiltering.rules;
    if (editingId) {
      recognitionRules = recognitionRules.map((rule) => rule.id === editingId ? { ...rule, name, description, instructions: instructions || `判断 \`content\` 是否符合以下过滤条件：${description}。`, trueCriteria: trueCriteria || description, falseCriteria } : rule);
      filteringRules = filteringRules.map((rule) => rule.id === editingId ? { ...rule, name } : rule);
    } else {
      const id = `custom_${Date.now().toString(36)}`;
      recognitionRules = [...recognitionRules, { id, name, description, instructions: instructions || `判断 \`content\` 是否符合以下过滤条件：${description}。`, trueCriteria: trueCriteria || description, falseCriteria, enabled: true, builtin: false }];
      filteringRules = [...filteringRules, { id, name, threshold: 0.8, enabled: true, builtin: false }];
    }
    if (await persist({ commentRecognition: { rules: recognitionRules }, commentFiltering: { rules: filteringRules } })) closeRuleModal();
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
