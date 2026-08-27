/*
 * Prompt0r - Visual AI Prompt Builder
 * Copyright (C) 2026 17OfSeptember <https://github.com/17ofSeptember>
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at your
 * option) any later version. It is distributed WITHOUT ANY WARRANTY; without
 * even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR
 * PURPOSE. See the GNU Affero General Public License for details:
 * <https://www.gnu.org/licenses/>.
 */

// app.js - Main application entry point

import { NODE_REGISTRY, createNode, setNodeCounter } from './nodes.js';
import {
  initCanvas, applyTransform, renderAllNodes, deleteNode, selectNode,
  fitToScreen, hideContextMenu, buildAddNodeMenu, applySearch,
  setAddNodeMenuOpen, isAddNodeMenuOpen
} from './canvas.js';
import { exportJSON, downloadJSON } from './exporter.js';

// ── Constants ─────────────────────────────────────────────────────────────────

export const APP_NAME    = 'Prompt0r';
export const APP_VERSION = '1.0.0';

const HISTORY_LIMIT   = 50;
const AUTOSAVE_DELAY  = 800;   // ms of idle before an autosave is written

const STORAGE_KEYS = {
  session:     'prompt0r_session',
  autosave:    'prompt0r_autosave',
  customNodes: 'prompt0r_custom_nodes',
  welcomed:    'prompt0r_welcomed'
};

// Keys used before the rename. Anyone who used the app as PromptForge still has
// their work under these, so it is carried over once and the old keys dropped.
const LEGACY_STORAGE_KEYS = {
  session:     'promptforge_session',
  autosave:    'promptforge_autosave',
  customNodes: 'promptforge_custom_nodes',
  welcomed:    'promptforge_welcomed'
};

// ── AppState ──────────────────────────────────────────────────────────────────

window.AppState = {
  nodes:          [],
  connections:    [],
  canvas:         { panX: 0, panY: 0, zoom: 1 },
  selectedNodeId: null,
  history:        [],
  futureHistory:  [],
  customNodes:    [],
  searchQuery:    '',
  spaceDown:      false
};

// ── Shared factory (avoids circular imports) ──────────────────────────────────

window._nodeFactory = { NODE_REGISTRY, createNode };

// ── Safe storage ──────────────────────────────────────────────────────────────
// localStorage throws in Safari private mode and when the quota is exceeded.
// Every access goes through here so a storage failure degrades to a toast
// instead of taking the whole app down.

const storage = {
  get(key) {
    try { return localStorage.getItem(key); }
    catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); return true; }
    catch { return false; }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { /* nothing to do */ }
  }
};

/** One-time carry-over of pre-rename data. Never overwrites a newer value. */
function migrateLegacyStorage() {
  for (const [name, legacyKey] of Object.entries(LEGACY_STORAGE_KEYS)) {
    const legacyValue = storage.get(legacyKey);
    if (legacyValue === null) continue;
    if (storage.get(STORAGE_KEYS[name]) === null) storage.set(STORAGE_KEYS[name], legacyValue);
    storage.remove(legacyKey);
  }
}

// ── Snapshots ─────────────────────────────────────────────────────────────────

const _clone = obj =>
  typeof structuredClone === 'function'
    ? structuredClone(obj)
    : JSON.parse(JSON.stringify(obj));

function _snapshot() {
  return {
    nodes:       _clone(window.AppState.nodes),
    connections: _clone(window.AppState.connections)
  };
}

function _restore(snap) {
  window.AppState.nodes       = snap.nodes;
  window.AppState.connections = snap.connections;
  window.AppState.selectedNodeId = null;
  // Keep the id counter ahead of every restored node so new nodes never collide.
  const maxId = snap.nodes.reduce((m, n) => {
    const num = parseInt(String(n.id).replace('node_', ''), 10);
    return Number.isNaN(num) ? m : Math.max(m, num);
  }, 0);
  setNodeCounter(maxId);
  renderAllNodes();
  scheduleAutosave();
}

// The state as of the last commit. pushHistory() is called *after* a mutation,
// so this is what holds the pre-change state that undo needs — without it, the
// first undo restored the state the user was already looking at and did nothing.
let _lastCommitted = null;

// ── Autosave ──────────────────────────────────────────────────────────────────

let _autosaveTimer = null;
let _autosaveWarned = false;

function scheduleAutosave() {
  clearTimeout(_autosaveTimer);
  _autosaveTimer = setTimeout(writeAutosave, AUTOSAVE_DELAY);
}

