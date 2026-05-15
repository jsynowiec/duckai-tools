// ==UserScript==
// @name         Duck.ai Quick Prompts
// @description  Quick prompts picker for Duck.ai with local storage.
// @version      1.2.1
// @match        https://duck.ai/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  var GLOBAL_KEY = "__duckaiToolsQuickPromptsState__";
  var ROOT_ID = "duckai-tools-quick-prompts-root";
  var STYLE_TAG_ID = "duckai-tools-quick-prompts-style";
  var STATE_ATTR = "data-duckai-tools-quick-prompts";
  // -2 distinguishes "new-prompt highlighted" from "nothing highlighted" (-1) and any real index (>= 0)
  var NEW_PROMPT_VIRTUAL_INDEX = -2;
  var DB_NAME = "duckaiToolsQuickPrompts";
  var DB_VERSION = 1;
  var STORE_NAME = "prompts";

  if (window[GLOBAL_KEY] && window[GLOBAL_KEY].initialized) {
    return;
  }

  var mediator = window.__duckaiToolsOverlayMediator__;
  if (!mediator) {
    mediator = {
      _registry: [],
      register: function (config) {
        if (!config || !config.id || !config.label || !config.shortcut) {
          throw new Error(
            "[duckai-tools-mediator] register requires id, label, and shortcut",
          );
        }
        this._registry.push(config);
      },
      getShortcuts: function () {
        return this._registry.map(function (reg) {
          return {
            id: reg.id,
            label: reg.label,
            shortcut: reg.shortcut.slice(),
          };
        });
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
  state.mode = "closed";
  state.prompts = [];
  state.filteredPrompts = [];
  state.highlightedIndex = -1;
  state.searchQuery = "";
  state.editingPrompt = null;
  state.originalPrompt = null;
  state.deletingIndex = -1;
  state.validationAttempted = false;
  state.previousFocus = null;
  state.root = null;
  state.input = null;
  state.list = null;
  state.hint = null;
  state.empty = null;
  state.formContainer = null;
  state.formTitle = null;
  state.formBody = null;
  state.confirmContainer = null;
  state.confirmTitleEl = null;
  state.confirmTextEl = null;
  state.confirmDeleteBtn = null;
  state.confirmCancelBtn = null;
  state.discardContainer = null;
  state.discardConfirmBtn = null;
  state.discardCancelBtn = null;
  state.dbPromise = state.dbPromise || null;
  state.anchorObserver = state.anchorObserver || null;
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

  function openDatabase() {
    if (state.dbPromise) {
      return state.dbPromise;
    }
    state.dbPromise = new Promise(function (resolve, reject) {
      var request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = function () {
        state.dbPromise = null;
        reject(request.error);
      };

      request.onsuccess = function () {
        var db = request.result;
        db.onversionchange = function () {
          db.close();
          state.dbPromise = null;
        };
        resolve(db);
      };

      request.onupgradeneeded = function (event) {
        var db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, {
            keyPath: "id",
            autoIncrement: true,
          });
        }
      };
    });
    return state.dbPromise;
  }

  function getAllPrompts() {
    return new Promise(function (resolve, reject) {
      openDatabase()
        .then(function (db) {
          var tx = db.transaction(STORE_NAME, "readonly");
          var store = tx.objectStore(STORE_NAME);
          var request = store.getAll();

          request.onsuccess = function () {
            resolve(request.result || []);
          };

          request.onerror = function () {
            reject(request.error);
          };
        })
        .catch(reject);
    });
  }

  function savePrompt(prompt) {
    return new Promise(function (resolve, reject) {
      openDatabase()
        .then(function (db) {
          var tx = db.transaction(STORE_NAME, "readwrite");
          var store = tx.objectStore(STORE_NAME);
          var now = new Date().toISOString();
          var request;

          if (prompt.id) {
            var updated = {
              id: prompt.id,
              title: prompt.title.trim(),
              body: prompt.body,
              createdAt: prompt.createdAt,
              updatedAt: now,
            };
            request = store.put(updated);
            request.onsuccess = function () {
              resolve(updated);
            };
            request.onerror = function () {
              reject(request.error);
            };
          } else {
            var created = {
              title: prompt.title.trim(),
              body: prompt.body,
              createdAt: now,
              updatedAt: now,
            };
            request = store.add(created);
            request.onsuccess = function () {
              created.id = request.result;
              resolve(created);
            };
            request.onerror = function () {
              reject(request.error);
            };
          }
        })
        .catch(reject);
    });
  }

  function deletePrompt(id) {
    return new Promise(function (resolve, reject) {
      openDatabase()
        .then(function (db) {
          var tx = db.transaction(STORE_NAME, "readwrite");
          var store = tx.objectStore(STORE_NAME);
          var request = store.delete(id);

          request.onsuccess = function () {
            resolve();
          };

          request.onerror = function () {
            reject(request.error);
          };
        })
        .catch(reject);
    });
  }

  function isDirty() {
    if (!state.originalPrompt) {
      return false;
    }

    var titleInput = state.formTitle;
    var bodyInput = state.formBody;
    if (!titleInput || !bodyInput) {
      return false;
    }

    return (
      titleInput.value !== state.originalPrompt.title ||
      bodyInput.value !== state.originalPrompt.body
    );
  }

  function validateForm() {
    var titleInput = state.formTitle;
    var bodyInput = state.formBody;
    if (!titleInput || !bodyInput) {
      return false;
    }

    var titleValid = /\S/.test(titleInput.value.trim());
    var bodyValid = /\S/.test(bodyInput.value.trim());

    if (state.validationAttempted) {
      var titleError = titleInput.nextElementSibling;
      var bodyError = bodyInput.nextElementSibling;

      titleInput.style.borderColor = titleValid ? "" : "#ef4444";
      if (titleError && titleError.getAttribute(STATE_ATTR) === "error") {
        titleError.textContent = titleValid ? "" : "Title is required";
        titleError.hidden = titleValid;
      }

      bodyInput.style.borderColor = bodyValid ? "" : "#ef4444";
      if (bodyError && bodyError.getAttribute(STATE_ATTR) === "error") {
        bodyError.textContent = bodyValid ? "" : "Body is required";
        bodyError.hidden = bodyValid;
      }
    }

    return titleValid && bodyValid;
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
    var text = entry.title.toLowerCase();
    var substringIndex = text.indexOf(query);

    if (substringIndex !== -1) {
      return {
        matched: true,
        mode: 0,
        prefixRank: substringIndex === 0 ? 0 : 1,
        start: substringIndex,
        span: query.length,
        gaps: 0,
        length: text.length,
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
      length: text.length,
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

  function filterPrompts(query) {
    var q = String(query || "")
      .toLowerCase()
      .trim();
    var scored = [];
    var i;

    if (!q) {
      for (i = 0; i < state.prompts.length; i += 1) {
        scored.push({ entry: state.prompts[i] });
      }
      scored.sort(function (a, b) {
        return a.entry.title.localeCompare(b.entry.title);
      });
      return scored;
    }

    for (i = 0; i < state.prompts.length; i += 1) {
      var entry = state.prompts[i];
      var score = scoreEntry(q, entry);
      if (score.matched) {
        scored.push({ entry: entry, score: score });
      }
    }

    scored.sort(compareScores);
    return scored;
  }

  function ensureRoot() {
    if (state.root && document.body.contains(state.root)) {
      return state.root;
    }

    var existingRoot = document.getElementById(ROOT_ID);
    if (existingRoot) {
      existingRoot.remove();
    }

    var r = ROOT_ID;
    var s = STATE_ATTR;
    var root = document.createElement("div");
    root.id = r;
    root.setAttribute(s, "root");
    root.innerHTML = [
      '<style id="' + STYLE_TAG_ID + '">',
      "#" + r + " {",
      "  position: fixed;",
      "  top: 0;",
      "  right: 0;",
      "  bottom: 0;",
      "  left: 0;",
      "  z-index: 2147483647;",
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;',
      "}",
      "#" + r + " [hidden] { display: none !important; }",
      "#" + r + " [" + s + '="overlay"] {',
      "  position: absolute;",
      "  top: 0;",
      "  right: 0;",
      "  bottom: 0;",
      "  left: 0;",
      "  background: var(--duckai-tools-overlay-bg, rgba(0, 0, 0, 0.25));",
      "}",
      "#" + r + " [" + s + '="panel"] {',
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
      "#" + r + " [" + s + '="header"] {',
      "  display: flex;",
      "  align-items: center;",
      "  gap: 12px;",
      "  padding: 14px 16px;",
      "  border-bottom: 1px solid var(--duckai-tools-divider, rgba(0, 0, 0, 0.08));",
      "}",
      "#" + r + " [" + s + '="input"] {',
      "  flex: 1;",
      "  border: 0;",
      "  outline: none;",
      "  background: transparent;",
      "  font-size: 16px;",
      "  color: inherit;",
      "}",
      "#" + r + " [" + s + '="input"]::placeholder {',
      "  color: var(--duckai-tools-text-muted, #64748b);",
      "}",
      "#" + r + " [" + s + '="close"] {',
      "  border: 0;",
      "  background: transparent;",
      "  color: var(--duckai-tools-text-muted, #64748b);",
      "  cursor: pointer;",
      "  font-size: 20px;",
      "  line-height: 1;",
      "  padding: 4px;",
      "}",
      "#" + r + " [" + s + '="body"] {',
      "  padding: 8px;",
      "  flex: 1 1 auto;",
      "  min-height: 0;",
      "  overflow-y: auto;",
      "}",
      "#" + r + " [" + s + '="hint"],',
      "#" + r + " [" + s + '="empty"] {',
      "  padding: 16px;",
      "  font-size: 14px;",
      "  color: var(--duckai-tools-text-muted, #64748b);",
      "}",
      "#" + r + " [" + s + '="list"] {',
      "  display: flex;",
      "  flex-direction: column;",
      "  gap: 4px;",
      "}",
      "#" + r + " [" + s + '="list"] hr {',
      "  border: none;",
      "  border-top: 1px solid var(--duckai-tools-divider, rgba(0, 0, 0, 0.08));",
      "  margin: 2px 6px;",
      "}",
      "#" + r + " [" + s + '="item"] {',
      "  width: 100%;",
      "  border: 0;",
      "  background: transparent;",
      "  color: inherit;",
      "  text-align: left;",
      "  border-radius: 12px;",
      "  padding: 12px 14px;",
      "  cursor: pointer;",
      "  font-size: 14px;",
      "  position: relative;",
      "}",
      "#" + r + " [" + s + '="item"]:hover,',
      "#" + r + " [" + s + '="item"][aria-selected="true"] {',
      "  background: var(--duckai-tools-hover-bg, #f1f2f4);",
      "}",
      "#" + r + " [" + s + '="item-title"] {',
      "  display: block;",
      "  font-weight: 400;",
      "  white-space: nowrap;",
      "  overflow: hidden;",
      "  text-overflow: ellipsis;",
      "  padding-right: 60px;",
      "}",
      "#" + r + " [" + s + '="actions"] {',
      "  position: absolute;",
      "  right: 8px;",
      "  top: 50%;",
      "  transform: translateY(-50%);",
      "  display: none;",
      "  gap: 4px;",
      "}",
      "#" + r + " [" + s + '="item"]:hover [' + s + '="actions"],',
      "#" +
        r +
        " [" +
        s +
        '="item"][aria-selected="true"] [' +
        s +
        '="actions"] {',
      "  display: flex;",
      "}",
      "#" + r + " [" + s + '="action-btn"] {',
      "  border: 0;",
      "  background: transparent;",
      "  color: var(--duckai-tools-text-muted, #64748b);",
      "  cursor: pointer;",
      "  padding: 4px;",
      "  border-radius: 6px;",
      "  display: inline-flex;",
      "  align-items: center;",
      "  justify-content: center;",
      "}",
      "#" + r + " [" + s + '="action-btn"]:hover {',
      "  background: var(--duckai-tools-divider, rgba(0, 0, 0, 0.08));",
      "  color: var(--duckai-tools-text, #0f172a);",
      "}",
      "#" + ROOT_ID + " [" + STATE_ATTR + '="new-prompt-separator"] {',
      "  font-size: 11px;",
      "  font-weight: 500;",
      "  color: var(--duckai-tools-text-muted, #64748b);",
      "  padding: 6px 14px 2px;",
      "}",
      "#" + r + " [" + s + '="add-row"] {',
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
      "#" + r + " [" + s + '="add-row"]:hover,',
      "#" + r + " [" + s + '="add-row"][aria-selected="true"] {',
      "  background: var(--duckai-tools-hover-bg, #f1f2f4);",
      "  color: var(--duckai-tools-text, #0f172a);",
      "}",
      "#" + r + " [" + s + '="form"] {',
      "  padding: 16px;",
      "  display: flex;",
      "  flex-direction: column;",
      "  gap: 12px;",
      "}",
      "#" + r + " [" + s + '="form-field"] {',
      "  display: flex;",
      "  flex-direction: column;",
      "  gap: 4px;",
      "}",
      "#" + r + " [" + s + '="form-label"] {',
      "  font-size: 12px;",
      "  font-weight: 500;",
      "  color: var(--duckai-tools-text-muted, #64748b);",
      "}",
      "#" + r + " [" + s + '="form-input"],',
      "#" + r + " [" + s + '="form-textarea"] {',
      "  border: 1px solid var(--duckai-tools-input-border, rgba(0, 0, 0, 0.12));",
      "  border-radius: 8px;",
      "  padding: 10px 12px;",
      "  font-size: 14px;",
      "  font-family: inherit;",
      "  color: var(--duckai-tools-text, #0f172a);",
      "  background: var(--duckai-tools-input-bg, #ffffff);",
      "  outline: none;",
      "}",
      "#" + r + " [" + s + '="form-input"]:focus,',
      "#" + r + " [" + s + '="form-textarea"]:focus {',
      "  border-color: var(--duckai-tools-accent, #4361ee);",
      "}",
      "#" + r + " [" + s + '="form-textarea"] {',
      "  min-height: 120px;",
      "  resize: vertical;",
      "}",
      "#" + r + " [" + s + '="error"] {',
      "  font-size: 12px;",
      "  color: #ef4444;",
      "}",
      "#" + r + " [" + s + '="form-actions"] {',
      "  display: flex;",
      "  justify-content: flex-end;",
      "  gap: 8px;",
      "}",
      "#" + r + " .qp-btn {",
      "  border: 0;",
      "  border-radius: 8px;",
      "  padding: 8px 16px;",
      "  font-size: 14px;",
      "  cursor: pointer;",
      "  font-weight: 500;",
      "}",
      "#" +
        r +
        " .qp-btn-primary { background: var(--duckai-tools-accent, #4361ee); color: #fff; }",
      "#" +
        r +
        " .qp-btn-primary:hover { background: var(--duckai-tools-accent-hover, #3451d1); }",
      "#" +
        r +
        " .qp-btn-secondary { background: var(--duckai-tools-btn-secondary-bg, #f1f2f4); color: var(--duckai-tools-btn-secondary-text, #0f172a); }",
      "#" +
        r +
        " .qp-btn-secondary:hover { background: var(--duckai-tools-btn-secondary-hover, #e2e4e8); }",
      "#" + r + " .qp-btn-danger { background: #ef4444; color: #fff; }",
      "#" + r + " .qp-btn-danger:hover { background: #dc2626; }",
      "#" + r + " .qp-confirm {",
      "  padding: 24px 16px;",
      "  text-align: center;",
      "}",
      "#" + r + " [" + s + '="confirm-title"] {',
      "  font-size: 16px;",
      "  font-weight: 500;",
      "  margin-bottom: 8px;",
      "  color: var(--duckai-tools-text, #0f172a);",
      "}",
      "#" + r + " [" + s + '="confirm-text"] {',
      "  font-size: 14px;",
      "  color: var(--duckai-tools-text-muted, #64748b);",
      "  margin-bottom: 20px;",
      "}",
      "#" + r + " [" + s + '="confirm-actions"] {',
      "  display: flex;",
      "  justify-content: center;",
      "  gap: 8px;",
      "}",
      "</style>",
      "<div " + s + '="overlay"></div>',
      "<div " +
        s +
        '="panel" role="dialog" aria-modal="true" aria-label="Quick prompts">',
      "  <div " + s + '="header">',
      "    <input " +
        s +
        '="input" type="text" autocomplete="off" spellcheck="false" placeholder="Search prompts..." />',
      "    <button " +
        s +
        '="close" type="button" aria-label="Close">X</button>',
      "  </div>",
      "  <div " + s + '="body">',
      "    <div " + s + '="hint">Type to search your saved prompts.</div>',
      "    <div " + s + '="empty" hidden>No saved prompts match.</div>',
      "    <div " +
        s +
        '="list" role="listbox" aria-label="Matching prompts"></div>',
      "    <div " + s + '="form" hidden>',
      "      <div " + s + '="form-field">',
      "        <label " + s + '="form-label">Title</label>',
      "        <input " +
        s +
        '="form-input" type="text" autocomplete="off" spellcheck="false" />',
      "        <span " + s + '="error" hidden></span>',
      "      </div>",
      "      <div " + s + '="form-field">',
      "        <label " + s + '="form-label">Prompt</label>',
      "        <textarea " +
        s +
        '="form-textarea" autocomplete="off" spellcheck="false"></textarea>',
      "        <span " + s + '="error" hidden></span>',
      "      </div>",
      "      <div " + s + '="form-actions">',
      '        <button class="qp-btn qp-btn-secondary" type="button" ' +
        s +
        '="cancel">Cancel</button>',
      '        <button class="qp-btn qp-btn-primary" type="button" ' +
        s +
        '="save">Save</button>',
      "      </div>",
      "    </div>",
      '    <div class="qp-confirm" ' + s + '="confirm" hidden>',
      "      <div " + s + '="confirm-title"></div>',
      "      <div " + s + '="confirm-text"></div>',
      "      <div " + s + '="confirm-actions">',
      '        <button class="qp-btn qp-btn-secondary" type="button" ' +
        s +
        '="confirm-cancel">Cancel</button>',
      '        <button class="qp-btn qp-btn-danger" type="button" ' +
        s +
        '="confirm-delete">Delete</button>',
      "      </div>",
      "    </div>",
      '    <div class="qp-confirm" ' + s + '="discard-confirm" hidden>',
      "      <div " + s + '="confirm-title">Unsaved Changes</div>',
      "      <div " +
        s +
        '="confirm-text">You have unsaved changes. Are you sure you want to discard them?</div>',
      "      <div " + s + '="confirm-actions">',
      '        <button class="qp-btn qp-btn-secondary" type="button" ' +
        s +
        '="discard-cancel">Keep Editing</button>',
      '        <button class="qp-btn qp-btn-danger" type="button" ' +
        s +
        '="discard-btn">Discard</button>',
      "      </div>",
      "    </div>",
      "  </div>",
      "</div>",
    ].join("");

    document.body.appendChild(root);

    state.root = root;
    state.input = root.querySelector("[" + s + '="input"]');
    state.list = root.querySelector("[" + s + '="list"]');
    state.hint = root.querySelector("[" + s + '="hint"]');
    state.empty = root.querySelector("[" + s + '="empty"]');
    state.formContainer = root.querySelector("[" + s + '="form"]');
    state.formTitle = root.querySelector("[" + s + '="form-input"]');
    state.formBody = root.querySelector("[" + s + '="form-textarea"]');
    var formSave = root.querySelector("[" + s + '="save"]');
    var formCancel = root.querySelector("[" + s + '="cancel"]');
    state.confirmContainer = root.querySelector("[" + s + '="confirm"]');
    state.confirmTitleEl = state.confirmContainer.querySelector(
      "[" + s + '="confirm-title"]',
    );
    state.confirmTextEl = state.confirmContainer.querySelector(
      "[" + s + '="confirm-text"]',
    );
    state.confirmDeleteBtn = state.confirmContainer.querySelector(
      "[" + s + '="confirm-delete"]',
    );
    state.confirmCancelBtn = state.confirmContainer.querySelector(
      "[" + s + '="confirm-cancel"]',
    );
    state.discardContainer = root.querySelector(
      "[" + s + '="discard-confirm"]',
    );
    state.discardConfirmBtn = state.discardContainer.querySelector(
      "[" + s + '="discard-btn"]',
    );
    state.discardCancelBtn = state.discardContainer.querySelector(
      "[" + s + '="discard-cancel"]',
    );

    root
      .querySelector("[" + s + '="overlay"]')
      .addEventListener("click", function () {
        handleOverlayBackdropClick();
      });

    root
      .querySelector("[" + s + '="close"]')
      .addEventListener("click", function () {
        closeOverlay();
      });

    state.input.addEventListener("input", function () {
      state.searchQuery = state.input.value || "";
      updateFilteredPrompts();
    });

    state.list.addEventListener("click", function (event) {
      var target = event.target;
      if (!target || typeof target.closest !== "function") {
        return;
      }

      var actionBtn = target.closest("[" + s + '="action-btn"]');
      if (actionBtn) {
        var item = actionBtn.closest("[" + s + '="item"]');
        if (item) {
          var index = parseInt(item.getAttribute("data-index"), 10);
          if (!isNaN(index)) {
            var action = actionBtn.getAttribute("data-action");
            if (action === "edit") {
              startEditPrompt(index);
            } else if (action === "delete") {
              startDeletePrompt(index);
            }
          }
        }
        return;
      }

      var addRow = target.closest("[" + s + '="add-row"]');
      if (addRow) {
        startCreatePrompt();
        return;
      }

      var item = target.closest("[" + s + '="item"]');
      if (item) {
        var index = parseInt(item.getAttribute("data-index"), 10);
        if (!isNaN(index)) {
          insertPrompt(index);
        }
      }
    });

    state.list.addEventListener("mousemove", function (event) {
      var target = event.target;
      if (!target || typeof target.closest !== "function") {
        return;
      }

      var item = target.closest("[" + s + '="item"]');
      if (item) {
        var index = parseInt(item.getAttribute("data-index"), 10);
        if (!isNaN(index) && index !== state.highlightedIndex) {
          state.highlightedIndex = index;
          renderSelectView();
        }
      }
    });

    state.formTitle.addEventListener("keydown", function (event) {
      if ((event.key || "") === "Enter") {
        event.preventDefault();
        state.formBody.focus();
      }
    });

    state.formBody.addEventListener("keydown", function (event) {
      var key = event.key || "";
      var isMac = isMacPlatform();
      if (
        key === "Enter" &&
        ((isMac && event.metaKey) || (!isMac && event.ctrlKey))
      ) {
        event.preventDefault();
        handleFormSave();
      }
    });

    state.formTitle.addEventListener("input", function () {
      validateForm();
    });

    state.formBody.addEventListener("input", function () {
      validateForm();
    });

    formSave.addEventListener("click", function () {
      handleFormSave();
    });

    formCancel.addEventListener("click", function () {
      handleFormCancel();
    });

    state.confirmDeleteBtn.addEventListener("click", function () {
      handleConfirmDelete();
    });

    state.confirmCancelBtn.addEventListener("click", function () {
      showSelectView();
    });

    state.discardConfirmBtn.addEventListener("click", function () {
      showSelectView();
    });

    state.discardCancelBtn.addEventListener("click", function () {
      state.mode = "edit";
      state.discardContainer.hidden = true;
      state.formContainer.hidden = false;
      state.formTitle.focus();
    });

    return root;
  }

  function handleOverlayBackdropClick() {
    if (state.mode === "edit") {
      if (isDirty()) {
        showDiscardConfirm();
      } else {
        closeOverlay();
      }
    } else if (
      state.mode === "confirmDelete" ||
      state.mode === "confirmDiscard"
    ) {
      showSelectView();
    } else {
      closeOverlay();
    }
  }

  function updateFilteredPrompts() {
    state.filteredPrompts = filterPrompts(state.searchQuery);

    if (state.searchQuery) {
      state.highlightedIndex = state.filteredPrompts.length > 0 ? 0 : -1;
    } else {
      state.highlightedIndex = NEW_PROMPT_VIRTUAL_INDEX;
    }

    renderSelectView();
  }

  function renderSelectView() {
    if (!state.root) {
      return;
    }

    state.hint.hidden = true;
    state.empty.hidden = true;
    state.formContainer.hidden = true;
    state.confirmContainer.hidden = true;
    state.discardContainer.hidden = true;
    state.list.hidden = false;
    state.list.innerHTML = "";

    var fragment = document.createDocumentFragment();
    var s = STATE_ATTR;

    var addRow = document.createElement("button");
    addRow.type = "button";
    addRow.setAttribute(s, "add-row");
    addRow.setAttribute("role", "option");
    addRow.setAttribute(
      "aria-selected",
      state.highlightedIndex === NEW_PROMPT_VIRTUAL_INDEX ? "true" : "false",
    );
    addRow.innerHTML =
      '<svg fill="none" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">' +
      '<path fill="currentColor" d="M8.072 1a.625.625 0 0 1 0 1.25H4.044a2.75 2.75 0 0 0-2.75 2.727l-.05 6a2.75 2.75 0 0 0 2.75 2.773h8a2.75 2.75 0 0 0 2.75-2.727l.025-3.028a.625.625 0 0 1 1.25.01l-.025 3.028a4 4 0 0 1-4 3.967h-8a4 4 0 0 1-4-4.033l.05-6a4 4 0 0 1 4-3.967zm4.091-.294a2.249 2.249 0 0 1 3.18 3.18l-6.55 6.552a2.6 2.6 0 0 1-.883.58l-2.124.844c-1.006.4-2.01-.581-1.634-1.596l.714-1.926c.131-.353.337-.673.603-.939zm2.297.884a1 1 0 0 0-1.413 0L6.353 8.285a1.4 1.4 0 0 0-.314.49L5.324 10.7l2.125-.844c.172-.068.329-.171.46-.302l6.55-6.551a1 1 0 0 0 0-1.413"/>' +
      "</svg>" +
      "New prompt";
    fragment.appendChild(addRow);

    if (state.filteredPrompts.length > 0) {
      var sep = document.createElement("div");
      sep.setAttribute(STATE_ATTR, "new-prompt-separator");
      sep.setAttribute("role", "presentation");
      sep.textContent = "Prompts";
      fragment.appendChild(sep);
    }

    if (!state.filteredPrompts.length && state.searchQuery) {
      state.empty.hidden = false;
    }

    var i;
    for (i = 0; i < state.filteredPrompts.length; i += 1) {
      var result = state.filteredPrompts[i];
      var item = document.createElement("button");
      var selected = i === state.highlightedIndex;

      item.type = "button";
      item.setAttribute(s, "item");
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", selected ? "true" : "false");
      item.setAttribute("data-index", String(i));
      item.innerHTML =
        "<span " +
        s +
        '="item-title"></span>' +
        "<span " +
        s +
        '="actions">' +
        "<button " +
        s +
        '="action-btn" data-action="edit" title="Edit"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 -0.5 25 25" fill="none"><path d="M12.1238 7.02072L6.22577 14.3797L7.39623 15.3178L13.2942 7.95881L12.1238 7.02072ZM6.24297 14.359C6.03561 14.5995 5.91226 14.9011 5.89159 15.218L7.38841 15.3156C7.38786 15.324 7.38457 15.3321 7.37903 15.3385L6.24297 14.359ZM5.8908 15.2321L5.7508 18.2551L7.2492 18.3245L7.3892 15.3015L5.8908 15.2321ZM5.75396 18.3667C5.83563 19.1586 6.51588 19.7524 7.31152 19.7264L7.26248 18.2272C7.25928 18.2273 7.25771 18.2268 7.25669 18.2264C7.25526 18.2259 7.25337 18.2249 7.25144 18.2232C7.2495 18.2215 7.24825 18.2198 7.24754 18.2185C7.24703 18.2175 7.24637 18.216 7.24604 18.2128L5.75396 18.3667ZM7.45996 19.7065L10.46 18.9955L10.114 17.536L7.11404 18.247L7.45996 19.7065ZM10.4716 18.9927C10.7771 18.9151 11.05 18.7422 11.2506 18.499L10.0934 17.5445C10.0958 17.5417 10.0989 17.5397 10.1024 17.5388L10.4716 18.9927ZM11.2571 18.491L17.2971 10.959L16.1269 10.0206L10.0869 17.5526L11.2571 18.491ZM13.2971 7.95901L14.8851 5.97901L13.7149 5.04052L12.1269 7.02052L13.2971 7.95901ZM14.9135 5.94123C15.0521 5.74411 15.3214 5.6912 15.5243 5.82123L16.3337 4.5583C15.4544 3.99484 14.2873 4.2241 13.6865 5.0783L14.9135 5.94123ZM15.4492 5.7662L17.6862 7.6282L18.6458 6.47532L16.4088 4.61332L15.4492 5.7662ZM17.6352 7.58161C17.7111 7.6577 17.7535 7.761 17.7529 7.86852L19.2529 7.87676C19.2557 7.36905 19.0555 6.88127 18.6968 6.52192L17.6352 7.58161ZM17.7529 7.86852C17.7524 7.97604 17.7088 8.07886 17.632 8.15412L18.682 9.22541C19.0446 8.87002 19.2501 8.38447 19.2529 7.87676L17.7529 7.86852ZM17.5721 8.22025L16.1271 10.0203L17.2969 10.9593L18.7419 9.15928L17.5721 8.22025Z" fill="currentColor"/></svg></button>' +
        "<button " +
        s +
        '="action-btn" data-action="delete" title="Delete"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6V16.2C18 17.8802 18 18.7202 17.673 19.362C17.3854 19.9265 16.9265 20.3854 16.362 20.673C15.7202 21 14.8802 21 13.2 21H10.8C9.11984 21 8.27976 21 7.63803 20.673C7.07354 20.3854 6.6146 19.9265 6.32698 19.362C6 18.7202 6 17.8802 6 16.2V6M4 6H20M16 6L15.7294 5.18807C15.4671 4.40125 15.3359 4.00784 15.0927 3.71698C14.8779 3.46013 14.6021 3.26132 14.2905 3.13878C13.9376 3 13.523 3 12.6936 3H11.3064C10.477 3 10.0624 3 9.70951 3.13878C9.39792 3.26132 9.12208 3.46013 8.90729 3.71698C8.66405 4.00784 8.53292 4.40125 8.27064 5.18807L8 6"/></svg></button>' +
        "</span>";
      item.querySelector("[" + s + '="item-title"]').textContent =
        result.entry.title;
      fragment.appendChild(item);
    }

    state.list.appendChild(fragment);
  }

  function showSelectView() {
    state.mode = "select";
    if (!state.root) {
      return;
    }

    state.formContainer.hidden = true;
    state.confirmContainer.hidden = true;
    state.discardContainer.hidden = true;
    state.list.hidden = false;
    state.input.disabled = false;
    renderSelectView();
  }

  function startCreatePrompt() {
    state.mode = "edit";
    state.editingPrompt = null;
    state.originalPrompt = null;
    state.validationAttempted = false;
    if (!state.root) {
      return;
    }

    state.list.hidden = true;
    state.hint.hidden = true;
    state.empty.hidden = true;
    state.confirmContainer.hidden = true;
    state.discardContainer.hidden = true;
    state.formContainer.hidden = false;
    state.input.disabled = true;
    state.formTitle.value = "";
    state.formBody.value = "";
    state.formTitle.style.borderColor = "";
    state.formBody.style.borderColor = "";

    var titleError = state.formTitle.nextElementSibling;
    var bodyError = state.formBody.nextElementSibling;
    if (titleError && titleError.getAttribute(STATE_ATTR) === "error") {
      titleError.textContent = "";
      titleError.hidden = true;
    }
    if (bodyError && bodyError.getAttribute(STATE_ATTR) === "error") {
      bodyError.textContent = "";
      bodyError.hidden = true;
    }

    state.formTitle.focus();
  }

  function startEditPrompt(index) {
    if (index < 0 || index >= state.filteredPrompts.length) {
      return;
    }

    var prompt = state.filteredPrompts[index].entry;
    state.mode = "edit";
    state.editingPrompt = prompt;
    state.validationAttempted = false;
    state.originalPrompt = {
      title: prompt.title,
      body: prompt.body,
    };
    if (!state.root) {
      return;
    }

    state.list.hidden = true;
    state.hint.hidden = true;
    state.empty.hidden = true;
    state.confirmContainer.hidden = true;
    state.discardContainer.hidden = true;
    state.formContainer.hidden = false;
    state.input.disabled = true;
    state.formTitle.value = prompt.title;
    state.formBody.value = prompt.body;
    state.formTitle.style.borderColor = "";
    state.formBody.style.borderColor = "";

    var titleError = state.formTitle.nextElementSibling;
    var bodyError = state.formBody.nextElementSibling;
    if (titleError && titleError.getAttribute(STATE_ATTR) === "error") {
      titleError.textContent = "";
      titleError.hidden = true;
    }
    if (bodyError && bodyError.getAttribute(STATE_ATTR) === "error") {
      bodyError.textContent = "";
      bodyError.hidden = true;
    }

    state.formTitle.focus();
  }

  function startDeletePrompt(index) {
    if (index < 0 || index >= state.filteredPrompts.length) {
      return;
    }

    var prompt = state.filteredPrompts[index].entry;
    state.mode = "confirmDelete";
    state.deletingIndex = index;
    if (!state.root) {
      return;
    }

    state.list.hidden = true;
    state.hint.hidden = true;
    state.empty.hidden = true;
    state.formContainer.hidden = true;
    state.discardContainer.hidden = true;
    state.confirmContainer.hidden = false;
    state.input.disabled = true;
    state.confirmTitleEl.textContent = "Delete Prompt?";
    state.confirmTextEl.textContent =
      'Are you sure you want to delete "' + prompt.title + '"?';
  }

  function showDiscardConfirm() {
    state.mode = "confirmDiscard";
    if (!state.root) {
      return;
    }

    state.formContainer.hidden = true;
    state.confirmContainer.hidden = true;
    state.discardContainer.hidden = false;
  }

  function handleFormSave() {
    state.validationAttempted = true;
    if (!validateForm()) {
      return;
    }

    var promptData = {
      id: state.editingPrompt ? state.editingPrompt.id : null,
      title: state.formTitle.value.trim(),
      body: state.formBody.value,
      createdAt: state.editingPrompt ? state.editingPrompt.createdAt : null,
    };

    savePrompt(promptData)
      .then(function (saved) {
        return getAllPrompts().then(function (prompts) {
          return { prompts: prompts, saved: saved };
        });
      })
      .then(function (result) {
        state.prompts = result.prompts;
        updateFilteredPrompts();
        showSelectView();

        var savedId = result.saved.id;
        var foundIndex = -1;
        var i;
        for (i = 0; i < state.filteredPrompts.length; i += 1) {
          if (state.filteredPrompts[i].entry.id === savedId) {
            foundIndex = i;
            break;
          }
        }
        if (foundIndex >= 0) {
          state.highlightedIndex = foundIndex;
          renderSelectView();
        }

        state.input.focus();
      })
      .catch(function (err) {
        console.error("Failed to save prompt:", err);
      });
  }

  function handleFormCancel() {
    if (isDirty()) {
      showDiscardConfirm();
    } else {
      showSelectView();
    }
  }

  function handleConfirmDelete() {
    if (
      state.deletingIndex < 0 ||
      state.deletingIndex >= state.filteredPrompts.length
    ) {
      return;
    }

    var prompt = state.filteredPrompts[state.deletingIndex].entry;
    deletePrompt(prompt.id)
      .then(function () {
        return getAllPrompts();
      })
      .then(function (prompts) {
        state.prompts = prompts;
        updateFilteredPrompts();

        if (state.filteredPrompts.length > 0) {
          if (state.deletingIndex >= state.filteredPrompts.length) {
            state.highlightedIndex = state.filteredPrompts.length - 1;
          } else {
            state.highlightedIndex = state.deletingIndex;
          }
        } else {
          state.highlightedIndex = -1;
        }

        showSelectView();
      })
      .catch(function (err) {
        console.error("Failed to delete prompt:", err);
      });
  }

  function insertPrompt(index) {
    if (index < 0 || index >= state.filteredPrompts.length) {
      return;
    }

    var prompt = state.filteredPrompts[index].entry;
    var textarea = document.querySelector('textarea[name="user-prompt"]');
    if (!textarea) {
      closeOverlay();
      return;
    }

    var existing = textarea.value || "";
    var selStart =
      typeof textarea.selectionStart === "number"
        ? textarea.selectionStart
        : existing.length;
    var selEnd =
      typeof textarea.selectionEnd === "number"
        ? textarea.selectionEnd
        : selStart;
    var newValue;
    var cursorPos;

    if (selStart !== selEnd) {
      newValue =
        existing.slice(0, selStart) + prompt.body + existing.slice(selEnd);
      cursorPos = selStart + prompt.body.length;
    } else {
      var body = prompt.body;
      if (existing && !/\s$/.test(existing)) {
        body = "\n" + body;
      }
      newValue = existing + body;
      cursorPos = newValue.length;
    }

    var nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    ).set;
    nativeInputValueSetter.call(textarea, newValue);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.dispatchEvent(new Event("change", { bubbles: true }));

    closeOverlay();
    textarea.focus();

    if (textarea.setSelectionRange) {
      textarea.setSelectionRange(cursorPos, cursorPos);
    }
  }

  function moveHighlight(direction) {
    var total = state.filteredPrompts.length;
    var virtualTotal = total + 1;
    var currentVirtual;

    if (state.highlightedIndex === NEW_PROMPT_VIRTUAL_INDEX) {
      currentVirtual = 0;
    } else if (state.highlightedIndex >= 0) {
      currentVirtual = state.highlightedIndex + 1;
    } else {
      currentVirtual = direction > 0 ? -1 : virtualTotal;
    }

    var nextVirtual =
      (currentVirtual + direction + virtualTotal) % virtualTotal;
    state.highlightedIndex =
      nextVirtual === 0 ? NEW_PROMPT_VIRTUAL_INDEX : nextVirtual - 1;

    renderSelectView();
    scrollHighlightedIntoView(direction);
  }

  function scrollHighlightedIntoView(direction) {
    if (!state.list) {
      return;
    }

    var container = state.list.parentElement;
    var el;

    if (state.highlightedIndex === NEW_PROMPT_VIRTUAL_INDEX) {
      el = state.list.querySelector("[" + STATE_ATTR + '="add-row"]');
    } else {
      var items = state.list.querySelectorAll("[" + STATE_ATTR + '="item"]');
      el = items[state.highlightedIndex];
    }

    if (!el || !container) {
      return;
    }

    var itemTop = el.offsetTop - state.list.offsetTop;

    if (direction > 0) {
      container.scrollTop = itemTop + el.offsetHeight - container.clientHeight;
      return;
    }

    if (direction < 0) {
      container.scrollTop = itemTop;
    }
  }

  function getFocusableElements() {
    if (!state.root) {
      return [];
    }

    var selector = 'button, input, textarea, [tabindex]:not([tabindex="-1"])';
    var elements = Array.prototype.slice.call(
      state.root.querySelectorAll(selector),
    );

    return elements.filter(function (el) {
      return !el.disabled && el.offsetParent !== null;
    });
  }

  function trapFocus(event) {
    if (state.mode === "closed") {
      return;
    }

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

  state._keydownHandler = function (event) {
    if (!state.isOpen) {
      return;
    }

    var key = event.key || "";

    if (key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (state.mode === "edit") {
        if (isDirty()) {
          showDiscardConfirm();
        } else {
          showSelectView();
        }
      } else if (
        state.mode === "confirmDelete" ||
        state.mode === "confirmDiscard"
      ) {
        showSelectView();
      } else {
        closeOverlay();
      }
      return;
    }

    if (state.mode === "select") {
      if (key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        moveHighlight(1);
        return;
      }

      if (key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        moveHighlight(-1);
        return;
      }

      if (key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        if (
          state.highlightedIndex === NEW_PROMPT_VIRTUAL_INDEX ||
          state.highlightedIndex < 0
        ) {
          startCreatePrompt();
        } else {
          insertPrompt(state.highlightedIndex);
        }
        return;
      }
    }

    if (key === "Tab") {
      trapFocus(event);
    }
  };

  function openOverlay() {
    if (state.isOpen) {
      return;
    }

    state.previousFocus = document.activeElement;
    ensureRoot();
    state.isOpen = true;
    state.mode = "select";
    state.searchQuery = "";
    state.highlightedIndex = NEW_PROMPT_VIRTUAL_INDEX;
    state.input.value = "";
    state.input.disabled = false;

    getAllPrompts()
      .then(function (prompts) {
        if (!state.isOpen) {
          return;
        }
        state.prompts = prompts;
        updateFilteredPrompts();
        state.input.focus();
      })
      .catch(function (err) {
        if (!state.isOpen) {
          return;
        }
        console.error("Failed to load prompts:", err);
        state.prompts = [];
        updateFilteredPrompts();
        state.input.focus();
      });

    document.addEventListener("keydown", state._keydownHandler, true);
  }

  function closeOverlay() {
    if (!state.isOpen) {
      return;
    }

    state.isOpen = false;
    state.mode = "closed";
    state.editingPrompt = null;
    state.originalPrompt = null;
    state.searchQuery = "";
    state.filteredPrompts = [];
    state.highlightedIndex = -1;
    state.deletingIndex = -1;

    if (state.root) {
      state.root.remove();
    }

    state.root = null;
    state.input = null;
    state.list = null;
    state.hint = null;
    state.empty = null;
    state.formContainer = null;
    state.formTitle = null;
    state.formBody = null;
    state.confirmContainer = null;
    state.confirmTitleEl = null;
    state.confirmTextEl = null;
    state.confirmDeleteBtn = null;
    state.confirmCancelBtn = null;
    state.discardContainer = null;
    state.discardConfirmBtn = null;
    state.discardCancelBtn = null;

    document.removeEventListener("keydown", state._keydownHandler, true);

    if (
      state.previousFocus &&
      typeof state.previousFocus.focus === "function"
    ) {
      state.previousFocus.focus();
      state.previousFocus = null;
    }
  }

  function checkShortcut(event) {
    var modifierPressed = IS_MAC ? event.metaKey : event.ctrlKey;
    var alternateModifierPressed = IS_MAC ? event.ctrlKey : event.metaKey;

    if (!modifierPressed || alternateModifierPressed) {
      return false;
    }
    if (!event.shiftKey) {
      return false;
    }

    return (event.key || "").toLowerCase() === "k";
  }

  mediator.register({
    id: "quick-prompts",
    label: "Quick Prompts",
    shortcut: ["meta", "shift", "K"],
    shortcutCheck: checkShortcut,
    open: function () {
      openOverlay();
    },
    close: function () {
      closeOverlay();
    },
    isOpen: function () {
      return state.isOpen;
    },
  });

  document.addEventListener(
    "keydown",
    function (event) {
      if (event.__duckaiToolsHandled__) {
        return;
      }
      mediator.handleShortcut(event);
    },
    true,
  );

  function ensureFakeButton() {
    var existing = document.querySelector("[" + STATE_ATTR + '="fake-button"]');
    if (existing) {
      return existing.querySelector("button");
    }

    var container = document.querySelector(
      '[data-testid="duckai-chat-input"] :has(> div > div:nth-of-type(1) > input[type="file"])',
    );
    if (!container) {
      return null;
    }

    var refBtn = container.querySelector("button:nth-of-type(1)");
    if (!refBtn) {
      return null;
    }

    var refInner = refBtn.parentElement;
    var refOuter = refInner && refInner.parentElement;

    var outer = document.createElement("div");
    outer.setAttribute(STATE_ATTR, "fake-button");
    outer.className = refOuter.className;

    var inner = document.createElement("div");
    inner.className = refInner.className;

    var btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("aria-label", "Quick prompts");
    btn.tabIndex = 0;
    btn.className = refBtn.className;
    btn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style="fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;"><path d="M19 3H9C7.11438 3 6.17157 3 5.58579 3.58579C5 4.17157 5 5.11438 5 7V10.5V17"/><path d="M14 17V19C14 20.1046 14.8954 21 16 21C17.1046 21 18 20.1046 18 19V9V4.5C18 3.67157 18.6716 3 19.5 3C20.3284 3 21 3.67157 21 4.5C21 5.32843 20.3284 6 19.5 6H18.5"/><path d="M16 21H5C3.89543 21 3 20.1046 3 19C3 17.8954 3.89543 17 5 17H14"/><path d="M9 7H14"/><path d="M9 11H14"/></svg>';

    btn.addEventListener("click", function () {
      if (state.isOpen) {
        closeOverlay();
      } else {
        openOverlay();
      }
    });

    inner.appendChild(btn);
    outer.appendChild(inner);
    container.appendChild(outer);
    return btn;
  }

  function initFakeButton() {
    ensureFakeButton();

    if (!state.anchorObserver) {
      state.anchorObserver = new MutationObserver(function () {
        var anchor = document.querySelector(
          '[data-testid="duckai-chat-input"] :has(> div > div:nth-of-type(1) > input[type="file"])',
        );
        var fake = document.querySelector("[" + STATE_ATTR + '="fake-button"]');
        if (anchor && !fake) {
          ensureFakeButton();
        }
      });
      state.anchorObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }
  }

  function init() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initFakeButton);
    } else {
      initFakeButton();
    }
  }

  init();
})();
