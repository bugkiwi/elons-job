(function () {
  'use strict';

  const E = globalThis.ElonsWork;
  const state = {
    config: null,
    route: '',
    processed: new Map(),
    slopProcessed: new Map(),
    slopStatuses: new Map(),
    slopStamps: new Set(),
    slopArticleEntries: new WeakMap(),
    commentStatuses: new Map(),
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
    boundSlopArticles: new WeakSet(),
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

  function transitionPageStatus(commentKey, next) {
    const previous = state.commentStatuses.get(commentKey);
    const oldStatus = statusOf(previous);
    const newStatus = statusOf(next);
    if (!oldStatus && newStatus) state.pageChecked += 1;
    if (oldStatus && !newStatus) state.pageChecked = Math.max(0, state.pageChecked - 1);
    if (oldStatus === 'hidden') state.pageHidden = Math.max(0, state.pageHidden - 1);
    if (oldStatus === 'safe') state.pageSafe = Math.max(0, state.pageSafe - 1);
    if (oldStatus === 'pending') state.pagePending = Math.max(0, state.pagePending - 1);
    if (oldStatus === 'error') state.pageErrors = Math.max(0, state.pageErrors - 1);
    if (newStatus === 'hidden') state.pageHidden += 1;
    if (newStatus === 'safe') state.pageSafe += 1;
    if (newStatus === 'pending') state.pagePending += 1;
    if (newStatus === 'error') state.pageErrors += 1;
    if (next) state.commentStatuses.set(commentKey, next);
    else state.commentStatuses.delete(commentKey);
  }

  function transitionSlopStatus(identity, next) {
    if (next) state.slopStatuses.set(identity, next);
    else state.slopStatuses.delete(identity);
  }

  function removePlaceholder(article) {
    const placeholder = article.previousElementSibling;
    if (placeholder && placeholder.matches('[data-elon-work-placeholder]')) placeholder.remove();
    article.classList.remove('elon-work-hidden', 'elon-work-pending');
    article.style.removeProperty('display');
    syncControlsForArticle(article);
  }

  function removeSlopStamp(article) {
    if (!article) return;
    const entry = state.slopArticleEntries.get(article);
    if (entry) {
      entry.host.remove();
      state.slopStamps.delete(entry);
      state.slopArticleEntries.delete(article);
    }
    article.classList.remove('elon-work-slop-post');
  }

  function clearSlopStamps() {
    for (const entry of state.slopStamps) {
      entry.host.remove();
      entry.article.classList.remove('elon-work-slop-post');
      state.slopArticleEntries.delete(entry.article);
    }
    state.slopStamps.clear();
  }

  function clearAppliedStates() {
    document.querySelectorAll('[data-elon-work-state="hidden"], [data-elon-work-state="pending"]').forEach((article) => {
      removePlaceholder(article);
      article.removeAttribute('data-elon-work-state');
      setControlsSuppressed(article, false);
    });
    document.querySelectorAll('[data-elon-work-placeholder]').forEach((placeholder) => placeholder.remove());
    clearSlopStamps();
  }

  function bindSlopHover(article) {
    if (!article || state.boundSlopArticles.has(article)) return;
    state.boundSlopArticles.add(article);
    article.addEventListener('mouseenter', () => {
      const entry = state.slopArticleEntries.get(article);
      if (entry && (!state.config || !state.config.postFiltering || state.config.postFiltering.weakenOnHover !== false)) entry.host.classList.add('is-hovered');
    });
    article.addEventListener('mouseleave', () => {
      const entry = state.slopArticleEntries.get(article);
      if (entry) entry.host.classList.remove('is-hovered');
    });
  }

  function ensureSlopStamp(article, post, identity, probability) {
    const filtering = state.config && state.config.postFiltering || {};
    const showStamp = filtering.showStamp !== false;
    const showOverlay = filtering.showOverlay !== false;
    if (!showStamp && !showOverlay) {
      removeSlopStamp(article);
      return;
    }
    const current = state.slopArticleEntries.get(article);
    if (current && current.identity === identity) {
      current.probability = probability;
      if (current.host.parentElement !== article) article.appendChild(current.host);
      if (current.stamp) current.stamp.hidden = !showStamp;
      if (current.veil) current.veil.hidden = !showOverlay;
      article.classList.add('elon-work-slop-post');
      return;
    }
    removeSlopStamp(article);
    const host = document.createElement('span');
    host.dataset.elonWorkSlopStamp = 'true';
    host.className = 'elon-work-slop-stamp-host';
    host.setAttribute('role', 'img');
    host.setAttribute('aria-label', 'SLOP 内容标记');
    host.title = `SLOP · ${Math.round(Number(probability || 0) * 100)}%`;

    const stamp = document.createElement('span');
    stamp.className = 'elon-work-slop-stamp';
    stamp.textContent = 'SLOP';

    const veil = document.createElement('span');
    veil.className = 'elon-work-slop-veil';
    veil.hidden = !showOverlay;
    stamp.hidden = !showStamp;
    host.append(veil, stamp);
    article.appendChild(host);

    const entry = { article, host, stamp, veil, identity, post, probability };
    state.slopStamps.add(entry);
    state.slopArticleEntries.set(article, entry);
    article.classList.add('elon-work-slop-post');
    bindSlopHover(article);
    if (article.matches && article.matches(':hover')) host.classList.add('is-hovered');
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
      if (config.showConfidence === false) return match.name;
      const score = match.source === 'combined-risk-signal'
        ? ` · 合计 ${Math.round(match.combinedScore * 100)}%`
        : ` · ${Math.round(match.probability * 100)}%`;
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
      transitionPageStatus(articleKey(comment), revealedResult);
      if (control) state.processed.set(control.identity, revealedResult);
      applySafe(article);
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
    setControlsSuppressed(article, false);
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
    setControlsSuppressed(article, true);
    syncControlsForArticle(article);
  }

  function getControlAnchor(control) {
    if (!control || !control.article || !control.article.isConnected) return null;
    const hidden = control.article.classList.contains('elon-work-hidden') || control.article.style.display === 'none';
    if (hidden) return null;
    if (control.kind === 'slop') {
      return control.article.querySelector('time')
        || control.article.querySelector(E.SELECTORS.tweetLink)
        || control.article;
    }
    return control.article.querySelector(E.SELECTORS.userName) || control.article;
  }

  function getHoverAnchor(control) {
    if (!control || !control.article || !control.article.isConnected) return null;
    const hidden = control.article.classList.contains('elon-work-hidden') || control.article.style.display === 'none';
    return hidden ? null : control.article;
  }

  function setControlsSuppressed(article, suppressed) {
    const disabled = suppressed || Boolean(state.config && state.config.showCheckControls === false);
    for (const control of state.controls.values()) {
      if (control.article !== article) continue;
      control.host.hidden = disabled;
      control.host.setAttribute('aria-hidden', String(disabled));
      if (disabled) control.host.classList.remove('is-visible');
    }
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
      bindAnchor(getHoverAnchor(control), control);
      positionCheckHost(control);
    }
  }

  function positionCheckHost(control) {
    if (!control || !control.host) return;
    if (control.host.hidden) return;
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
    const width = 54;
    const height = 26;
    const gap = 6;
    const preferredLeft = rect.right + gap;
    const left = preferredLeft + width <= window.innerWidth - 8
      ? preferredLeft
      : Math.max(8, rect.left - width - gap);
    const top = Math.max(8, Math.min(window.innerHeight - height - 8, rect.top + (rect.height - height) / 2));
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
    if (!result || !result.ok) return;
    if (control.kind === 'slop') {
      const row = document.createElement('div');
      row.className = 'elon-work-check-row';
      const name = document.createElement('span');
      name.textContent = 'SLOP';
      const score = document.createElement('strong');
      score.textContent = `${Math.round(Number(result.probability || 0) * 100)}%`;
      row.append(name, score);
      control.rows.appendChild(row);
      return;
    }
    if (!result.results) return;
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
    const slop = control.kind === 'slop';
    const result = (slop ? state.slopProcessed : state.processed).get(control.identity);
    const slopPaused = slop && (!state.config || state.config.postRecognition && state.config.postRecognition.enabled === false || state.config.postFiltering && state.config.postFiltering.enabled === false);
    const pending = Boolean(result && result.pending);
    control.button.textContent = pending ? '检查中' : '检查';
    control.button.disabled = pending;
    control.popoverTitle.textContent = slop ? '帖子 SLOP 检查' : '评论检查';
    control.recheck.hidden = true;
    control.rows.replaceChildren();

    if (!state.config || !state.config.enabled) {
      control.status.textContent = '保护已暂停';
      control.detail.textContent = '打开插件后可恢复检查。';
    } else if (!state.hasApiKey) {
      control.status.textContent = '等待 API Key';
      control.detail.textContent = slop ? '先连接 TypeSafe，帖子会保持原样。' : '先连接 TypeSafe，评论会保持显示。';
      control.recheck.hidden = false;
      control.recheck.textContent = '打开设置';
    } else if (slopPaused) {
      control.status.textContent = '帖子过滤已暂停';
      control.detail.textContent = '可在设置中心的“帖子过滤规范”中重新启用。';
    } else if (!result) {
      control.status.textContent = '尚未检查';
      control.detail.textContent = '点击按钮开始检查。';
      control.recheck.hidden = false;
      control.recheck.textContent = '开始检查';
    } else if (pending) {
      control.status.textContent = '正在检查…';
      control.detail.textContent = 'TypeSafe 正在返回结果。';
    } else if (result.ok) {
      if (slop) {
        control.status.textContent = result.shouldSlop ? '命中 SLOP' : '未命中 SLOP';
        control.detail.textContent = result.shouldSlop ? '已在帖子正文上叠加 SLOP 印章。' : '这条帖子保持原样。';
      } else {
        control.status.textContent = result.shouldHide ? '命中隐藏规则' : '未命中隐藏阈值';
        control.detail.textContent = result.shouldHide ? '这条评论已按当前规则处理。' : '这条评论当前保持显示。';
      }
      control.recheck.hidden = false;
      control.recheck.textContent = '重新检查';
      renderResultRows(control, result);
    } else {
      control.status.textContent = slop ? '检查失败，保持原样' : '检查失败，保持显示';
      control.detail.textContent = `错误：${result.error || 'API_UNAVAILABLE'}（Fail Open）`;
      control.recheck.hidden = false;
      control.recheck.textContent = '重新检查';
    }
  }

  function createCheckControl(article, comment, identity, hash, kind) {
    const slop = kind === 'slop';
    const host = document.createElement('div');
    host.className = 'elon-work-check-host';
    host.setAttribute('aria-label', slop ? '帖子检查' : '评论检查');

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'elon-work-check-button';
    button.textContent = '检查';
    button.title = slop ? '检查这条帖子' : '检查这条评论';
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

    const control = { host, button, popover, popoverTitle, status, detail, rows, recheck, article, comment, identity, hash, kind: kind || 'comment' };
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
      const result = (control.kind === 'slop' ? state.slopProcessed : state.processed).get(control.identity);
      if (control.kind === 'slop') classifySlopArticle(control.article, control.comment, control.identity, { force: Boolean(result && !result.pending) });
      else classifyArticle(control.article, control.comment, { force: Boolean(result && !result.pending), hash: control.hash, identity: control.identity });
    });
    recheck.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!state.hasApiKey) {
        send(E.MESSAGE.OPEN_SETTINGS);
        return;
      }
      if (control.kind === 'slop') classifySlopArticle(control.article, control.comment, control.identity, { force: true });
      else classifyArticle(control.article, control.comment, { force: true, hash: control.hash, identity: control.identity });
    });
    document.body.appendChild(host);
    return control;
  }

  function ensureCheckControl(article, comment, identity, hash, kind) {
    for (const [existingIdentity, existing] of state.controls.entries()) {
      if (existing.article === article && existingIdentity !== identity) {
        existing.host.remove();
        state.controls.delete(existingIdentity);
      }
    }
    let control = state.controls.get(identity);
    if (!control) {
      control = createCheckControl(article, comment, identity, hash, kind);
      state.controls.set(identity, control);
    } else {
      control.article = article;
      control.comment = comment;
      control.hash = hash;
      control.kind = kind || control.kind || 'comment';
    }
    setControlsSuppressed(article, article.classList.contains('elon-work-hidden') || article.style.display === 'none');
    bindAnchor(getHoverAnchor(control), control);
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
    const slopResults = Array.from(state.slopStatuses.values());
    const slopChecked = slopResults.filter((result) => result && !result.pending && result.ok).length;
    const slopPending = slopResults.filter((result) => result && result.pending).length;
    const slopErrors = slopResults.filter((result) => result && !result.pending && !result.ok).length;
    const totalChecked = state.pageChecked + slopChecked;
    const totalPending = state.pagePending + slopPending;
    const totalErrors = state.pageErrors + slopErrors;
    const detail = !state.config || !state.config.enabled ? '保护已暂停' : !state.hasApiKey ? '等待配置 TypeSafe API Key' : totalPending ? '正在检查当前页面' : totalErrors ? '部分检查失败，内容保持显示' : activeDetail() ? '回复检查与 SLOP 标记完成' : 'SLOP 标记完成';
    monitor.status.textContent = detail;
    monitor.summary.textContent = `已检查 ${totalChecked} · 隐藏 ${state.pageHidden} · SLOP ${slopChecked} · 盖章 ${state.slopStamps.size}`;
    monitor.checked.textContent = String(totalChecked);
    monitor.hidden.textContent = String(state.pageHidden);
    monitor.pending.textContent = String(totalPending);
    monitor.safe.textContent = String(state.pageSafe + slopResults.filter((result) => result && result.ok && !result.shouldSlop).length);
    monitor.latency.textContent = state.pageLastLatency ? `${state.pageLastLatency}ms` : '—';
    monitor.api.textContent = state.hasApiKey ? 'TypeSafe 已连接' : '未连接 TypeSafe';
    monitor.dot.className = `elon-work-monitor-dot ${totalPending ? 'is-busy' : state.hasApiKey && state.config && state.config.enabled ? 'is-ready' : 'is-warn'}`;
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
    const knownComment = state.commentStatuses.has(key);
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
    transitionPageStatus(key, pending);
    state.processed.set(identity, pending);
    article.dataset.elonWorkState = 'pending';
    if (config.preload) article.classList.add('elon-work-pending');
    report(knownComment ? 'recheck' : 'checked');
    renderCheckControl(control);
    const response = await send(E.MESSAGE.CLASSIFY_COMMENT, {
      tweetId: comment.tweetId,
      text: inspectionContent,
      force: Boolean(opts.force)
    });
    transitionPageStatus(key, response);
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

  async function classifySlopArticle(article, post, identity, options) {
    const opts = options || {};
    const control = ensureCheckControl(article, post, identity, '', 'slop');
    const slopPaused = !state.config || state.config.postRecognition && state.config.postRecognition.enabled === false || state.config.postFiltering && state.config.postFiltering.enabled === false;
    if (slopPaused) {
      removeSlopStamp(article);
      renderCheckControl(control);
      renderMonitor();
      return;
    }
    const previous = state.slopProcessed.get(identity);
    if (!opts.force && previous && previous.pending) return;
    if (!opts.force && previous && previous.ok) {
      if (previous.shouldSlop) ensureSlopStamp(article, post, identity, previous.probability);
      else removeSlopStamp(article);
      renderCheckControl(control);
      renderMonitor();
      return;
    }
    if (opts.force && previous && previous.pending) return;

    const pending = { pending: true };
    state.slopProcessed.set(identity, pending);
    transitionSlopStatus(identity, pending);
    renderCheckControl(control);
    renderMonitor();
    const response = await send(E.MESSAGE.CLASSIFY_SLOP, {
      tweetId: post.tweetId,
      text: post.text,
      force: Boolean(opts.force)
    });
    const result = response || { ok: false, error: 'NO_RESPONSE' };
    state.slopProcessed.set(identity, result);
    transitionSlopStatus(identity, result);
    if (Number.isFinite(result.latencyMs)) state.pageLastLatency = result.latencyMs;
    renderCheckControl(control);
    renderMonitor();
    if (!article.isConnected) return;
    const current = E.extractComment(article);
    if (!current || articleKey(current) !== articleKey(post)) return;
    if (result.ok && result.shouldSlop) ensureSlopStamp(article, post, identity, result.probability);
    else removeSlopStamp(article);
    renderMonitor();
  }

  async function scanReplies() {
    if (!activeDetail()) return;
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
  }

  async function scanSlopPosts() {
    const articles = Array.from(document.querySelectorAll(E.SELECTORS.tweet));
    const seenArticles = new Set();
    for (const article of articles) {
      if (activeDetail() && E.isReplyArticle(article, location.href)) continue;
      const post = E.extractComment(article);
      if (!post) continue;
      seenArticles.add(article);
      const identity = `${articleKey(post)}:slop`;
      const existing = state.slopArticleEntries.get(article);
      if (existing && existing.identity !== identity) removeSlopStamp(article);
      ensureCheckControl(article, post, identity, '', 'slop');
      if (!state.config || !state.config.enabled || !state.hasApiKey || !state.config.postRecognition || state.config.postRecognition.enabled === false || !state.config.postFiltering || state.config.postFiltering.enabled === false) {
        removeSlopStamp(article);
        continue;
      }
      classifySlopArticle(article, post, identity);
    }
    for (const entry of state.slopStamps) {
      if (!entry.article.isConnected || !seenArticles.has(entry.article)) removeSlopStamp(entry.article);
    }
  }

  async function scan() {
    if (!state.started) return;
    await scanReplies();
    await scanSlopPosts();
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
    state.slopProcessed.clear();
    state.slopStatuses.clear();
    state.revealed.clear();
    state.pageChecked = 0;
    state.pageHidden = 0;
    state.pageSafe = 0;
    state.pagePending = 0;
    state.pageErrors = 0;
    state.pageLastLatency = 0;
    state.commentStatuses.clear();
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
    scheduleScan();

    const isExtensionNode = (node) => node && node.nodeType === 1 && (node.matches('.elon-work-check-host, .elon-work-monitor, [data-elon-work-placeholder], [data-elon-work-slop-stamp]') || Boolean(node.closest && node.closest('.elon-work-check-host, .elon-work-monitor, [data-elon-work-placeholder], [data-elon-work-slop-stamp]')));
    const observer = new MutationObserver((mutations) => {
      const relevant = mutations.some((mutation) => {
        if (isExtensionNode(mutation.target)) return false;
        return Array.from(mutation.addedNodes).concat(Array.from(mutation.removedNodes)).some((node) => !isExtensionNode(node));
      });
      if (relevant) scheduleScan();
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
      state.slopProcessed.clear();
      state.slopStatuses.clear();
      clearSlopStamps();
      if (!state.config.enabled || !state.hasApiKey) clearAppliedStates();
      for (const control of state.controls.values()) {
        const hidden = control.article.classList.contains('elon-work-hidden') || control.article.style.display === 'none';
        setControlsSuppressed(control.article, hidden);
        renderCheckControl(control);
      }
      renderMonitor();
      scheduleScan();
    }, 3000);
  }

  start();
})();