function writeAutosave() {
  const ok = storage.set(STORAGE_KEYS.autosave, JSON.stringify(_serializeSession()));
  if (!ok && !_autosaveWarned) {
    _autosaveWarned = true;   // warn once per page load, not on every keystroke
    window.prompt0r.showToast('Autosave unavailable — browser storage is blocked or full', 'error');
  }
}

function _serializeSession() {
  return {
    version:     1,
    nodes:       window.AppState.nodes,
    connections: window.AppState.connections,
    canvas:      window.AppState.canvas,
    customNodes: window.AppState.customNodes
  };
}

function _applySession(data) {
  window.AppState.nodes       = Array.isArray(data.nodes)       ? data.nodes       : [];
  window.AppState.connections = Array.isArray(data.connections) ? data.connections : [];
  window.AppState.canvas      = data.canvas && typeof data.canvas === 'object'
    ? { panX: 0, panY: 0, zoom: 1, ...data.canvas }
    : { panX: 0, panY: 0, zoom: 1 };
  window.AppState.customNodes = Array.isArray(data.customNodes) ? data.customNodes : [];

  const maxId = window.AppState.nodes.reduce((m, n) => {
    const num = parseInt(String(n.id).replace('node_', ''), 10);
    return Number.isNaN(num) ? m : Math.max(m, num);
  }, 0);
  setNodeCounter(maxId);

  window.AppState.customNodes.forEach(cn => {
    if (cn && cn.id) NODE_REGISTRY[`custom_${cn.id}`] = cn;
  });

  window.AppState.history       = [];
  window.AppState.futureHistory = [];
  _lastCommitted = _snapshot();

  applyTransform();
  renderAllNodes();
  buildAddNodeMenu();
}

// ── Shared functions namespace ────────────────────────────────────────────────

window.prompt0r = {
  /** Commit the current state. Call *after* mutating AppState. */
  pushHistory() {
    if (_lastCommitted) {
      window.AppState.history.push(_lastCommitted);
      if (window.AppState.history.length > HISTORY_LIMIT) window.AppState.history.shift();
    }
    _lastCommitted = _snapshot();
    window.AppState.futureHistory = [];
    scheduleAutosave();
  },

  undo() {
    if (window.AppState.history.length === 0) {
      window.prompt0r.showToast('Nothing to undo', 'info');
      return;
    }
    window.AppState.futureHistory.push(_snapshot());
    const prev = window.AppState.history.pop();
    _lastCommitted = _clone(prev);
    _restore(prev);
    window.prompt0r.showToast('Undo', 'info');
  },

  redo() {
    if (window.AppState.futureHistory.length === 0) {
      window.prompt0r.showToast('Nothing to redo', 'info');
      return;
    }
    window.AppState.history.push(_snapshot());
    const next = window.AppState.futureHistory.pop();
    _lastCommitted = _clone(next);
    _restore(next);
    window.prompt0r.showToast('Redo', 'info');
  },

  saveSession() {
    const ok = storage.set(STORAGE_KEYS.session, JSON.stringify(_serializeSession()));
    window.prompt0r.showToast(
      ok ? 'Session saved' : 'Could not save — browser storage is blocked or full',
      ok ? 'success' : 'error'
    );
  },

  loadSession() {
    const raw = storage.get(STORAGE_KEYS.session);
    if (!raw) { window.prompt0r.showToast('No saved session found', 'error'); return; }
    try {
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object') throw new Error('malformed session');
      _applySession(data);
      window.prompt0r.showToast('Session loaded', 'success');
    } catch {
      window.prompt0r.showToast('Failed to load session — the saved data is corrupt', 'error');
    }
  },

  exportJSON() {
    if (window.AppState.nodes.length === 0) {
      window.prompt0r.showToast('Add some nodes first!', 'error');
      return;
    }
    exportJSON();
  },

  clearCanvas() {
    if (window.AppState.nodes.length === 0) return;
    if (!confirm('Clear the canvas? You can undo this with Ctrl+Z.')) return;
    window.AppState.nodes       = [];
    window.AppState.connections = [];
    window.AppState.selectedNodeId = null;
    renderAllNodes();
    window.prompt0r.pushHistory();
    window.prompt0r.showToast('Canvas cleared', 'info');
  },

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: '✓', error: '✕', info: 'ℹ' };

    // textContent, not innerHTML: toast text embeds node names, which are
    // user-authored and must never be parsed as markup.
    const icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = icons[type] || 'ℹ';
    const text = document.createElement('span');
    text.textContent = message;
    toast.append(icon, text);

    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('hiding');
      setTimeout(() => toast.remove(), 350);
    }, 3000);
  }
};

