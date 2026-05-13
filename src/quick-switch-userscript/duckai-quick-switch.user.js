// ==UserScript==
// @name         Duck.ai Quick Switch
// @description  Spotlight-style quick switcher for recent Duck.ai chats.
// @version      2.2.0
// @match        https://duck.ai/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  var GLOBAL_KEY = "__duckaiToolsQuickSwitchState__";
  var ROOT_ID = "duckai-tools-quick-switch-root";
  var STYLE_TAG_ID = "duckai-tools-quick-switch-style";
  var STATE_ATTR = "data-duckai-tools-quick-switch";
  // -2 distinguishes "new-chat highlighted" from "nothing highlighted" (-1) and any real index (>= 0)
  var NEW_CHAT_VIRTUAL_INDEX = -2;
  var RECENT_CHATS_LIMIT = 5;

  if (window[GLOBAL_KEY] && window[GLOBAL_KEY].initialized) {
    return;
  }

  var mediator = window.__duckaiToolsOverlayMediator__;
  if (!mediator) {
    mediator = {
      _registry: [],
      register: function (config) {
        this._registry.push(config);
      },
      handleShortcut: function (event) {
        if (event.__duckaiToolsHandled__) {
          return;
        }
        var i;
        for (i = 0; i < this._registry.length; i += 1) {
          var reg = this._registry[i];
          if (reg.shortcutCheck(event)) {
            event.__duckaiToolsHandled__ = true;
            event.preventDefault();
            event.stopPropagation();
            var openOverlay = null;
            var j;
            for (j = 0; j < this._registry.length; j += 1) {
              if (this._registry[j].isOpen()) {
                openOverlay = this._registry[j];
                break;
              }
            }
            if (openOverlay) {
              if (openOverlay === reg) {
                openOverlay.close();
              } else {
                openOverlay.close();
                reg.open();
              }
            } else {
              reg.open();
            }
            return;
          }
        }
      },
    };
    window.__duckaiToolsOverlayMediator__ = mediator;
  }

  var state = window[GLOBAL_KEY] || {};
  state.initialized = true;
  state.isOpen = false;
  state.previousFocus = null;
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
    var platform = "";
    if (
      typeof navigator.userAgentData !== "undefined" &&
      navigator.userAgentData &&
      navigator.userAgentData.platform
    ) {
      platform = navigator.userAgentData.platform;
    } else if (typeof navigator.platform === "string") {
      platform = navigator.platform;
    }

    return /Mac|iPhone|iPad|iPod/.test(platform);
  }

  var IS_MAC = isMacPlatform();

  function ensureRoot() {
    if (state.root && document.body.contains(state.root)) {
      return state.root;
    }

    var existingRoot = document.getElementById(ROOT_ID);
    if (existingRoot) {
      existingRoot.remove();
    }

    var root = document.createElement("div");
    root.id = ROOT_ID;
    root.setAttribute(STATE_ATTR, "root");
    root.innerHTML = [
      '<style id="' + STYLE_TAG_ID + '">',
      "#" + ROOT_ID + " {",
      "  position: fixed;",
      "  top: 0;",
      "  right: 0;",
      "  bottom: 0;",
      "  left: 0;",
      "  z-index: 2147483647;",
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;',
      "}",
      "#" + ROOT_ID + " [" + STATE_ATTR + '="overlay"] {',
      "  position: absolute;",
      "  top: 0;",
      "  right: 0;",
      "  bottom: 0;",
      "  left: 0;",
      "  background: var(--duckai-tools-overlay-bg, rgba(0, 0, 0, 0.25));",
      "}",
      "#" + ROOT_ID + " [" + STATE_ATTR + '="panel"] {',
      "  position: absolute;",
      "  top: 25vh;",
      "  left: 50%;",
      "  transform: translateX(-50%);",
      "  width: calc(100vw - 32px);",
      "  max-width: 680px;",
      "  max-height: 440px;",
      "  border-radius: 16px;",
      "  border: 1px solid var(--duckai-tools-panel-border, rgba(0, 0, 0, 0.08));",
      "  background: var(--duckai-tools-panel-bg, #ffffff);",
      "  box-shadow: var(--duckai-tools-panel-shadow, 0 24px 80px rgba(0, 0, 0, 0.18));",
      "  color: var(--duckai-tools-text, #0f172a);",
      "  overflow: hidden;",
      "  backdrop-filter: blur(12px);",
      "  display: flex;",
      "  flex-direction: column;",
      "}",
      "#" + ROOT_ID + " [" + STATE_ATTR + '="header"] {',
      "  display: flex;",
      "  align-items: center;",
      "  gap: 12px;",
      "  padding: 14px 16px;",
      "  border-bottom: 1px solid var(--duckai-tools-divider, rgba(0, 0, 0, 0.08));",
      "}",
      "#" + ROOT_ID + " [" + STATE_ATTR + '="input"] {',
      "  flex: 1;",
      "  border: 0;",
      "  outline: none;",
      "  background: transparent;",
      "  font-size: 16px;",
      "  color: inherit;",
      "}",
      "#" + ROOT_ID + " [" + STATE_ATTR + '="input"]::placeholder {',
      "  color: var(--duckai-tools-text-muted, #64748b);",
      "}",
      "#" + ROOT_ID + " [" + STATE_ATTR + '="close"] {',
      "  border: 0;",
      "  background: transparent;",
      "  color: var(--duckai-tools-text-muted, #64748b);",
      "  cursor: pointer;",
      "  font-size: 20px;",
      "  line-height: 1;",
      "  padding: 4px;",
      "}",
      "#" + ROOT_ID + " [" + STATE_ATTR + '="body"] {',
      "  padding: 8px;",
      "  flex: 1 1 auto;",
      "  min-height: 0;",
      "  overflow-y: auto;",
      "}",
      "#" + ROOT_ID + " [" + STATE_ATTR + '="empty"] {',
      "  padding: 16px;",
      "  font-size: 14px;",
      "  color: var(--duckai-tools-text-muted, #64748b);",
      "}",
      "#" + ROOT_ID + " [" + STATE_ATTR + '="count"] {',
      "  padding: 0 16px 8px;",
      "  font-size: 12px;",
      "  color: var(--duckai-tools-text-faint, #94a3b8);",
      "}",
      "#" + ROOT_ID + " [" + STATE_ATTR + '="list"] {',
      "  display: flex;",
      "  flex-direction: column;",
      "  gap: 4px;",
      "}",
      "#" + ROOT_ID + " [" + STATE_ATTR + '="item"] {',
      "  width: 100%;",
      "  border: 0;",
      "  background: transparent;",
      "  color: inherit;",
      "  text-align: left;",
      "  border-radius: 12px;",
      "  padding: 12px 14px;",
      "  cursor: pointer;",
      "  font-size: 14px;",
      "}",
      "#" + ROOT_ID + " [" + STATE_ATTR + '="item"]:hover,',
      "#" + ROOT_ID + " [" + STATE_ATTR + '="item"][aria-selected="true"] {',
      "  background: var(--duckai-tools-hover-bg, #f1f2f4);",
      "}",
      "#" + ROOT_ID + " [" + STATE_ATTR + '="title"] {',
      "  display: block;",
      "  font-weight: 400;",
      "  white-space: nowrap;",
      "  overflow: hidden;",
      "  text-overflow: ellipsis;",
      "}",
      "#" + ROOT_ID + " [" + STATE_ATTR + '="new-chat"] {',
      "  display: flex;",
      "  align-items: center;",
      "  gap: 12px;",
      "  width: 100%;",
      "  border: 0;",
      "  background: transparent;",
      "  color: var(--duckai-tools-text-muted, #64748b);",
      "  text-align: left;",
      "  border-radius: 12px;",
      "  padding: 12px 14px;",
      "  cursor: pointer;",
      "  font-size: 14px;",
      "}",
      "#" + ROOT_ID + " [" + STATE_ATTR + '="new-chat"]:hover,',
      "#" +
        ROOT_ID +
        " [" +
        STATE_ATTR +
        '="new-chat"][aria-selected="true"] {',
      "  background: var(--duckai-tools-hover-bg, #f1f2f4);",
      "  color: var(--duckai-tools-text, #0f172a);",
      "}",
      "#" + ROOT_ID + " [" + STATE_ATTR + '="new-chat-separator"] {',
      "  font-size: 11px;",
      "  font-weight: 500;",
      "  color: var(--duckai-tools-text-muted, #64748b);",
      "  padding: 6px 14px 2px;",
      "}",
      "#" + ROOT_ID + " [" + STATE_ATTR + '="new-chat"] svg {',
      "  flex-shrink: 0;",
      "}",
      "#" + ROOT_ID + " [" + STATE_ATTR + '="match"] {',
      "  font-weight: 700;",
      "}",
      "</style>",
      "<div " + STATE_ATTR + '="overlay"></div>',
      "<div " +
        STATE_ATTR +
        '="panel" role="dialog" aria-modal="true" aria-label="Quick switch recent chats">',
      "  <div " + STATE_ATTR + '="header">',
      "    <input " +
        STATE_ATTR +
        '="input" type="text" autocomplete="off" spellcheck="false" placeholder="Search chats..." />',
      "    <button " +
        STATE_ATTR +
        '="close" type="button" aria-label="Close quick switcher">X</button>',
      "  </div>",
      "  <div " + STATE_ATTR + '="count"></div>',
      "  <div " + STATE_ATTR + '="body">',
      "    <div " +
        STATE_ATTR +
        '="empty" hidden>No matching chats found.</div>',
      "    <div " +
        STATE_ATTR +
        '="list" role="listbox" aria-label="Matching chats"></div>',
      "  </div>",
      "</div>",
    ].join("");

    document.body.appendChild(root);

    state.root = root;
    state.input = root.querySelector("[" + STATE_ATTR + '="input"]');
    state.list = root.querySelector("[" + STATE_ATTR + '="list"]');
    state.empty = root.querySelector("[" + STATE_ATTR + '="empty"]');
    state.count = root.querySelector("[" + STATE_ATTR + '="count"]');

    root
      .querySelector("[" + STATE_ATTR + '="overlay"]')
      .addEventListener("click", function () {
        closeSwitcher();
      });

    root
      .querySelector("[" + STATE_ATTR + '="close"]')
      .addEventListener("click", function () {
        closeSwitcher();
      });

    state.input.addEventListener("input", function () {
      updateResults(state.input.value || "");
    });

    state.list.addEventListener("click", function (event) {
      var target = event.target;
      if (!target || typeof target.closest !== "function") {
        return;
      }

      var newChatBtn = target.closest("[" + STATE_ATTR + '="new-chat"]');
      if (newChatBtn) {
        triggerNewChat();
        return;
      }

      var item = target.closest("[" + STATE_ATTR + '="item"]');
      if (!item) {
        return;
      }

      var index = parseInt(item.getAttribute("data-index"), 10);
      if (isNaN(index)) {
        return;
      }

      activateResult(index);
    });

    state.list.addEventListener("mousemove", function (event) {
      var target = event.target;
      if (!target || typeof target.closest !== "function") {
        return;
      }

      var newChatBtn = target.closest("[" + STATE_ATTR + '="new-chat"]');
      if (newChatBtn) {
        if (state.highlightedIndex !== NEW_CHAT_VIRTUAL_INDEX) {
          state.highlightedIndex = NEW_CHAT_VIRTUAL_INDEX;
          renderResults();
        }
        return;
      }

      var item = target.closest("[" + STATE_ATTR + '="item"]');
      if (!item) {
        return;
      }

      var index = parseInt(item.getAttribute("data-index"), 10);
      if (!isNaN(index) && index !== state.highlightedIndex) {
        state.highlightedIndex = index;
        renderResults();
      }
    });

    return root;
  }

  function collectChats() {
    var container = document.querySelector(
      'div[data-testid="RecentChatsList"]',
    );
    if (!container) {
      return [];
    }

    var nodes = container.querySelectorAll("[title]");
    var entries = [];
    var seen = new Set();
    var i;

    for (i = 0; i < nodes.length; i += 1) {
      var titleElement = nodes[i];
      var textElement = titleElement.querySelector("p");
      var clickableElement = textElement ? textElement.parentElement : null;
      var title = titleElement.getAttribute("title");

      if (!clickableElement || !title) {
        continue;
      }

      if (seen.has(clickableElement)) {
        continue;
      }

      seen.add(clickableElement);
      entries.push({
        title: title,
        titleLower: title.toLowerCase(),
        clickableElement: clickableElement,
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
      var subPositions = [];
      var k;
      for (k = 0; k < query.length; k += 1) {
        subPositions.push(substringIndex + k);
      }
      return {
        matched: true,
        mode: 0,
        prefixRank: substringIndex === 0 ? 0 : 1,
        start: substringIndex,
        span: query.length,
        gaps: 0,
        length: text.length,
        positions: subPositions,
      };
    }

    var positions = findFuzzyMatchPositions(query, text);
    if (!positions) {
      return { matched: false };
    }

    var span = positions[positions.length - 1] - positions[0] + 1;
    var gaps = span - query.length;

    // Reject very scattered fuzzy matches to keep results relevant
    if (gaps > query.length * 2) {
      return { matched: false };
    }

    return {
      matched: true,
      mode: 1,
      prefixRank: positions[0] === 0 ? 0 : 1,
      start: positions[0],
      span: span,
      gaps: gaps,
      length: text.length,
      positions: positions,
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

  function buildHighlightedTitleSpan(title, positions) {
    var titleSpan = document.createElement("span");
    titleSpan.setAttribute(STATE_ATTR, "title");

    if (!positions || positions.length === 0) {
      titleSpan.textContent = title;
      return titleSpan;
    }

    var posSet = {};
    var i;
    for (i = 0; i < positions.length; i += 1) {
      posSet[positions[i]] = true;
    }

    i = 0;
    while (i < title.length) {
      if (posSet[i]) {
        var j = i;
        while (j < title.length && posSet[j]) {
          j += 1;
        }
        var matchSpan = document.createElement("span");
        matchSpan.setAttribute(STATE_ATTR, "match");
        matchSpan.textContent = title.slice(i, j);
        titleSpan.appendChild(matchSpan);
        i = j;
      } else {
        var k = i;
        while (k < title.length && !posSet[k]) {
          k += 1;
        }
        titleSpan.appendChild(document.createTextNode(title.slice(i, k)));
        i = k;
      }
    }

    return titleSpan;
  }

  function updateResults(rawQuery) {
    var query = String(rawQuery || "")
      .toLowerCase()
      .trim();
    var scored = [];
    var i;

    if (query.length === 0) {
      state.results = [];
      state.highlightedIndex = NEW_CHAT_VIRTUAL_INDEX;
      renderResults();
      return;
    }

    for (i = 0; i < state.chatEntries.length; i += 1) {
      var entry = state.chatEntries[i];
      var score = scoreEntry(query, entry);

      if (score.matched) {
        scored.push({
          entry: entry,
          score: score,
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

    var query = state.input ? String(state.input.value || "").trim() : "";
    var isSearching = query.length > 0;

    state.list.innerHTML = "";
    state.count.textContent = "";
    state.empty.hidden = true;

    var fragment = document.createDocumentFragment();

    if (!isSearching) {
      var newChatBtn = document.createElement("button");
      newChatBtn.type = "button";
      newChatBtn.setAttribute(STATE_ATTR, "new-chat");
      newChatBtn.setAttribute("role", "option");
      newChatBtn.setAttribute(
        "aria-selected",
        state.highlightedIndex === NEW_CHAT_VIRTUAL_INDEX ? "true" : "false",
      );
      newChatBtn.innerHTML =
        '<svg fill="none" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">' +
        '<path fill="currentColor" d="M8.072 1a.625.625 0 0 1 0 1.25H4.044a2.75 2.75 0 0 0-2.75 2.727l-.05 6a2.75 2.75 0 0 0 2.75 2.773h8a2.75 2.75 0 0 0 2.75-2.727l.025-3.028a.625.625 0 0 1 1.25.01l-.025 3.028a4 4 0 0 1-4 3.967h-8a4 4 0 0 1-4-4.033l.05-6a4 4 0 0 1 4-3.967zm4.091-.294a2.249 2.249 0 0 1 3.18 3.18l-6.55 6.552a2.6 2.6 0 0 1-.883.58l-2.124.844c-1.006.4-2.01-.581-1.634-1.596l.714-1.926c.131-.353.337-.673.603-.939zm2.297.884a1 1 0 0 0-1.413 0L6.353 8.285a1.4 1.4 0 0 0-.314.49L5.324 10.7l2.125-.844c.172-.068.329-.171.46-.302l6.55-6.551a1 1 0 0 0 0-1.413"/>' +
        "</svg>" +
        "New chat";
      fragment.appendChild(newChatBtn);

      var sep = document.createElement("div");
      sep.setAttribute(STATE_ATTR, "new-chat-separator");
      sep.setAttribute("role", "presentation");
      sep.textContent = "Chats";
      fragment.appendChild(sep);

      var recents = state.chatEntries.slice(0, RECENT_CHATS_LIMIT);
      var i;
      for (i = 0; i < recents.length; i += 1) {
        var recentItem = document.createElement("button");
        recentItem.type = "button";
        recentItem.setAttribute(STATE_ATTR, "item");
        recentItem.setAttribute("role", "option");
        recentItem.setAttribute(
          "aria-selected",
          i === state.highlightedIndex ? "true" : "false",
        );
        recentItem.setAttribute("data-index", String(i));
        var recentTitleSpan = document.createElement("span");
        recentTitleSpan.setAttribute(STATE_ATTR, "title");
        recentTitleSpan.textContent = recents[i].title;
        recentItem.appendChild(recentTitleSpan);
        fragment.appendChild(recentItem);
      }
    } else {
      if (!state.results.length) {
        state.empty.hidden = false;
        state.list.appendChild(fragment);
        return;
      }

      state.count.textContent =
        state.results.length +
        (state.results.length === 1 ? " match" : " matches");

      var ri;
      for (ri = 0; ri < state.results.length; ri += 1) {
        var result = state.results[ri];
        var item = document.createElement("button");
        item.type = "button";
        item.setAttribute(STATE_ATTR, "item");
        item.setAttribute("role", "option");
        item.setAttribute(
          "aria-selected",
          ri === state.highlightedIndex ? "true" : "false",
        );
        item.setAttribute("data-index", String(ri));
        item.appendChild(
          buildHighlightedTitleSpan(result.entry.title, result.score.positions),
        );
        fragment.appendChild(item);
      }
    }

    state.list.appendChild(fragment);
  }

  function scrollHighlightedResultIntoView(direction) {
    var container = state.list ? state.list.parentElement : null;
    if (!container) {
      return;
    }

    if (state.highlightedIndex === NEW_CHAT_VIRTUAL_INDEX) {
      container.scrollTop = 0;
      return;
    }

    if (state.highlightedIndex < 0 || !state.list) {
      return;
    }

    var items = state.list.querySelectorAll("[" + STATE_ATTR + '="item"]');
    var item = items[state.highlightedIndex];

    if (!item) {
      return;
    }

    var itemTop = item.offsetTop - state.list.offsetTop;

    if (direction > 0) {
      container.scrollTop =
        itemTop + item.offsetHeight - container.clientHeight;
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

    if (typeof element.focus === "function") {
      element.focus();
    }

    element.click();
  }

  function activateResult(index) {
    if (index < 0 || index >= state.results.length) {
      return;
    }

    var result = state.results[index];
    closeSwitcher();
    activateElement(result.entry.clickableElement);
  }

  function triggerNewChat() {
    closeSwitcher();
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "o",
        code: "KeyO",
        bubbles: true,
        cancelable: true,
        metaKey: IS_MAC,
        ctrlKey: !IS_MAC,
        shiftKey: true,
      }),
    );
  }

  function moveHighlight(direction) {
    var query = state.input ? String(state.input.value || "").trim() : "";
    var isSearching = query.length > 0;

    if (isSearching) {
      if (!state.results.length) {
        return;
      }

      if (state.highlightedIndex < 0) {
        state.highlightedIndex = 0;
      } else {
        state.highlightedIndex =
          (state.highlightedIndex + direction + state.results.length) %
          state.results.length;
      }
    } else {
      var recentCount = Math.min(state.chatEntries.length, RECENT_CHATS_LIMIT);
      var virtualTotal = recentCount + 1;

      var currentVirtual;
      if (state.highlightedIndex === NEW_CHAT_VIRTUAL_INDEX) {
        currentVirtual = 0;
      } else if (state.highlightedIndex >= 0) {
        currentVirtual = state.highlightedIndex + 1;
      } else {
        // Nothing highlighted yet: Down goes to first item, Up goes to last
        currentVirtual = direction > 0 ? -1 : virtualTotal;
      }

      var nextVirtual =
        (currentVirtual + direction + virtualTotal) % virtualTotal;
      state.highlightedIndex =
        nextVirtual === 0 ? NEW_CHAT_VIRTUAL_INDEX : nextVirtual - 1;
    }

    renderResults();
    scrollHighlightedResultIntoView(direction);
  }

  function openSwitcher() {
    if (state.isOpen) {
      return;
    }
    state.previousFocus = document.activeElement;
    ensureRoot();
    state.chatEntries = collectChats();
    state.results = [];
    state.highlightedIndex = NEW_CHAT_VIRTUAL_INDEX;
    state.isOpen = true;
    state.input.value = "";
    renderResults();
    state.input.focus();
    state.input.select();
  }

  function closeSwitcher() {
    if (!state.isOpen) {
      return;
    }
    state.isOpen = false;
    state.results = [];
    state.highlightedIndex = -1;

    if (state.root) {
      state.root.remove();
    }

    state.root = null;
    state.input = null;
    state.list = null;
    state.empty = null;
    state.count = null;

    if (
      state.previousFocus &&
      typeof state.previousFocus.focus === "function"
    ) {
      state.previousFocus.focus();
      state.previousFocus = null;
    }
  }

  function getFocusableElements() {
    if (!state.root) {
      return [];
    }

    var selector = 'button, input, [tabindex]:not([tabindex="-1"])';
    var elements = Array.prototype.slice.call(
      state.root.querySelectorAll(selector),
    );

    return elements.filter(function (el) {
      return !el.disabled && el.offsetParent !== null;
    });
  }

  function trapFocus(event) {
    var focusable = getFocusableElements();
    if (focusable.length === 0) {
      return;
    }

    var first = focusable[0];
    var last = focusable[focusable.length - 1];

    if (event.shiftKey) {
      if (document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  function handleOpenStateKeys(event) {
    if (!state.isOpen) {
      return false;
    }

    if (checkQuickSwitchShortcut(event)) {
      event.preventDefault();
      event.stopPropagation();
      closeSwitcher();
      return true;
    }

    var key = event.key || "";

    if (key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeSwitcher();
      return true;
    }

    if (key === "ArrowDown") {
      event.preventDefault();
      event.stopPropagation();
      moveHighlight(1);
      return true;
    }

    if (key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      moveHighlight(-1);
      return true;
    }

    if (key === "Enter") {
      if (state.highlightedIndex === NEW_CHAT_VIRTUAL_INDEX) {
        event.preventDefault();
        event.stopPropagation();
        triggerNewChat();
        return true;
      }

      if (state.highlightedIndex >= 0) {
        event.preventDefault();
        event.stopPropagation();
        activateResult(state.highlightedIndex);
        return true;
      }
    }

    if (key === "Tab") {
      trapFocus(event);
    }

    return false;
  }

  function checkQuickSwitchShortcut(event) {
    var modifierPressed = IS_MAC ? event.metaKey : event.ctrlKey;
    var alternateModifierPressed = IS_MAC ? event.ctrlKey : event.metaKey;
    if (!modifierPressed || alternateModifierPressed) {
      return false;
    }
    if (event.shiftKey) {
      return false;
    }
    return (event.key || "").toLowerCase() === "k";
  }

  function isQuickSwitchOpen() {
    return state.isOpen;
  }

  mediator.register({
    name: "quick-switch",
    shortcutCheck: checkQuickSwitchShortcut,
    open: function () {
      openSwitcher();
    },
    close: function () {
      closeSwitcher();
    },
    isOpen: isQuickSwitchOpen,
  });

  document.addEventListener(
    "keydown",
    function (event) {
      if (event.__duckaiToolsHandled__) {
        return;
      }
      if (handleOpenStateKeys(event)) {
        return;
      }
      mediator.handleShortcut(event);
    },
    true,
  );
})();
