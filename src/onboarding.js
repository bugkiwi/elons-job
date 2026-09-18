(function () {
  'use strict';
  const E = globalThis.ElonsWork;
  const $ = (id) => document.getElementById(id);
  let step = 0;
  let selectedRules = E.clone(E.DEFAULT_RULES);

  function send(type, payload) { return new Promise((resolve) => chrome.runtime.sendMessage({ type, payload }, (response) => resolve(response || { ok: false, error: 'NO_RESPONSE' }))); }
  function showStep(next) { step = next; document.querySelectorAll('[data-step]').forEach((node) => node.classList.toggle('active', Number(node.dataset.step) === step)); document.querySelectorAll('.ew-stepper span').forEach((node, index) => node.classList.toggle('active', index <= step)); }
  function showError(message) { $('connectionStatus').textContent = message; $('connectionStatus').classList.remove('ew-hidden'); }
  function renderRules() { $('onboardingRules').replaceChildren(...selectedRules.map((rule) => { const label = document.createElement('label'); label.className = 'ew-check'; const input = document.createElement('input'); input.type = 'checkbox'; input.checked = true; input.dataset.ruleId = rule.id; const copy = document.createElement('span'); const title = document.createElement('strong'); title.textContent = rule.name; const desc = document.createElement('small'); desc.textContent = rule.description; copy.append(title, desc); label.append(input, copy); return label; })); }

  $('testConnectionButton').addEventListener('click', async () => { const key = $('onboardingKey').value.trim(); if (!key) { showError('请先输入 API Key。'); return; } $('testConnectionButton').disabled = true; $('testConnectionButton').textContent = '握手中…'; const result = await send(E.MESSAGE.TEST_CONNECTION, { apiKey: key }); $('testConnectionButton').disabled = false; $('testConnectionButton').textContent = '测试连接'; if (!result.ok) { showError(`连接失败：${result.error || 'API_UNAVAILABLE'}。请检查 Key 后重试。`); return; } $('connectionStatus').className = 'ew-help ew-success'; $('connectionStatus').textContent = `连接成功 · ${result.latencyMs}ms`; });
  $('nextButton').addEventListener('click', async () => { const key = $('onboardingKey').value.trim(); if (!key) { showError('请输入 TypeSafe API Key。'); return; } const result = await send(E.MESSAGE.TEST_CONNECTION, { apiKey: key }); if (!result.ok) { showError(`连接失败：${result.error || 'API_UNAVAILABLE'}。`); return; } await send(E.MESSAGE.SAVE_API_KEY, { apiKey: key }); renderRules(); showStep(1); });
  $('backButton').addEventListener('click', () => showStep(0));
  $('finishButton').addEventListener('click', async () => { const enabledIds = new Set(Array.from(document.querySelectorAll('#onboardingRules input:checked')).map((node) => node.dataset.ruleId)); const rules = selectedRules.map((rule) => ({ ...rule, enabled: enabledIds.has(rule.id) })); await send(E.MESSAGE.SAVE_CONFIG, { rules, enabled: true, onboardingCompleted: true }); showStep(2); });
  $('openSettingsButton').addEventListener('click', () => send(E.MESSAGE.OPEN_SETTINGS));
  $('doneButton').addEventListener('click', () => window.close());
  renderRules();
})();