// ── Modal focus management ────────────────────────────────────────────────────

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), ' +
                  'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
let _focusReturn = null;

function openModal(el) {
  _focusReturn = document.activeElement;
  el.classList.remove('hidden');
  el.style.removeProperty('display');
  const first = el.querySelector(FOCUSABLE);
  if (first) first.focus();
}

function closeModal(el) {
  if (el.classList.contains('hidden')) return;
  el.classList.add('hidden');
  if (_focusReturn && document.contains(_focusReturn)) _focusReturn.focus();
  _focusReturn = null;
}

/** Keep Tab inside an open dialog so keyboard users can't wander behind it. */
function trapFocus(e) {
  if (e.key !== 'Tab') return;
  const modal = [...document.querySelectorAll('.modal-overlay:not(.hidden), #welcome-overlay')]
    .find(m => m.id === 'welcome-overlay'
      ? getComputedStyle(m).display !== 'none'
      : !m.classList.contains('hidden'));
  if (!modal) return;

  const items = [...modal.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null);
  if (items.length === 0) return;
  const first = items[0];
  const last  = items[items.length - 1];

  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

function closeAllOverlays() {
  hideContextMenu();
  setAddNodeMenuOpen(false);
  closeModal(document.getElementById('export-modal'));
  closeModal(document.getElementById('custom-node-modal'));
  closeModal(document.getElementById('about-modal'));
  _setMobileMenuOpen(false);
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  migrateLegacyStorage();
  _loadCustomNodes();

  initCanvas();
  buildAddNodeMenu();

  _bindToolbar();
  _bindKeyboard();
  _bindModals();
  _bindCustomNodeCreator();

  document.getElementById('search-input').addEventListener('input', e => {
    applySearch(e.target.value);
    const mobile = document.getElementById('mobile-search');
    if (mobile.value !== e.target.value) mobile.value = e.target.value;
  });

  // Restore whatever was on the canvas when the tab was last closed.
  _restoreAutosave();
  _lastCommitted = _snapshot();

  // Welcome overlay on first ever visit
  const overlay = document.getElementById('welcome-overlay');
  if (storage.get(STORAGE_KEYS.welcomed)) {
    overlay.style.display = 'none';
  } else {
    overlay.style.display = 'flex';
    const start = document.getElementById('btn-start');
    if (start) start.focus();
  }

  document.getElementById('btn-start').addEventListener('click', () => {
    overlay.style.display = 'none';
    storage.set(STORAGE_KEYS.welcomed, '1');
  });

  // Space-bar pan cursor
  document.addEventListener('keydown', e => {
    if (e.code === 'Space' && document.activeElement === document.body) {
      e.preventDefault();
      window.AppState.spaceDown = true;
      document.getElementById('canvas-wrapper').style.cursor = 'grab';
    }
  });
  document.addEventListener('keyup', e => {
    if (e.code === 'Space') {
      window.AppState.spaceDown = false;
      document.getElementById('canvas-wrapper').style.cursor = 'default';
    }
  });

  // Flush any pending autosave before the tab goes away.
  window.addEventListener('pagehide', writeAutosave);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') writeAutosave();
  });

  // Surface unexpected failures instead of dying silently in the console.
  window.addEventListener('error', e => {
    console.error(`[${APP_NAME}]`, e.error || e.message);
    window.prompt0r.showToast('Something went wrong — check the console', 'error');
  });
});

function _restoreAutosave() {
  const raw = storage.get(STORAGE_KEYS.autosave);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.nodes) || data.nodes.length === 0) return;
    _applySession(data);
    window.prompt0r.showToast(`Restored ${data.nodes.length} node${data.nodes.length === 1 ? '' : 's'} from your last session`, 'info');
  } catch {
    // A corrupt autosave must never block startup — drop it and start clean.
    storage.remove(STORAGE_KEYS.autosave);
  }
}

// ── Toolbar ───────────────────────────────────────────────────────────────────

function _setMobileMenuOpen(open) {
  const menu = document.getElementById('mobile-more-menu');
  const btn  = document.getElementById('btn-mobile-more');
  menu.classList.toggle('hidden', !open);
  btn.setAttribute('aria-expanded', String(open));
}

