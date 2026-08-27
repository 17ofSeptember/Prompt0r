// app.js — Main application entry point

import { NODE_REGISTRY, CATEGORIES, CATEGORY_ORDER, createNode, setNodeCounter } from './nodes.js';
import {
  initCanvas, applyTransform, renderAllNodes, renderNode,
  deleteNode, selectNode, addNodeToCanvas, updateConnections,
  updateMinimap, fitToScreen, screenToCanvas,
  showContextMenu, hideContextMenu, buildAddNodeMenu, applySearch
} from './canvas.js';
import { exportJSON, downloadJSON } from './exporter.js';

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

// ── Shared functions namespace ────────────────────────────────────────────────

window.promptForge = {
  pushHistory() {
    const snap = {
      nodes:       JSON.parse(JSON.stringify(window.AppState.nodes)),
      connections: JSON.parse(JSON.stringify(window.AppState.connections))
    };
    window.AppState.history.push(snap);
    if (window.AppState.history.length > 50) window.AppState.history.shift();
    window.AppState.futureHistory = [];
  },

  undo() {
    if (window.AppState.history.length === 0) return;
    const current = {
      nodes:       JSON.parse(JSON.stringify(window.AppState.nodes)),
      connections: JSON.parse(JSON.stringify(window.AppState.connections))
    };
    window.AppState.futureHistory.push(current);
    const prev = window.AppState.history.pop();
    window.AppState.nodes       = prev.nodes;
    window.AppState.connections = prev.connections;
    // Restore counter to highest used id
    const maxId = prev.nodes.reduce((m, n) => {
      const num = parseInt(n.id.replace('node_', ''), 10);
      return isNaN(num) ? m : Math.max(m, num);
    }, 0);
    setNodeCounter(maxId);
    renderAllNodes();
    window.promptForge.showToast('Undo', 'info');
  },

  saveSession() {
    const data = {
      nodes:       window.AppState.nodes,
      connections: window.AppState.connections,
      canvas:      window.AppState.canvas,
      customNodes: window.AppState.customNodes
    };
    localStorage.setItem('promptforge_session', JSON.stringify(data));
    window.promptForge.showToast('Session saved', 'success');
  },

  loadSession() {
    const raw = localStorage.getItem('promptforge_session');
    if (!raw) { window.promptForge.showToast('No saved session found', 'error'); return; }
    try {
      const data = JSON.parse(raw);
      window.AppState.nodes       = data.nodes       || [];
      window.AppState.connections = data.connections || [];
      window.AppState.canvas      = data.canvas      || { panX: 0, panY: 0, zoom: 1 };
      window.AppState.customNodes = data.customNodes || [];
      // Restore counter
      const maxId = window.AppState.nodes.reduce((m, n) => {
        const num = parseInt(n.id.replace('node_', ''), 10);
        return isNaN(num) ? m : Math.max(m, num);
      }, 0);
      setNodeCounter(maxId);
      // Restore custom node registry
      window.AppState.customNodes.forEach(cn => {
        NODE_REGISTRY[`custom_${cn.id}`] = cn;
      });
      applyTransform();
      renderAllNodes();
      buildAddNodeMenu();
      window.promptForge.showToast('Session loaded', 'success');
    } catch (e) {
      window.promptForge.showToast('Failed to load session', 'error');
    }
  },

  exportJSON() { exportJSON(); },

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: '✓', error: '✕', info: 'ℹ' };
    toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('hiding');
      setTimeout(() => toast.remove(), 350);
    }, 3000);
  }
};

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Load custom nodes from localStorage
  _loadCustomNodes();

  // Init canvas
  initCanvas();
  buildAddNodeMenu();

  // Wire up toolbar
  _bindToolbar();

  // Keyboard shortcuts
  _bindKeyboard();

  // Modal buttons
  _bindModals();

  // Custom node creator
  _bindCustomNodeCreator();

  // Search
  document.getElementById('search-input').addEventListener('input', e => {
    applySearch(e.target.value);
  });

  // Show welcome overlay on first ever visit
  const seen = localStorage.getItem('promptforge_welcomed');
  if (!seen) {
    document.getElementById('welcome-overlay').style.display = 'flex';
  } else {
    document.getElementById('welcome-overlay').style.display = 'none';
  }

  document.getElementById('btn-start').addEventListener('click', () => {
    document.getElementById('welcome-overlay').style.display = 'none';
    localStorage.setItem('promptforge_welcomed', '1');
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
});

// ── Toolbar ───────────────────────────────────────────────────────────────────

