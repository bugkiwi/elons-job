(function () {
  'use strict';

  const E = globalThis.ElonsWork;
  const state = {
    config: null,
    route: '',
    processed: new Map(),
    revealed: new Set(),
    controls: new Map(),
    boundAnchors: new WeakSet(),
    anchorControls: new WeakMap(),
    pageChecked: 0,
    pageHidden: 0,
    pageSafe: 0,
    pagePending: 0,
    pageErrors: 0,
    pageLastLatency: 0,
    scanTimer: null,
    positionFrame: null,
    hideTimers: new WeakMap(),
    monitor: null,
    started: false,
    hasApiKey: false
  };

  function send(type, payload) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type, payload }, (response) => {
          resolve(response || { ok: false, error: 'NO_RESPONSE' });
        });
      } catch (_) {
        resolve({ ok: false, error: 'RUNTIME_UNAVAILABLE' });
      }
    });
  }

  function injectStyles() {
    if (document.querySelector('link[data-elon-work-style]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.dataset.elonWorkStyle = 'true';
    link.href = chrome.runtime.getURL('src/styles/content.css');
    (document.head || document.documentElement).appendChild(link);
  }

  function activeDetail() {
    return E.isTweetDetailUrl(location.href);
  }

  function articleKey(comment) {
    return `${comment.tweetId}:${comment.author || ''}:${comment.text}`;
  }

  function report(action) {
    send(E.MESSAGE.RECORD_COMMENT_EVENT, {
      action,
      page: {
        checked: state.pageChecked,
        hidden: state.pageHidden,
        safe: state.pageSafe,
        pending: state.pagePending,
        errors: state.pageErrors,
        latencyMs: state.pageLastLatency
      }
    });
    renderMonitor();
  }

  function statusOf(result) {
    if (!result) return null;
    if (result.pending) return 'pending';
    if (result.ok) return result.shouldHide ? 'hidden' : 'safe';
    return 'error';
  }

  function transitionPageStatus(previous, next) {
    const oldStatus = statusOf(previous);
    const newStatus = statusOf(next);
    if (oldStatus === 'hidden') state.pageHidden = Math.max(0, state.pageHidden - 1);
    if (oldStatus === 'safe') state.pageSafe = Math.max(0, state.pageSafe - 1);
    if (oldStatus === 'pending') state.pagePending = Math.max(0, state.pagePending - 1);
    if (oldStatus === 'error') state.pageErrors = Math.max(0, state.pageErrors - 1);
    if (newStatus === 'hidden') state.pageHidden += 1;
    if (newStatus === 'safe') state.pageSafe += 1;
    if (newStatus === 'pending') state.pagePending += 1;
    if (newStatus === 'error') state.pageErrors += 1;
  }

  function removePlaceholder(article) {
    const placeholder = article.previousElementSibling;
    if (placeholder && placeholder.matches('[data-elon-work-placeholder]')) placeholder.remove();
    article.classList.remove('elon-work-hidden', 'elon-work-pending');
    article.style.removeProperty('display');
    syncControlsForArticle(article);
  }

  function clearAppliedStates() {
    document.querySelectorAll('[data-elon-work-state="hidden"], [data-elon-work-state="pending"]').forEach((article) => {
      removePlaceholder(article);
      article.removeAttribute('data-elon-work-state');
    });
    document.querySelectorAll('[data-elon-work-placeholder]').forEach((placeholder) => placeholder.remove());
  }

  function createPlaceholder(article, comment, matches) {
    const placeholder = document.createElement('div');
    placeholder.dataset.elonWorkPlaceholder = 'true';
    placeholder.className = 'elon-work-placeholder';
    if (state.config && state.config.showPlaceholder === false) placeholder.classList.add('compact');
    placeholder.setAttribute('role', 'status');

    const icon = document.createElement('span');
    icon.className = 'elon-work-placeholder-icon';
    icon.textContent = '🙈';
    placeholder.appendChild(icon);

    const copy = document.createElement('div');
    copy.className = 'elon-work-placeholder-copy';
    const title = document.createElement('strong');
    title.textContent = state.config && state.config.showPlaceholder === false ? '已隐藏一条评论' : 'Elon的工作隐藏了一条评论';
    copy.appendChild(title);
    const details = document.createElement('div');
    details.className = 'elon-work-placeholder-details';
    const config = state.config || {};
    details.textContent = state.config && state.config.showPlaceholder === false ? '点击“查看评论”恢复' : matches.map((match) => {
      const score = config.showConfidence === false ? '' : ` · ${Math.round(match.probability * 100)}%`;
      return `${match.name}${score}`;
    }).join('  ');
    copy.appendChild(details);
    placeholder.appendChild(copy);

    const restore = document.createElement('button');
    restore.type = 'button';
    restore.className = 'elon-work-restore';
    restore.textContent = '查看评论';
    restore.addEventListener('click', () => {
      state.revealed.add(articleKey(comment));
      article.dataset.elonWorkRevealed = 'true';
      article.dataset.elonWorkState = 'safe';
      const control = Array.from(state.controls.values()).find((candidate) => candidate.article === article);
      const previous = control && state.processed.get(control.identity);
      const revealedResult = { ok: true, shouldHide: false, results: previous && previous.results || {}, matches: [] };
      transitionPageStatus(previous, revealedResult);
      if (control) state.processed.set(control.identity, revealedResult);
      removePlaceholder(article);
      report('revealed');
    });
    placeholder.appendChild(restore);
    return placeholder;
  }

  function applySafe(article) {
    if (article.classList.contains('elon-work-hidden') || article.style.display === 'none') removePlaceholder(article);
    article.dataset.elonWorkState = 'safe';
    article.classList.remove('elon-work-pending');
    article.style.removeProperty('visibility');
    syncControlsForArticle(article);
  }

  function applyHidden(article, comment, matches) {
    article.dataset.elonWorkState = 'hidden';
    article.classList.remove('elon-work-pending');
    article.classList.add('elon-work-hidden');
    article.style.display = 'none';
    if (!article.previousElementSibling || !article.previousElementSibling.matches('[data-elon-work-placeholder]')) {
      article.parentNode && article.parentNode.insertBefore(createPlaceholder(article, comment, matches), article);
    }
    syncControlsForArticle(article);
  }

  function getControlAnchor(control) {
    if (!control || !control.article || !control.article.isConnected) return null;
    const hidden = control.article.classList.contains('elon-work-hidden') || control.article.style.display === 'none';
    return hidden ? control.article.previousElementSibling : control.article;
  }

  function clearHideTimer(host) {
    const timer = state.hideTimers.get(host);
    if (timer) clearTimeout(timer);
    state.hideTimers.delete(host);
  }

  function showControl(control) {
    if (!control) return;
    clearHideTimer(control.host);
    control.host.classList.add('is-visible');
    positionCheckHost(control);
  }

  function hideControl(control) {
    if (!control) return;
    clearHideTimer(control.host);
    const timer = setTimeout(() => {
      if (!control.host.matches(':hover') && !control.host.matches(':focus-within')) control.host.classList.remove('is-visible');
    }, 180);
    state.hideTimers.set(control.host, timer);
  }

  function bindAnchor(anchor, control) {
    if (!anchor) return;
    state.anchorControls.set(anchor, control);
    if (state.boundAnchors.has(anchor)) return;
    state.boundAnchors.add(anchor);
    anchor.addEventListener('mouseenter', () => showControl(state.anchorControls.get(anchor)));
    anchor.addEventListener('mouseleave', () => hideControl(state.anchorControls.get(anchor)));
  }

  function syncControlsForArticle(article) {
    for (const control of state.controls.values()) {
      if (control.article !== article) continue;
      const anchor = getControlAnchor(control);
      bindAnchor(anchor, control);
      positionCheckHost(control);
    }
  }

  function positionCheckHost(control) {
    if (!control || !control.host) return;
    const anchor = getControlAnchor(control);
    if (!anchor) {
      control.host.classList.remove('is-visible');
      return;
    }
    const rect = anchor.getBoundingClientRect();
    if (!rect.width && !rect.height) {
      control.host.classList.remove('is-visible');
      return;
    }
    const width = 58;
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.right - width - 8));
    const top = Math.max(8, Math.min(window.innerHeight - 38, rect.top + 8));
    control.host.style.left = `${left}px`;
    control.host.style.top = `${top}px`;
  }

  function positionAllControls() {
    state.positionFrame = null;
    for (const control of state.controls.values()) positionCheckHost(control);
  }

  function requestPosition() {
    if (state.positionFrame) return;
    const schedule = window.requestAnimationFrame || ((callback) => setTimeout(callback, 16));
    state.positionFrame = schedule(positionAllControls);
  }

  function ruleName(ruleId) {
    const rule = (state.config && state.config.rules || []).find((candidate) => candidate.id === ruleId);
    return rule ? rule.name : ruleId;
  }

  function renderResultRows(control, result) {
    control.rows.replaceChildren();
    if (!result || !result.ok || !result.results) return;
    for (const [ruleId, probability] of Object.entries(result.results)) {
      const row = document.createElement('div');
      row.className = 'elon-work-check-row';
      const name = document.createElement('span');
      name.textContent = ruleName(ruleId);
      const score = document.createElement('strong');
      score.textContent = `${Math.round(Number(probability || 0) * 100)}%`;
      row.append(name, score);
      control.rows.appendChild(row);
    }
  }

  function renderCheckControl(control) {
    const result = state.processed.get(control.identity);
    const pending = Boolean(result && result.pending);
    control.button.textContent = pending ? '检查中' : '检查';
    control.button.disabled = pending;
    control.popoverTitle.textContent = '评论检查';
    control.recheck.hidden = true;
    control.rows.replaceChildren();

    if (!state.config || !state.config.enabled) {
      control.status.textContent = '保护已暂停';
      control.detail.textContent = '打开插件后可恢复检查。';
    } else if (!state.hasApiKey) {
      control.status.textContent = '等待 API Key';
      control.detail.textContent = '先连接 TypeSafe，评论会保持显示。';
      control.recheck.hidden = false;
      control.recheck.textContent = '打开设置';
    } else if (!result) {
      control.status.textContent = '尚未检查';
      control.detail.textContent = '点击按钮开始检查。';
      control.recheck.hidden = false;
      control.recheck.textContent = '开始检查';
    } else if (pending) {
      control.status.textContent = '正在检查…';
      control.detail.textContent = 'TypeSafe 正在返回结果。';
    } else if (result.ok) {
      control.status.textContent = result.shouldHide ? '命中隐藏规则' : '未命中隐藏阈值';
      control.detail.textContent = result.shouldHide ? '这条评论已按当前规则处理。' : '这条评论当前保持显示。';
      control.recheck.hidden = false;
      control.recheck.textContent = '重新检查';
      renderResultRows(control, result);
    } else {
      control.status.textContent = '检查失败，保持显示';
      control.detail.textContent = `错误：${result.error || 'API_UNAVAILABLE'}（Fail Open）`;
      control.recheck.hidden = false;
      control.recheck.textContent = '重新检查';
    }
  }

  function createCheckControl(article, comment, identity, hash) {
    const host = document.createElement('div');
    host.className = 'elon-work-check-host';
    host.setAttribute('aria-label', '评论检查');

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'elon-work-check-button';
    button.textContent = '检查';
    button.title = '检查这条评论';
    host.appendChild(button);

    const popover = document.createElement('div');
    popover.className = 'elon-work-check-popover';
    popover.setAttribute('role', 'dialog');
    const popoverTitle = document.createElement('strong');
    popoverTitle.className = 'elon-work-check-title';
    const status = document.createElement('div');
    status.className = 'elon-work-check-status';
    const detail = document.createElement('p');
    detail.className = 'elon-work-check-detail';
    const rows = document.createElement('div');
    rows.className = 'elon-work-check-rows';
    const recheck = document.createElement('button');
    recheck.type = 'button';
    recheck.className = 'elon-work-check-recheck';
    popover.append(popoverTitle, status, detail, rows, recheck);
    host.appendChild(popover);

    const control = { host, button, popover, popoverTitle, status, detail, rows, recheck, article, comment, identity, hash };
    host.addEventListener('mouseenter', () => showControl(control));
    host.addEventListener('mouseleave', () => hideControl(control));
    host.addEventListener('focusin', () => showControl(control));
    host.addEventListener('focusout', () => hideControl(control));
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!state.hasApiKey) {
        send(E.MESSAGE.OPEN_SETTINGS);
        return;
      }
      const result = state.processed.get(control.identity);
      classifyArticle(control.article, control.comment, { force: Boolean(result && !result.pending), hash: control.hash, identity: control.identity });
    });
    recheck.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!state.hasApiKey) {
        send(E.MESSAGE.OPEN_SETTINGS);
        return;
      }
      classifyArticle(control.article, control.comment, { force: true, hash: control.hash, identity: control.identity });
    });
    document.body.appendChild(host);
    return control;
  }

  function ensureCheckControl(article, comment, identity, hash) {
    let control = state.controls.get(identity);
    if (!control) {
      control = createCheckControl(article, comment, identity, hash);
      state.controls.set(identity, control);
    } else {
      control.article = article;
      control.comment = comment;
      control.hash = hash;
    }
    bindAnchor(getControlAnchor(control), control);
    renderCheckControl(control);
    positionCheckHost(control);
    return control;
  }

  function clearControls() {
    for (const control of state.controls.values()) control.host.remove();
    state.controls.clear();
  }

  function renderMonitor() {
    const monitor = state.monitor;
    if (!monitor) return;
    const detail = !activeDetail() ? '仅在 Tweet Detail 检查回复' : !state.config || !state.config.enabled ? '保护已暂停' : !state.hasApiKey ? '等待配置 TypeSafe API Key' : state.pagePending ? '正在检查当前页面' : state.pageErrors ? '部分检查失败，评论保持显示' : '当前页面检查完成';
    monitor.status.textContent = detail;
    monitor.summary.textContent = `已检查 ${state.pageChecked} · 隐藏 ${state.pageHidden}`;
    monitor.checked.textContent = String(state.pageChecked);
    monitor.hidden.textContent = String(state.pageHidden);
    monitor.pending.textContent = String(state.pagePending);
    monitor.safe.textContent = String(state.pageSafe);
    monitor.latency.textContent = state.pageLastLatency ? `${state.pageLastLatency}ms` : '—';
    monitor.api.textContent = state.hasApiKey ? 'TypeSafe 已连接' : '未连接 TypeSafe';
    monitor.dot.className = `elon-work-monitor-dot ${state.pagePending ? 'is-busy' : state.hasApiKey && state.config && state.config.enabled ? 'is-ready' : 'is-warn'}`;
  }

  function createMonitor() {
    if (state.monitor || !document.body) return;
    const root = document.createElement('aside');
    root.className = 'elon-work-monitor';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'elon-work-monitor-button';
    button.setAttribute('aria-expanded', 'false');
    const dot = document.createElement('span');
    dot.className = 'elon-work-monitor-dot';
    const label = document.createElement('span');
    label.textContent = '检查情况';
    const summary = document.createElement('small');
    summary.className = 'elon-work-monitor-summary';
    button.append(dot, label, summary);

    const panel = document.createElement('div');
    panel.className = 'elon-work-monitor-panel';
    const title = document.createElement('strong');
    title.textContent = '当前检查情况';
    const status = document.createElement('p');
    status.className = 'elon-work-monitor-status';
    const grid = document.createElement('div');
    grid.className = 'elon-work-monitor-grid';
    const metric = (name) => {
      const item = document.createElement('div');
      const value = document.createElement('strong');
      const caption = document.createElement('span');
      caption.textContent = name;
      item.append(value, caption);
      grid.appendChild(item);
      return value;
    };
    const checked = metric('已检查');
    const hidden = metric('已隐藏');
    const pending = metric('待处理');
    const safe = metric('已放行');
    const latency = metric('最近延迟');
    const api = document.createElement('p');
    api.className = 'elon-work-monitor-api';
    const settings = document.createElement('button');
    settings.type = 'button';
    settings.className = 'elon-work-monitor-settings';
    settings.textContent = '打开设置';
    panel.append(title, status, grid, api, settings);
    root.append(button, panel);
    button.addEventListener('click', () => {
      const open = !root.classList.contains('is-open');
      root.classList.toggle('is-open', open);
      button.setAttribute('aria-expanded', String(open));
    });
    settings.addEventListener('click', () => send(E.MESSAGE.OPEN_SETTINGS));
    document.body.appendChild(root);
    state.monitor = { root, button, dot, summary, status, checked, hidden, pending, safe, latency, api };
    renderMonitor();
  }

  async function classifyArticle(article, comment, options) {
    const config = state.config || E.createDefaultConfig();
    const opts = options || {};
    const key = articleKey(comment);
    const inspectionContent = E.composeComment(comment);
    const hash = opts.hash || await E.hashText(inspectionContent);
    const identity = opts.identity || `${key}:${hash}`;
    const control = ensureCheckControl(article, comment, identity, hash);
    const previous = state.processed.get(identity);
    if (opts.force) {
      state.revealed.delete(key);
      article.removeAttribute('data-elon-work-revealed');
    } else if (state.revealed.has(key) || article.dataset.elonWorkRevealed === 'true') {
      return;
    }
    if (!opts.force && previous) {
      if (previous.ok && previous.shouldHide) applyHidden(article, comment, previous.matches || []);
      else if (previous.ok) applySafe(article);
      renderCheckControl(control);
      return;
    }
    if (opts.force && previous && previous.pending) return;

    const pending = { pending: true };
    transitionPageStatus(previous, pending);
    state.processed.set(identity, pending);
    article.dataset.elonWorkState = 'pending';
    if (config.preload) article.classList.add('elon-work-pending');
    if (!previous) {
      state.pageChecked += 1;
      report('checked');
    } else {
      report('recheck');
    }
    renderCheckControl(control);
    const response = await send(E.MESSAGE.CLASSIFY_COMMENT, {
      tweetId: comment.tweetId,
      text: inspectionContent,
      force: Boolean(opts.force)
    });
    transitionPageStatus(pending, response);
    state.processed.set(identity, response || { ok: false, error: 'NO_RESPONSE' });
    if (response && Number.isFinite(response.latencyMs)) state.pageLastLatency = response.latencyMs;
    renderCheckControl(control);
    report(response && response.ok && response.shouldHide ? 'hidden' : response && response.ok ? 'safe' : 'error');
    if (!article.isConnected) return;
    const current = E.extractComment(article);
    if (!current || articleKey(current) !== key) return;
    if (response && response.ok && response.shouldHide) applyHidden(article, comment, response.matches || []);
    else applySafe(article);
  }

  async function scan() {
    if (!state.started || !activeDetail()) return;
    const rootId = E.rootTweetId(location.href);
    const articles = Array.from(document.querySelectorAll(E.SELECTORS.tweet));
    const candidates = [];
    const templateCounts = new Map();
    for (const article of articles) {
      if (!E.isReplyArticle(article, location.href) || E.tweetIdFromArticle(article) === rootId) continue;
      const comment = E.extractComment(article);
      if (!comment) continue;
      const templateKey = E.templateFingerprint(comment.text);
      if (templateKey) templateCounts.set(templateKey, (templateCounts.get(templateKey) || 0) + 1);
      candidates.push({ article, comment, templateKey });
    }
    for (const candidate of candidates) {
      const { article, comment, templateKey } = candidate;
      const enrichedComment = { ...comment, templateCount: templateKey ? templateCounts.get(templateKey) || 1 : 0 };
      const hash = await E.hashText(E.composeComment(enrichedComment));
      const identity = `${articleKey(comment)}:${hash}`;
      ensureCheckControl(article, enrichedComment, identity, hash);
      if (!state.config || !state.config.enabled || !state.hasApiKey || article.dataset.elonWorkRevealed === 'true') continue;
      classifyArticle(article, enrichedComment, { hash, identity });
    }
    renderMonitor();
  }

  function scheduleScan() {
    clearTimeout(state.scanTimer);
    state.scanTimer = setTimeout(scan, 180);
  }

  function resetRouteIfNeeded() {
    const next = location.href;
    if (next === state.route) return;
    state.route = next;
    state.processed.clear();
    state.revealed.clear();
    state.pageChecked = 0;
    state.pageHidden = 0;
    state.pageSafe = 0;
    state.pagePending = 0;
    state.pageErrors = 0;
    state.pageLastLatency = 0;
    clearControls();
    clearAppliedStates();
    renderMonitor();
    scheduleScan();
  }

  async function start() {
    injectStyles();
    createMonitor();
    const response = await send(E.MESSAGE.GET_STATE);
    state.config = response && response.config ? response.config : E.createDefaultConfig();
    state.hasApiKey = Boolean(response && response.hasApiKey);
    state.route = location.href;
    state.started = true;
    renderMonitor();
    if (activeDetail()) scheduleScan();

    const isExtensionNode = (node) => node && node.nodeType === 1 && (node.matches('.elon-work-check-host, .elon-work-monitor, [data-elon-work-placeholder]') || Boolean(node.closest && node.closest('.elon-work-check-host, .elon-work-monitor, [data-elon-work-placeholder]')));
    const observer = new MutationObserver((mutations) => {
      const relevant = mutations.some((mutation) => {
        if (isExtensionNode(mutation.target)) return false;
        return Array.from(mutation.addedNodes).concat(Array.from(mutation.removedNodes)).some((node) => !isExtensionNode(node));
      });
      if (relevant && activeDetail()) scheduleScan();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('scroll', requestPosition, true);
    window.addEventListener('resize', requestPosition);
    setInterval(resetRouteIfNeeded, 750);
    // Poll only the sanitized background state. This keeps secrets in the
    // service worker while still picking up settings changes promptly.
    setInterval(async () => {
      const next = await send(E.MESSAGE.GET_STATE);
      if (!next || !next.config) return;
      const changed = JSON.stringify(next.config) !== JSON.stringify(state.config) || Boolean(next.hasApiKey) !== state.hasApiKey;
      if (!changed) return;
      state.config = next.config;
      state.hasApiKey = Boolean(next.hasApiKey);
      state.processed.clear();
      if (!state.config.enabled || !state.hasApiKey) clearAppliedStates();
      for (const control of state.controls.values()) renderCheckControl(control);
      renderMonitor();
      scheduleScan();
    }, 3000);
  }

  start();
})();