function _bindToolbar() {
  document.getElementById('btn-zoom-out').addEventListener('click', () => _zoomCenter(0.85));
  document.getElementById('btn-zoom-in').addEventListener('click',  () => _zoomCenter(1.15));
  document.getElementById('btn-fit').addEventListener('click', fitToScreen);

  document.getElementById('btn-add-node').addEventListener('click', e => {
    e.stopPropagation();
    setAddNodeMenuOpen(!isAddNodeMenuOpen());
  });

  document.getElementById('btn-custom-node').addEventListener('click', _openCustomNodeModal);
  document.getElementById('btn-about').addEventListener('click', _openAboutModal);
  document.getElementById('btn-clear').addEventListener('click', () => window.prompt0r.clearCanvas());
  document.getElementById('btn-save').addEventListener('click',  () => window.prompt0r.saveSession());
  document.getElementById('btn-load').addEventListener('click',  () => window.prompt0r.loadSession());
  document.getElementById('btn-export').addEventListener('click', () => window.prompt0r.exportJSON());

  // ── Mobile More panel ─────────────────────────────────────────────────────
  const moreBtn = document.getElementById('btn-mobile-more');
  moreBtn.addEventListener('click', e => {
    e.stopPropagation();
    _setMobileMenuOpen(document.getElementById('mobile-more-menu').classList.contains('hidden'));
  });
  document.getElementById('canvas-wrapper').addEventListener('touchstart', () => {
    _setMobileMenuOpen(false);
  }, { passive: true });

  // Mirror mobile search → main search filter
  document.getElementById('mobile-search').addEventListener('input', e => {
    applySearch(e.target.value);
    document.getElementById('search-input').value = e.target.value;
  });

  const runAndClose = fn => () => { fn(); _setMobileMenuOpen(false); };
  document.getElementById('mob-btn-fit').addEventListener('click',    runAndClose(fitToScreen));
  document.getElementById('mob-btn-save').addEventListener('click',   runAndClose(() => window.prompt0r.saveSession()));
  document.getElementById('mob-btn-load').addEventListener('click',   runAndClose(() => window.prompt0r.loadSession()));
  document.getElementById('mob-btn-custom').addEventListener('click', runAndClose(_openCustomNodeModal));
  document.getElementById('mob-btn-clear').addEventListener('click',  runAndClose(() => window.prompt0r.clearCanvas()));
  document.getElementById('mob-btn-about').addEventListener('click',  runAndClose(_openAboutModal));
}