function _bindToolbar() {
  document.getElementById('btn-zoom-out').addEventListener('click', () => {
    _zoomCenter(0.85);
  });
  document.getElementById('btn-zoom-in').addEventListener('click', () => {
    _zoomCenter(1.15);
  });
  document.getElementById('btn-fit').addEventListener('click', fitToScreen);

  // Add Node dropdown toggle
  const addBtn  = document.getElementById('btn-add-node');
  const addMenu = document.getElementById('add-node-menu');
  addBtn.addEventListener('click', e => {
    e.stopPropagation();
    addMenu.classList.toggle('hidden');
    buildAddNodeMenu();
  });

  document.getElementById('btn-custom-node').addEventListener('click', () => {
    _openCustomNodeModal();
  });

  document.getElementById('btn-clear').addEventListener('click', () => {
    if (window.AppState.nodes.length === 0) return;
    if (confirm('Clear the canvas? This cannot be undone.')) {
      window.promptForge.pushHistory();
      window.AppState.nodes       = [];
      window.AppState.connections = [];
      window.AppState.selectedNodeId = null;
      renderAllNodes();
      window.promptForge.showToast('Canvas cleared', 'info');
    }
  });

  document.getElementById('btn-save').addEventListener('click', () => {
    window.promptForge.saveSession();
  });

  document.getElementById('btn-load').addEventListener('click', () => {
    window.promptForge.loadSession();
  });

  document.getElementById('btn-export').addEventListener('click', () => {
    if (window.AppState.nodes.length === 0) {
      window.promptForge.showToast('Add some nodes first!', 'error');
      return;
    }
    window.promptForge.exportJSON();
  });
}

function _zoomCenter(factor) {
  const { panX, panY, zoom } = window.AppState.canvas;
  const cx = document.getElementById('canvas-wrapper').clientWidth  / 2;
  const cy = document.getElementById('canvas-wrapper').clientHeight / 2;
  const newZoom = Math.min(3, Math.max(0.25, zoom * factor));
  window.AppState.canvas.panX = cx - (cx - panX) * (newZoom / zoom);
  window.AppState.canvas.panY = cy - (cy - panY) * (newZoom / zoom);
  window.AppState.canvas.zoom = newZoom;
  applyTransform();
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────────

function _bindKeyboard() {
  document.addEventListener('keydown', e => {
    const active = document.activeElement;
    const inInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT');

    if (e.code === 'Escape') {
      selectNode(null);
      hideContextMenu();
      document.getElementById('export-modal').classList.add('hidden');
      document.getElementById('custom-node-modal').classList.add('hidden');
      document.getElementById('add-node-menu').classList.add('hidden');
    }

    if (!inInput) {
      if (e.code === 'Delete' || e.code === 'Backspace') {
        if (window.AppState.selectedNodeId) {
          deleteNode(window.AppState.selectedNodeId);
        }
      }
    }

    if (e.ctrlKey || e.metaKey) {
      if (e.code === 'KeyZ') { e.preventDefault(); window.promptForge.undo(); }
      if (e.code === 'KeyS') { e.preventDefault(); window.promptForge.saveSession(); }
      if (e.code === 'KeyE') { e.preventDefault(); window.promptForge.exportJSON(); }
    }
  });
}

// ── Modals ────────────────────────────────────────────────────────────────────

function _bindModals() {
  // Export modal
  document.getElementById('btn-close-export').addEventListener('click', () => {
    document.getElementById('export-modal').classList.add('hidden');
  });

  document.getElementById('export-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('export-modal'))
      document.getElementById('export-modal').classList.add('hidden');
  });

  document.getElementById('btn-copy-json').addEventListener('click', () => {
    if (!window._lastExportData) return;
    navigator.clipboard.writeText(JSON.stringify(window._lastExportData, null, 2))
      .then(() => window.promptForge.showToast('Copied to clipboard!', 'success'))
      .catch(() => {
        // Fallback
        const el = document.createElement('textarea');
        el.value = JSON.stringify(window._lastExportData, null, 2);
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        el.remove();
        window.promptForge.showToast('Copied to clipboard!', 'success');
      });
  });

  document.getElementById('btn-download-json').addEventListener('click', () => {
    if (!window._lastExportData) return;
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    downloadJSON(window._lastExportData, `promptforge_${ts}.json`);
    window.promptForge.showToast('Downloading JSON…', 'success');
  });

  // Custom node modal close
  document.getElementById('btn-close-custom').addEventListener('click', () => {
    document.getElementById('custom-node-modal').classList.add('hidden');
  });

  document.getElementById('custom-node-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('custom-node-modal'))
      document.getElementById('custom-node-modal').classList.add('hidden');
  });
}

// ── Custom node creator ───────────────────────────────────────────────────────

function _openCustomNodeModal() {
  // Reset form
  document.getElementById('custom-node-name').value = '';
  document.getElementById('custom-node-icon').value = '✨';
  document.getElementById('custom-node-desc').value = '';
  document.getElementById('custom-fields-list').innerHTML = '';
  _addCustomField(); // start with one field
  document.getElementById('custom-node-modal').classList.remove('hidden');
}

