// ==UserScript==
// @name         Duck.ai Keyboard Shortcuts
// @description  Keyboard shortcuts cheat sheet for Duck.ai. Cmd+/ to open.
// @version      1.0.2
// @match        https://duck.ai/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  var GLOBAL_KEY = "__duckaiToolsKbShortcutsState__";
  var ROOT_ID = "duckai-tools-kb-shortcuts-root";
  var STYLE_TAG_ID = "duckai-tools-kb-shortcuts-style";
  var STATE_ATTR = "data-duckai-tools-kb-shortcuts";

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
  state.root = null;
  state.closeBtn = null;
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
    if (/Mac|iPhone|iPad|iPod/.test(platform)) {
      return true;
    }
    // Fallback for Chromium forks that report non-standard platform strings
    return /Macintosh|Mac OS X/.test(
      typeof navigator.userAgent === "string" ? navigator.userAgent : "",
    );
  }

  var IS_MAC = isMacPlatform();

  function checkKbShortcutsShortcut(event) {
    var modifierPressed = IS_MAC ? event.metaKey : event.ctrlKey;
    var alternateModifierPressed = IS_MAC ? event.ctrlKey : event.metaKey;
    if (!modifierPressed || alternateModifierPressed) {
      return false;
    }
    if (event.shiftKey) {
      return false;
    }
    return (event.key || "") === "/";
  }

  function checkSettingsShortcut(event) {
    var modifierPressed = IS_MAC ? event.metaKey : event.ctrlKey;
    var alternateModifierPressed = IS_MAC ? event.ctrlKey : event.metaKey;
    if (!modifierPressed || alternateModifierPressed) {
      return false;
    }
    if (!event.shiftKey) {
      return false;
    }
    return (event.code || "") === "Comma";
  }

  function clickSettingsButton() {
    var btn = document.querySelector('button[data-testid="settings-button"]');
    if (btn) {
      btn.click();
      return;
    }

    // The settings button is rendered dynamically inside a collapsible sidebar
    // section. Expand it first if it is currently collapsed.
    var expandBtn = document.querySelector(
      'section[data-testid="duckai-sidebar"] > div:last-child > div:last-child > button',
    );
    if (!expandBtn) {
      console.warn("[duckai-kb-shortcuts] settings expand button not found");
      return;
    }
    if (expandBtn.getAttribute("aria-expanded") !== "false") {
      console.warn(
        "[duckai-kb-shortcuts] settings expand button already expanded but settings button not found",
      );
      return;
    }

    expandBtn.click();

    setTimeout(function () {
      var settingsBtn = document.querySelector(
        'button[data-testid="settings-button"]',
      );
      if (settingsBtn) {
        settingsBtn.click();
      }
    }, 150);
  }

  function renderKeyBadgesHtml(keys) {
    var parts = [];
    var i;
    for (i = 0; i < keys.length; i += 1) {
      var key = keys[i];
      var label;
      if (key === "meta") {
        label = IS_MAC ? "&#x2318;" : "Ctrl";
      } else if (key === "shift") {
        label = IS_MAC ? "&#x21E7;" : "Shift";
      } else {
        label = key.toUpperCase();
      }
      parts.push("<kbd " + STATE_ATTR + '="key">' + label + "</kbd>");
    }
    return parts.join("");
  }

  function buildSectionHtml(heading, items) {
    var html =
      "<div " + STATE_ATTR + '="section-heading">' + heading + "</div>";
    var i;
    for (i = 0; i < items.length; i += 1) {
      var item = items[i];
      html += "<div " + STATE_ATTR + '="row">';
      html += "<span " + STATE_ATTR + '="row-label">' + item.label + "</span>";
      html +=
        "<span " +
        STATE_ATTR +
        '="row-keys">' +
        renderKeyBadgesHtml(item.keys) +
        "</span>";
      html += "</div>";
    }
    return html;
  }

  function buildSectionsHtml() {
    var hasQuickSwitch = !!window.__duckaiToolsQuickSwitchState__;
    var hasQuickPrompts = !!window.__duckaiToolsQuickPromptsState__;

    var generalItems = [
      { label: "New Chat", keys: ["meta", "shift", "O"] },
      { label: "New Image", keys: ["meta", "shift", "I"] },
      { label: "Hide Sidebar", keys: ["meta", "shift", "S"] },
    ];

    var chatItems = [
      { label: "Copy Chat To Clipboard", keys: ["meta", "shift", "C"] },
      { label: "Delete Active Chat", keys: ["meta", "shift", "E"] },
    ];

    var customItems = [];
    if (hasQuickSwitch) {
      customItems.push({ label: "Quick Search", keys: ["meta", "K"] });
    }
    if (hasQuickPrompts) {
      customItems.push({
        label: "Quick Prompts",
        keys: ["meta", "shift", "K"],
      });
    }
    customItems.push({
      label: "Duck.ai Settings",
      keys: ["meta", "shift", ","],
    });
    customItems.push({ label: "Keyboard Shortcuts", keys: ["meta", "/"] });

    var html = "";
    html += buildSectionHtml("General", generalItems);
    html += buildSectionHtml("In chats", chatItems);
    html += buildSectionHtml("Custom", customItems);
    return html;
  }

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
      "  top: 50%;",
      "  left: 50%;",
      "  transform: translate(-50%, -50%);",
      "  width: calc(100vw - 32px);",
      "  max-width: 560px;",
      "  max-height: calc(100vh - 64px);",
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
      "#" + ROOT_ID + " [" + STATE_ATTR + '="panel-header"] {',
      "  display: flex;",
      "  align-items: center;",
      "  justify-content: space-between;",
      "  padding: 20px 24px 16px;",
      "  flex-shrink: 0;",
      "}",
      "#" + ROOT_ID + " [" + STATE_ATTR + '="panel-title"] {',
      "  margin: 0;",
      "  font-size: 20px;",
      "  font-weight: 700;",
      "  color: var(--duckai-tools-text, #0f172a);",
      "}",
      "#" + ROOT_ID + " [" + STATE_ATTR + '="close"] {',
      "  border: 0;",
      "  background: transparent;",
      "  color: var(--duckai-tools-text-muted, #64748b);",
      "  cursor: pointer;",
      "  font-size: 22px;",
      "  line-height: 1;",
      "  padding: 4px 8px;",
      "}",
      "#" + ROOT_ID + " [" + STATE_ATTR + '="body"] {',
      "  padding: 0 24px 24px;",
      "  flex: 1 1 auto;",
      "  min-height: 0;",
      "  overflow-y: auto;",
      "}",
      "#" + ROOT_ID + " [" + STATE_ATTR + '="section-heading"] {',
      "  font-size: 13px;",
      "  font-weight: 600;",
      "  color: var(--duckai-tools-text-muted, #64748b);",
      "  padding: 16px 0 8px;",
      "}",
      "#" + ROOT_ID + " [" + STATE_ATTR + '="row"] {',
      "  display: flex;",
      "  align-items: center;",
      "  justify-content: space-between;",
      "  padding: 12px 0;",
      "  border-top: 1px solid var(--duckai-tools-divider, rgba(0, 0, 0, 0.08));",
      "  font-size: 14px;",
      "}",
      "#" + ROOT_ID + " [" + STATE_ATTR + '="row-label"] {',
      "  color: var(--duckai-tools-text, #0f172a);",
      "}",
      "#" + ROOT_ID + " [" + STATE_ATTR + '="row-keys"] {',
      "  display: flex;",
      "  align-items: center;",
      "  gap: 4px;",
      "  flex-shrink: 0;",
      "}",
      "#" + ROOT_ID + " [" + STATE_ATTR + '="key"] {',
      "  display: inline-flex;",
      "  align-items: center;",
      "  justify-content: center;",
      "  min-width: 1.75rem;",
      "  padding: 3px 6px;",
      "  border-radius: 6px;",
      "  background: var(--duckai-tools-key-bg, #f1f5f9);",
      "  color: var(--duckai-tools-text, #0f172a);",
      "  font-size: 13px;",
      "  font-family: inherit;",
      "  line-height: 1.4;",
      "  border: 0;",
      "  user-select: none;",
      "}",
      "</style>",
      "<div " + STATE_ATTR + '="overlay"></div>',
      "<div " +
        STATE_ATTR +
        '="panel" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">',
      "  <div " + STATE_ATTR + '="panel-header">',
      "    <h2 " + STATE_ATTR + '="panel-title">Keyboard shortcuts</h2>',
      "    <button " +
        STATE_ATTR +
        '="close" type="button" aria-label="Close keyboard shortcuts">X</button>',
      "  </div>",
      "  <div " + STATE_ATTR + '="body"></div>',
      "</div>",
    ].join("");

    document.body.appendChild(root);

    state.root = root;
    state.closeBtn = root.querySelector("[" + STATE_ATTR + '="close"]');

    root
      .querySelector("[" + STATE_ATTR + '="overlay"]')
      .addEventListener("click", function () {
        closeModal();
      });

    state.closeBtn.addEventListener("click", function () {
      closeModal();
    });

    return root;
  }

  function renderModal() {
    if (!state.root) {
      return;
    }
    var body = state.root.querySelector("[" + STATE_ATTR + '="body"]');
    if (body) {
      body.innerHTML = buildSectionsHtml();
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

  function openModal() {
    if (state.isOpen) {
      return;
    }
    state.previousFocus = document.activeElement;
    ensureRoot();
    renderModal();
    state.isOpen = true;
    if (state.closeBtn) {
      state.closeBtn.focus();
    }
  }

  function closeModal() {
    if (!state.isOpen) {
      return;
    }
    state.isOpen = false;

    if (state.root) {
      state.root.remove();
    }

    state.root = null;
    state.closeBtn = null;

    if (
      state.previousFocus &&
      typeof state.previousFocus.focus === "function"
    ) {
      state.previousFocus.focus();
      state.previousFocus = null;
    }
  }

  function handleOpenStateKeys(event) {
    if (!state.isOpen) {
      return false;
    }

    if (checkKbShortcutsShortcut(event)) {
      event.preventDefault();
      event.stopPropagation();
      closeModal();
      return true;
    }

    var key = event.key || "";

    if (key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeModal();
      return true;
    }

    if (key === "Tab") {
      trapFocus(event);
    }

    return false;
  }

  mediator.register({
    name: "kb-shortcuts",
    shortcutCheck: checkKbShortcutsShortcut,
    open: function () {
      openModal();
    },
    close: function () {
      closeModal();
    },
    isOpen: function () {
      return state.isOpen;
    },
  });

  mediator.register({
    name: "settings",
    shortcutCheck: checkSettingsShortcut,
    open: function () {
      clickSettingsButton();
    },
    close: function () {},
    isOpen: function () {
      return false;
    },
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
