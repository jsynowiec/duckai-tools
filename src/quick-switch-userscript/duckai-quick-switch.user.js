// ==UserScript==
// @name         Duck.ai Quick Switch
// @description  Spotlight-style quick switcher for recent Duck.ai chats.
// @match        https://duck.ai/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  var GLOBAL_KEY = '__duckaiToolsQuickSwitchState__';
  var ROOT_ID = 'duckai-tools-quick-switch-root';
  var STYLE_TAG_ID = 'duckai-tools-quick-switch-style';
  var STATE_ATTR = 'data-duckai-tools-quick-switch';
  var MIN_QUERY_LENGTH = 3;

  if (window[GLOBAL_KEY] && window[GLOBAL_KEY].initialized) {
    return;
  }

  var state = window[GLOBAL_KEY] || {};
  state.initialized = true;
  state.isOpen = false;
  state.chatEntries = [];
  state.results = [];
  state.highlightedIndex = -1;
  state.root = null;
  state.input = null;
  state.list = null;
  state.empty = null;
  state.count = null;
  window[GLOBAL_KEY] = state;

  function isMacPlatform() {
    var platform = '';
    if (typeof navigator.userAgentData !== 'undefined' && navigator.userAgentData && navigator.userAgentData.platform) {
      platform = navigator.userAgentData.platform;
    } else if (typeof navigator.platform === 'string') {
      platform = navigator.platform;
    }

    return /Mac|iPhone|iPad|iPod/.test(platform);
  }

  function isEditableTarget(target) {
    if (!target || target.nodeType !== 1) {
      return false;
    }

    var tagName = target.tagName ? target.tagName.toLowerCase() : '';
    if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
      return true;
    }

    if (target.isContentEditable) {
      return true;
    }

    if (typeof target.closest === 'function' && target.closest('[contenteditable="true"]')) {
      return true;
    }

    return false;
  }

  function ensureRoot() {
    if (state.root && document.body.contains(state.root)) {
      return state.root;
    }

    var existingRoot = document.getElementById(ROOT_ID);
    if (existingRoot) {
      existingRoot.parentNode.removeChild(existingRoot);
    }

    var root = document.createElement('div');
    root.id = ROOT_ID;
    root.setAttribute(STATE_ATTR, 'root');
    root.innerHTML = [
      '<style id="' + STYLE_TAG_ID + '">',
      '#' + ROOT_ID + ' {',
      '  position: fixed;',
      '  top: 0;',
      '  right: 0;',
      '  bottom: 0;',
      '  left: 0;',
      '  z-index: 2147483647;',
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;',
      '}',
      '#' + ROOT_ID + ' [' + STATE_ATTR + '="overlay"] {',
      '  position: absolute;',
      '  top: 0;',
      '  right: 0;',
      '  bottom: 0;',
      '  left: 0;',
      '  background: rgba(15, 23, 42, 0.22);',
      '}',
      '#' + ROOT_ID + ' [' + STATE_ATTR + '="panel"] {',
      '  position: absolute;',
      '  top: 25vh;',
      '  left: 50%;',
      '  transform: translateX(-50%);',
      '  width: calc(100vw - 32px);',
      '  max-width: 680px;',
      '  max-height: 440px;',
      '  border-radius: 16px;',
      '  border: 1px solid rgba(15, 23, 42, 0.1);',
      '  background: rgba(255, 255, 255, 0.96);',
      '  box-shadow: 0 24px 80px rgba(15, 23, 42, 0.28);',
      '  color: #0f172a;',
      '  overflow: hidden;',
      '  backdrop-filter: blur(12px);',
      '  display: flex;',
      '  flex-direction: column;',
      '}',
      '#' + ROOT_ID + ' [' + STATE_ATTR + '="header"] {',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 12px;',
      '  padding: 14px 16px;',
      '  border-bottom: 1px solid rgba(15, 23, 42, 0.08);',
      '}',
      '#' + ROOT_ID + ' [' + STATE_ATTR + '="input"] {',
      '  flex: 1;',
      '  border: 0;',
      '  outline: none;',
      '  background: transparent;',
      '  font-size: 16px;',
      '  color: inherit;',
      '}',
      '#' + ROOT_ID + ' [' + STATE_ATTR + '="input"]::placeholder {',
      '  color: #64748b;',
      '}',
      '#' + ROOT_ID + ' [' + STATE_ATTR + '="close"] {',
      '  border: 0;',
      '  background: transparent;',
      '  color: #475569;',
      '  cursor: pointer;',
      '  font-size: 20px;',
      '  line-height: 1;',
      '  padding: 4px;',
      '}',
      '#' + ROOT_ID + ' [' + STATE_ATTR + '="body"] {',
      '  padding: 8px;',
      '  flex: 1 1 auto;',
      '  min-height: 0;',
      '  overflow-y: auto;',
      '}',
      '#' + ROOT_ID + ' [' + STATE_ATTR + '="hint"],',
      '#' + ROOT_ID + ' [' + STATE_ATTR + '="empty"] {',
      '  padding: 16px;',
      '  font-size: 14px;',
      '  color: #64748b;',
      '}',
      '#' + ROOT_ID + ' [' + STATE_ATTR + '="count"] {',
      '  padding: 0 16px 8px;',
      '  font-size: 12px;',
      '  color: #94a3b8;',
      '}',
      '#' + ROOT_ID + ' [' + STATE_ATTR + '="list"] {',
      '  display: flex;',
      '  flex-direction: column;',
      '  gap: 4px;',
      '}',
      '#' + ROOT_ID + ' [' + STATE_ATTR + '="item"] {',
      '  width: 100%;',
      '  border: 0;',
      '  background: transparent;',
      '  color: inherit;',
      '  text-align: left;',
      '  border-radius: 12px;',
      '  padding: 12px 14px;',
      '  cursor: pointer;',
      '  font-size: 14px;',
      '}',
      '#' + ROOT_ID + ' [' + STATE_ATTR + '="item"]:hover,',
      '#' + ROOT_ID + ' [' + STATE_ATTR + '="item"][aria-selected="true"] {',
      '  background: #e2e8f0;',
      '}',
      '#' + ROOT_ID + ' [' + STATE_ATTR + '="title"] {',
      '  display: block;',
      '  font-weight: 400;',
      '  white-space: nowrap;',
      '  overflow: hidden;',
      '  text-overflow: ellipsis;',
      '}',
      '#' + ROOT_ID + ' [' + STATE_ATTR + '="meta"] {',
      '  display: block;',
      '  margin-top: 4px;',
      '  font-size: 12px;',
      '  color: #64748b;',
      '}',
      '</style>',
      '<div ' + STATE_ATTR + '="overlay"></div>',
      '<div ' + STATE_ATTR + '="panel" role="dialog" aria-modal="true" aria-label="Quick switch recent chats">',
      '  <div ' + STATE_ATTR + '="header">',
      '    <input ' + STATE_ATTR + '="input" type="text" autocomplete="off" spellcheck="false" placeholder="Search chats..." />',
      '    <button ' + STATE_ATTR + '="close" type="button" aria-label="Close quick switcher">X</button>',
      '  </div>',
      '  <div ' + STATE_ATTR + '="count"></div>',
      '  <div ' + STATE_ATTR + '="body">',
      '    <div ' + STATE_ATTR + '="hint">Type at least 3 characters to search recent chats.</div>',
      '    <div ' + STATE_ATTR + '="empty" hidden>No matching chats found.</div>',
      '    <div ' + STATE_ATTR + '="list" role="listbox" aria-label="Matching chats"></div>',
      '  </div>',
      '</div>'
    ].join('');

    document.body.appendChild(root);

    state.root = root;
    state.input = root.querySelector('[' + STATE_ATTR + '="input"]');
    state.list = root.querySelector('[' + STATE_ATTR + '="list"]');
    state.empty = root.querySelector('[' + STATE_ATTR + '="empty"]');
    state.hint = root.querySelector('[' + STATE_ATTR + '="hint"]');
    state.count = root.querySelector('[' + STATE_ATTR + '="count"]');

    root.querySelector('[' + STATE_ATTR + '="overlay"]').addEventListener('click', function () {
      closeSwitcher();
    });

    root.querySelector('[' + STATE_ATTR + '="close"]').addEventListener('click', function () {
      closeSwitcher();
    });

    state.input.addEventListener('input', function () {
      updateResults(state.input.value || '');
    });

    state.list.addEventListener('click', function (event) {
      var target = event.target;
      if (!target || typeof target.closest !== 'function') {
        return;
      }

      var item = target.closest('[' + STATE_ATTR + '="item"]');
      if (!item) {
        return;
      }

      var index = parseInt(item.getAttribute('data-index'), 10);
      if (isNaN(index)) {
        return;
      }

      activateResult(index);
    });

    state.list.addEventListener('mousemove', function (event) {
      var target = event.target;
      if (!target || typeof target.closest !== 'function') {
        return;
      }

      var item = target.closest('[' + STATE_ATTR + '="item"]');
      if (!item) {
        return;
      }

      var index = parseInt(item.getAttribute('data-index'), 10);
      if (!isNaN(index) && index !== state.highlightedIndex) {
        state.highlightedIndex = index;
        renderResults();
      }
    });

    return root;
  }

  function collectChats() {
    var container = document.querySelector('div[data-testid="RecentChatsList"]');
    if (!container) {
      return [];
    }

    var nodes = container.querySelectorAll('[title]');
    var entries = [];
    var seenClickableElements = [];
    var i;

    for (i = 0; i < nodes.length; i += 1) {
      var titleElement = nodes[i];
      var textElement = titleElement.querySelector('p');
      var clickableElement = textElement ? textElement.parentElement : null;
      var title = titleElement.getAttribute('title');

      if (!clickableElement || !title) {
        continue;
      }

      if (seenClickableElements.indexOf(clickableElement) !== -1) {
        continue;
      }

      seenClickableElements.push(clickableElement);
      entries.push({
        title: title,
        titleLower: title.toLowerCase(),
        titleElement: titleElement,
        clickableElement: clickableElement
      });
    }

    return entries;
  }

  function findFuzzyMatchPositions(query, text) {
    var positions = [];
    var searchIndex = 0;
    var i;

    for (i = 0; i < query.length; i += 1) {
      var nextIndex = text.indexOf(query.charAt(i), searchIndex);
      if (nextIndex === -1) {
        return null;
      }

      positions.push(nextIndex);
      searchIndex = nextIndex + 1;
    }

    return positions;
  }

  function scoreEntry(query, entry) {
    var text = entry.titleLower;
    var substringIndex = text.indexOf(query);

    if (substringIndex !== -1) {
      return {
        matched: true,
        mode: 0,
        prefixRank: substringIndex === 0 ? 0 : 1,
        start: substringIndex,
        span: query.length,
        gaps: 0,
        length: text.length
      };
    }

    var positions = findFuzzyMatchPositions(query, text);
    if (!positions) {
      return { matched: false };
    }

    var span = positions[positions.length - 1] - positions[0] + 1;
    var gaps = span - query.length;

    return {
      matched: true,
      mode: 1,
      prefixRank: positions[0] === 0 ? 0 : 1,
      start: positions[0],
      span: span,
      gaps: gaps,
      length: text.length
    };
  }

  function compareScores(a, b) {
    if (a.score.mode !== b.score.mode) {
      return a.score.mode - b.score.mode;
    }

    if (a.score.prefixRank !== b.score.prefixRank) {
      return a.score.prefixRank - b.score.prefixRank;
    }

    if (a.score.start !== b.score.start) {
      return a.score.start - b.score.start;
    }

    if (a.score.gaps !== b.score.gaps) {
      return a.score.gaps - b.score.gaps;
    }

    if (a.score.span !== b.score.span) {
      return a.score.span - b.score.span;
    }

    if (a.score.length !== b.score.length) {
      return a.score.length - b.score.length;
    }

    return a.entry.title.localeCompare(b.entry.title);
  }

  function updateResults(rawQuery) {
    var query = String(rawQuery || '').toLowerCase().replace(/^\s+|\s+$/g, '');
    var scored = [];
    var i;

    if (query.length < MIN_QUERY_LENGTH) {
      state.results = [];
      state.highlightedIndex = -1;
      renderResults();
      return;
    }

    for (i = 0; i < state.chatEntries.length; i += 1) {
      var entry = state.chatEntries[i];
      var score = scoreEntry(query, entry);

      if (score.matched) {
        scored.push({
          entry: entry,
          score: score
        });
      }
    }

    scored.sort(compareScores);
    state.results = scored;
    state.highlightedIndex = state.results.length > 0 ? 0 : -1;
    renderResults();
  }

  function renderResults() {
    if (!state.root) {
      return;
    }

    var query = state.input ? String(state.input.value || '').replace(/^\s+|\s+$/g, '') : '';
    var showSearchState = query.length >= MIN_QUERY_LENGTH;

    state.list.innerHTML = '';
    state.count.textContent = '';

    if (!showSearchState) {
      state.hint.hidden = false;
      state.empty.hidden = true;
      return;
    }

    state.hint.hidden = true;

    if (!state.results.length) {
      state.empty.hidden = false;
      state.count.textContent = '0 matches';
      return;
    }

    state.empty.hidden = true;
    state.count.textContent = state.results.length + (state.results.length === 1 ? ' match' : ' matches');

    var fragment = document.createDocumentFragment();
    var i;

    for (i = 0; i < state.results.length; i += 1) {
      var result = state.results[i];
      var item = document.createElement('button');
      var selected = i === state.highlightedIndex;

      item.type = 'button';
      item.setAttribute(STATE_ATTR, 'item');
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', selected ? 'true' : 'false');
      item.setAttribute('data-index', String(i));
      item.innerHTML = [
        '<span ' + STATE_ATTR + '="title"></span>',
        '<span ' + STATE_ATTR + '="meta"></span>'
      ].join('');
      item.querySelector('[' + STATE_ATTR + '="title"]').textContent = result.entry.title;

      fragment.appendChild(item);
    }

    state.list.appendChild(fragment);
  }

  function scrollHighlightedResultIntoView(direction) {
    if (!state.list || state.highlightedIndex < 0) {
      return;
    }

    var items = state.list.querySelectorAll('[' + STATE_ATTR + '="item"]');
    var item = items[state.highlightedIndex];
    var container = state.list.parentElement;
    var itemTop;

    if (!item || !container) {
      return;
    }

    itemTop = item.offsetTop - state.list.offsetTop;

    if (direction > 0) {
      container.scrollTop = itemTop + item.offsetHeight - container.clientHeight;
      return;
    }

    if (direction < 0) {
      container.scrollTop = itemTop;
    }
  }

  function activateElement(element) {
    if (!element) {
      return;
    }

    if (typeof element.focus === 'function') {
      element.focus();
    }

    if (typeof element.click === 'function') {
      element.click();
      return;
    }

    var clickEvent = document.createEvent('MouseEvents');
    clickEvent.initMouseEvent('click', true, true, window, 1);
    element.dispatchEvent(clickEvent);
  }

  function activateResult(index) {
    if (index < 0 || index >= state.results.length) {
      return;
    }

    var result = state.results[index];
    closeSwitcher();
    activateElement(result.entry.clickableElement);
  }

  function moveHighlight(direction) {
    if (!state.results.length) {
      return;
    }

    if (state.highlightedIndex < 0) {
      state.highlightedIndex = 0;
    } else {
      state.highlightedIndex = (state.highlightedIndex + direction + state.results.length) % state.results.length;
    }

    renderResults();
    scrollHighlightedResultIntoView(direction);
  }

  function openSwitcher() {
    ensureRoot();
    state.chatEntries = collectChats();
    state.results = [];
    state.highlightedIndex = -1;
    state.isOpen = true;
    state.input.value = '';
    renderResults();
    state.input.focus();
    state.input.select();
  }

  function closeSwitcher() {
    state.isOpen = false;
    state.results = [];
    state.highlightedIndex = -1;

    if (state.root && state.root.parentNode) {
      state.root.parentNode.removeChild(state.root);
    }

    state.root = null;
    state.input = null;
    state.list = null;
    state.empty = null;
    state.hint = null;
    state.count = null;
  }

  function toggleSwitcher() {
    if (state.isOpen) {
      closeSwitcher();
    } else {
      openSwitcher();
    }
  }

  function handleOpenShortcut(event) {
    var shouldUseMeta = isMacPlatform();
    var modifierPressed = shouldUseMeta ? event.metaKey : event.ctrlKey;
    var alternateModifierPressed = shouldUseMeta ? event.ctrlKey : event.metaKey;

    if (!modifierPressed || alternateModifierPressed || event.shiftKey) {
      return false;
    }

    if ((event.key || '').toLowerCase() !== 'k') {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();
    toggleSwitcher();
    return true;
  }

  function handleOpenStateKeys(event) {
    if (!state.isOpen) {
      return false;
    }

    if (handleOpenShortcut(event)) {
      return true;
    }

    var key = event.key || '';

    if (key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeSwitcher();
      return true;
    }

    if (key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();
      moveHighlight(1);
      return true;
    }

    if (key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      moveHighlight(-1);
      return true;
    }

    if (key === 'Enter') {
      if (state.highlightedIndex >= 0) {
        event.preventDefault();
        event.stopPropagation();
        activateResult(state.highlightedIndex);
        return true;
      }
    }

    return false;
  }

  document.addEventListener('keydown', function (event) {
    if (handleOpenStateKeys(event)) {
      return;
    }

    handleOpenShortcut(event);
  }, true);
})();