function _addCustomField() {
  const list  = document.getElementById('custom-fields-list');
  const idx   = list.children.length;
  const item  = document.createElement('div');
  item.className = 'custom-field-item';
  item.dataset.idx = idx;
  item.innerHTML = `
    <div class="custom-field-row">
      <div style="flex:1">
        <div class="form-group" style="margin-bottom:0">
          <label>Field Label</label>
          <input type="text" class="form-input cf-label" placeholder="My Field">
        </div>
      </div>
      <div style="width:120px">
        <div class="form-group" style="margin-bottom:0">
          <label>Type</label>
          <select class="form-input cf-type">
            <option value="text">Text</option>
            <option value="textarea">Text Area</option>
            <option value="number">Number</option>
            <option value="dropdown">Dropdown</option>
            <option value="slider">Slider</option>
            <option value="toggle">Toggle</option>
          </select>
        </div>
      </div>
      <button class="custom-field-remove" style="margin-top:20px">×</button>
    </div>
    <div class="custom-field-row cf-extra-options" style="display:none">
      <div style="flex:1">
        <label class="form-group" style="margin-bottom:4px;display:block;font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px">
          Options (comma-separated) / Min–Max
        </label>
        <input type="text" class="form-input cf-options" placeholder="option1, option2, option3">
      </div>
    </div>
    <div class="custom-field-row">
      <div style="flex:1">
        <div class="form-group" style="margin-bottom:0">
          <label>Default Value</label>
          <input type="text" class="form-input cf-default" placeholder="">
        </div>
      </div>
    </div>`;

  // Show/hide extra options
  item.querySelector('.cf-type').addEventListener('change', e => {
    const needsExtra = ['dropdown','slider'].includes(e.target.value);
    item.querySelector('.cf-extra-options').style.display = needsExtra ? 'flex' : 'none';
    const ph = e.target.value === 'dropdown' ? 'option1, option2, option3' : 'min,max (e.g. 0,100)';
    item.querySelector('.cf-options').placeholder = ph;
  });

  item.querySelector('.custom-field-remove').addEventListener('click', () => item.remove());
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

  if (!name) { window.promptForge.showToast('Please enter a node name', 'error'); return; }

  const fields = [];
  document.querySelectorAll('#custom-fields-list .custom-field-item').forEach((item, i) => {
    const label     = item.querySelector('.cf-label').value.trim() || `Field ${i+1}`;
    const type      = item.querySelector('.cf-type').value;
    const optionsRaw = item.querySelector('.cf-options').value.trim();
    const defVal    = item.querySelector('.cf-default').value.trim();
    const key       = label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

    const field = { key: key || `field_${i}`, label, type };

    if (type === 'dropdown') {
      field.options = optionsRaw ? optionsRaw.split(',').map(s => s.trim()).filter(Boolean) : ['Option 1'];
      field.value   = defVal || field.options[0];
    } else if (type === 'slider') {
      const parts = optionsRaw.split(',').map(s => parseFloat(s.trim()));
      field.min   = isNaN(parts[0]) ? 0   : parts[0];
      field.max   = isNaN(parts[1]) ? 100 : parts[1];
      field.step  = 1;
      field.value = defVal ? parseFloat(defVal) : field.min;
    } else if (type === 'toggle') {
      field.value = defVal === 'true';
    } else if (type === 'number') {
      field.value = defVal ? parseFloat(defVal) : 0;
    } else if (type === 'multicheckbox') {
      field.options = optionsRaw ? optionsRaw.split(',').map(s => s.trim()) : [];
      field.value   = [];
    } else {
      field.value       = defVal || '';
      field.placeholder = defVal || '';
    }

    fields.push(field);
  });

  if (fields.length === 0) { window.promptForge.showToast('Add at least one field', 'error'); return; }

  const id = String(Date.now());
  const customDef = {
    id,
    name,
    icon,
    description: desc,
    category: 'custom',
    fields
  };

  // Register in NODE_REGISTRY
  NODE_REGISTRY[`custom_${id}`] = customDef;
  window.AppState.customNodes.push(customDef);
  _saveCustomNodes();

  document.getElementById('custom-node-modal').classList.add('hidden');
  buildAddNodeMenu();
  window.promptForge.showToast(`Custom node "${name}" created`, 'success');
}

function _loadCustomNodes() {
  const raw = localStorage.getItem('promptforge_custom_nodes');
  if (!raw) return;
  try {
    const customs = JSON.parse(raw);
    window.AppState.customNodes = customs;
    customs.forEach(cn => {
      NODE_REGISTRY[`custom_${cn.id}`] = cn;
    });
  } catch (_) {}
}

function _saveCustomNodes() {
  localStorage.setItem('promptforge_custom_nodes', JSON.stringify(window.AppState.customNodes));
}