function _zoomCenter(factor) {
  const wrapper = document.getElementById('canvas-wrapper');
  const { panX, panY, zoom } = window.AppState.canvas;
  const cx = wrapper.clientWidth  / 2;
  const cy = wrapper.clientHeight / 2;
  const newZoom = Math.min(3, Math.max(0.25, zoom * factor));
  window.AppState.canvas.panX = cx - (cx - panX) * (newZoom / zoom);
  window.AppState.canvas.panY = cy - (cy - panY) * (newZoom / zoom);
  window.AppState.canvas.zoom = newZoom;
  applyTransform();
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────────

function _bindKeyboard() {
  document.addEventListener('keydown', trapFocus);

  document.addEventListener('keydown', e => {
    const active  = document.activeElement;
    const inInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT');

    if (e.key === 'Escape') {
      selectNode(null);
      closeAllOverlays();
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      // Ctrl+Shift+Z and Ctrl+Y both redo, matching the two common conventions.
      if (e.code === 'KeyZ' && e.shiftKey) { e.preventDefault(); window.prompt0r.redo(); return; }
      if (e.code === 'KeyZ')               { e.preventDefault(); window.prompt0r.undo(); return; }
      if (e.code === 'KeyY')               { e.preventDefault(); window.prompt0r.redo(); return; }
      if (e.code === 'KeyS')               { e.preventDefault(); window.prompt0r.saveSession(); return; }
      if (e.code === 'KeyE')               { e.preventDefault(); window.prompt0r.exportJSON(); return; }
    }

    if (inInput) return;

    if (e.code === 'Delete' || e.code === 'Backspace') {
      if (window.AppState.selectedNodeId) {
        e.preventDefault();
        deleteNode(window.AppState.selectedNodeId);
      }
    }
    if (e.code === 'KeyF') { e.preventDefault(); fitToScreen(); }
  });
}

// ── Modals ────────────────────────────────────────────────────────────────────

function _openAboutModal() {
  openModal(document.getElementById('about-modal'));
}

function _bindModals() {
  const exportModal = document.getElementById('export-modal');
  const customModal = document.getElementById('custom-node-modal');
  const aboutModal  = document.getElementById('about-modal');

  // Single source of truth for the version shown in the About dialog.
  const versionEl = document.getElementById('about-version');
  if (versionEl) versionEl.textContent = APP_VERSION;

  document.getElementById('btn-close-about').addEventListener('click', () => closeModal(aboutModal));
  aboutModal.addEventListener('click', e => { if (e.target === aboutModal) closeModal(aboutModal); });

  document.getElementById('btn-close-export').addEventListener('click', () => closeModal(exportModal));
  exportModal.addEventListener('click', e => { if (e.target === exportModal) closeModal(exportModal); });

  document.getElementById('btn-close-custom').addEventListener('click', () => closeModal(customModal));
  customModal.addEventListener('click', e => { if (e.target === customModal) closeModal(customModal); });

  document.getElementById('btn-copy-json').addEventListener('click', async () => {
    if (!window._lastExportData) return;
    const text = JSON.stringify(window._lastExportData, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      window.prompt0r.showToast('Copied to clipboard!', 'success');
    } catch {
      // navigator.clipboard is unavailable on insecure origins and in some
      // embedded webviews — fall back to the legacy selection copy.
      if (_legacyCopy(text)) window.prompt0r.showToast('Copied to clipboard!', 'success');
      else window.prompt0r.showToast('Copy failed — select the JSON and copy manually', 'error');
    }
  });

  document.getElementById('btn-download-json').addEventListener('click', () => {
    if (!window._lastExportData) return;
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    downloadJSON(window._lastExportData, `prompt0r_${ts}.json`);
    window.prompt0r.showToast('Downloading JSON…', 'success');
  });
}

function _legacyCopy(text) {
  const el = document.createElement('textarea');
  el.value = text;
  el.setAttribute('readonly', '');
  el.style.position = 'fixed';
  el.style.opacity = '0';
  document.body.appendChild(el);
  el.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  el.remove();
  return ok;
}

// ── Custom node creator ───────────────────────────────────────────────────────

function _openCustomNodeModal() {
  document.getElementById('custom-node-name').value = '';
  document.getElementById('custom-node-icon').value = '✨';
  document.getElementById('custom-node-desc').value = '';
  document.getElementById('custom-fields-list').innerHTML = '';
  _addCustomField();
  openModal(document.getElementById('custom-node-modal'));
  document.getElementById('custom-node-name').focus();
}

let _cfSeq = 0;

function _addCustomField() {
  const list = document.getElementById('custom-fields-list');
  const uid  = `cf${++_cfSeq}`;
  const item = document.createElement('div');
  item.className = 'custom-field-item';
  item.innerHTML = `
    <div class="custom-field-row">
      <div class="custom-field-grow">
        <div class="form-group">
          <label for="${uid}-label">Field Label</label>
          <input type="text" id="${uid}-label" class="form-input cf-label" placeholder="My Field" maxlength="60">
        </div>
      </div>
      <div class="custom-field-type">
        <div class="form-group">
          <label for="${uid}-type">Type</label>
          <select id="${uid}-type" class="form-input cf-type">
            <option value="text">Text</option>
            <option value="textarea">Text Area</option>
            <option value="number">Number</option>
            <option value="dropdown">Dropdown</option>
            <option value="slider">Slider</option>
            <option value="toggle">Toggle</option>
          </select>
        </div>
      </div>
      <button class="custom-field-remove" type="button" aria-label="Remove this field">×</button>
    </div>
    <div class="custom-field-row cf-extra-options">
      <div class="custom-field-grow">
        <label class="form-group-label" for="${uid}-options">Options (comma-separated) / Min–Max</label>
        <input type="text" id="${uid}-options" class="form-input cf-options" placeholder="option1, option2, option3">
      </div>
    </div>
    <div class="custom-field-row">
      <div class="custom-field-grow">
        <div class="form-group">
          <label for="${uid}-default">Default Value</label>
          <input type="text" id="${uid}-default" class="form-input cf-default" placeholder="">
        </div>
      </div>
    </div>`;

  item.querySelector('.cf-type').addEventListener('change', e => {
    const needsExtra = ['dropdown', 'slider'].includes(e.target.value);
    item.querySelector('.cf-extra-options').classList.toggle('visible', needsExtra);
    item.querySelector('.cf-options').placeholder =
      e.target.value === 'dropdown' ? 'option1, option2, option3' : 'min,max (e.g. 0,100)';
  });

  item.querySelector('.custom-field-remove').addEventListener('click', () => {
    if (list.children.length === 1) {
      window.prompt0r.showToast('A node needs at least one field', 'error');
      return;
    }
    item.remove();
  });

  list.appendChild(item);
}

function _bindCustomNodeCreator() {
  document.getElementById('btn-add-field').addEventListener('click', _addCustomField);
  document.getElementById('btn-save-custom').addEventListener('click', _saveCustomNode);
}

function _saveCustomNode() {
  const name = document.getElementById('custom-node-name').value.trim();
  const icon = document.getElementById('custom-node-icon').value.trim() || '✨';
  const desc = document.getElementById('custom-node-desc').value.trim();

  if (!name) {
    window.prompt0r.showToast('Please enter a node name', 'error');
    document.getElementById('custom-node-name').focus();
    return;
  }

  const fields = [];
  const usedKeys = new Set();

  document.querySelectorAll('#custom-fields-list .custom-field-item').forEach((item, i) => {
    const label      = item.querySelector('.cf-label').value.trim() || `Field ${i + 1}`;
    const type       = item.querySelector('.cf-type').value;
    const optionsRaw = item.querySelector('.cf-options').value.trim();
    const defVal     = item.querySelector('.cf-default').value.trim();

    // Keys land in HTML attributes and in the exported JSON, so restrict them
    // to a safe slug and de-duplicate — two "Colour" fields must not collide.
    let key = label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') || `field_${i}`;
    while (usedKeys.has(key)) key = `${key}_${i}`;
    usedKeys.add(key);

    const field = { key, label, type };

    if (type === 'dropdown') {
      field.options = optionsRaw ? optionsRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
      if (field.options.length === 0) field.options = ['Option 1'];
      field.value = field.options.includes(defVal) ? defVal : field.options[0];
    } else if (type === 'slider') {
      const parts = optionsRaw.split(',').map(s => parseFloat(s.trim()));
      let min = Number.isNaN(parts[0]) ? 0   : parts[0];
      let max = Number.isNaN(parts[1]) ? 100 : parts[1];
      if (min > max) [min, max] = [max, min];         // tolerate "100,0"
      if (min === max) max = min + 1;                 // a zero-width range has no usable track
      field.min  = min;
      field.max  = max;
      field.step = (max - min) <= 10 ? 0.1 : 1;
      const parsed = parseFloat(defVal);
      field.value = Number.isNaN(parsed) ? min : Math.min(max, Math.max(min, parsed));
    } else if (type === 'toggle') {
      field.value = /^(true|yes|on|1)$/i.test(defVal);
    } else if (type === 'number') {
      const parsed = parseFloat(defVal);
      field.value = Number.isNaN(parsed) ? 0 : parsed;
    } else {
      field.value       = defVal || '';
      field.placeholder = defVal || '';
    }

    fields.push(field);
  });

  if (fields.length === 0) { window.prompt0r.showToast('Add at least one field', 'error'); return; }

  const id = String(Date.now());
  const customDef = { id, name, icon, description: desc, category: 'custom', fields };

  NODE_REGISTRY[`custom_${id}`] = customDef;
  window.AppState.customNodes.push(customDef);
  _saveCustomNodes();

  closeModal(document.getElementById('custom-node-modal'));
  buildAddNodeMenu();
  window.prompt0r.showToast(`Custom node "${name}" created`, 'success');
}

function _loadCustomNodes() {
  const raw = storage.get(STORAGE_KEYS.customNodes);
  if (!raw) return;
  try {
    const customs = JSON.parse(raw);
    if (!Array.isArray(customs)) return;
    window.AppState.customNodes = customs.filter(cn => cn && cn.id && Array.isArray(cn.fields));
    window.AppState.customNodes.forEach(cn => { NODE_REGISTRY[`custom_${cn.id}`] = cn; });
  } catch {
    storage.remove(STORAGE_KEYS.customNodes);
  }
}

function _saveCustomNodes() {
  const ok = storage.set(STORAGE_KEYS.customNodes, JSON.stringify(window.AppState.customNodes));
  if (!ok) window.prompt0r.showToast('Custom node saved for this session only — storage is blocked or full', 'error');
}
