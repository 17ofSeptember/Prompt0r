// canvas.js — Canvas rendering, pan/zoom, drag, connections, minimap

import { CATEGORIES, CATEGORY_ORDER, GRID_SNAP } from './nodes.js';

export const NODE_WIDTH = 260;
export const HEADER_HEIGHT = 44;
const GRID = GRID_SNAP;
const PORT_Y = HEADER_HEIGHT / 2; // vertical center of port on node

let canvasWrapper, canvasWorld, connectionsSvg, coordsDisplay, emptyHint, minimapCanvas, minimapCtx;
let dragState    = null;
let _pinchState  = null; // two-finger zoom
let _longPressTimer = null;
let _lastTouchEnd = 0;        // suppress simulated mouse events after touch
let _touchStartedOnInput = false; // skip canvas logic when touch is on a form element

// ── Init ──────────────────────────────────────────────────────────────────────

export function initCanvas() {
  canvasWrapper   = document.getElementById('canvas-wrapper');
  canvasWorld     = document.getElementById('canvas-world');
  connectionsSvg  = document.getElementById('connections-svg');
  coordsDisplay   = document.getElementById('canvas-coords');
  emptyHint       = document.getElementById('canvas-empty-hint');
  minimapCanvas   = document.getElementById('minimap');
  minimapCtx      = minimapCanvas.getContext('2d');

  // Start view so origin is roughly centered
  const s = window.AppState;
  s.canvas.panX = Math.round(canvasWrapper.clientWidth  / 2 - 200);
  s.canvas.panY = Math.round(canvasWrapper.clientHeight / 2 - 150);

  applyTransform();
  _setupEvents();
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function applyTransform() {
  const { panX, panY, zoom } = window.AppState.canvas;
  canvasWorld.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;

  const dot = GRID * zoom;
  canvasWrapper.style.backgroundSize     = `${dot}px ${dot}px`;
  canvasWrapper.style.backgroundPosition = `${panX}px ${panY}px`;

  document.getElementById('zoom-display').textContent = `${Math.round(zoom * 100)}%`;
  updateMinimap();
}

export function screenToCanvas(sx, sy) {
  const r = canvasWrapper.getBoundingClientRect();
  const { panX, panY, zoom } = window.AppState.canvas;
  return { x: (sx - r.left - panX) / zoom, y: (sy - r.top - panY) / zoom };
}

export function fitToScreen() {
  const nodes = window.AppState.nodes;
  if (nodes.length === 0) {
    window.AppState.canvas.panX  = canvasWrapper.clientWidth  / 2 - 200;
    window.AppState.canvas.panY  = canvasWrapper.clientHeight / 2 - 150;
    window.AppState.canvas.zoom  = 1;
    applyTransform();
    return;
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  nodes.forEach(n => {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + NODE_WIDTH);
    maxY = Math.max(maxY, n.y + 200);
  });
  const pad = 60;
  const bw = maxX - minX + pad * 2;
  const bh = maxY - minY + pad * 2;
  const zoom = Math.min(3, Math.max(0.25, Math.min(canvasWrapper.clientWidth / bw, canvasWrapper.clientHeight / bh)));
  window.AppState.canvas.zoom = zoom;
  window.AppState.canvas.panX = (canvasWrapper.clientWidth  - bw * zoom) / 2 - (minX - pad) * zoom;
  window.AppState.canvas.panY = (canvasWrapper.clientHeight - bh * zoom) / 2 - (minY - pad) * zoom;
  applyTransform();
}

// ── Node rendering ────────────────────────────────────────────────────────────

export function renderAllNodes() {
  // Clear existing node elements
  canvasWorld.querySelectorAll('.node').forEach(el => el.remove());
  window.AppState.nodes.forEach(node => renderNode(node));
  updateConnections();
  updateEmptyHint();
}

export function renderNode(node) {
  const catColor = (CATEGORIES[node.category] || CATEGORIES.custom).color;
  const el = document.createElement('div');
  el.className = 'node';
  el.id = `node-${node.id}`;
  el.dataset.nodeId = node.id;
  el.dataset.category = node.category;
  el.style.cssText = `left:${node.x}px;top:${node.y}px;`;

  el.innerHTML = `
    <div class="node-header" style="border-left-color:${catColor}">
      <div class="port port-input" title="Input port"></div>
      <span class="node-icon" aria-hidden="true">${escHtml(node.icon)}</span>
      <span class="node-name">${escHtml(node.name)}</span>
      <button class="node-collapse-btn" type="button" aria-expanded="${!node.collapsed}" aria-label="Collapse or expand ${escAttr(node.name)}" title="Collapse/Expand">${node.collapsed ? '▶' : '▼'}</button>
      <button class="node-delete-btn" type="button" aria-label="Delete ${escAttr(node.name)}" title="Delete node">×</button>
      <div class="port port-output" title="Output port"></div>
    </div>
    <div class="node-body${node.collapsed ? ' collapsed' : ''}">
      ${node.fields.map(f => renderField(node.id, f)).join('')}
    </div>`;

  canvasWorld.appendChild(el);

  // Port colors
  el.querySelectorAll('.port').forEach(p => { p.style.borderColor = catColor; });

  // Attach events
  const collapseBtn = el.querySelector('.node-collapse-btn');
  const deleteBtn   = el.querySelector('.node-delete-btn');

  function _doCollapse() {
    node.collapsed = !node.collapsed;
    el.querySelector('.node-body').classList.toggle('collapsed', node.collapsed);
    collapseBtn.textContent = node.collapsed ? '▶' : '▼';
    collapseBtn.setAttribute('aria-expanded', String(!node.collapsed));
    updateConnections();
    updateMinimap();
  }
  function _doDelete() { deleteNode(node.id); }

  collapseBtn.addEventListener('click', e => { e.stopPropagation(); _doCollapse(); });
  collapseBtn.addEventListener('touchend', e => { e.preventDefault(); e.stopPropagation(); _doCollapse(); });

  deleteBtn.addEventListener('click', e => { e.stopPropagation(); _doDelete(); });
  deleteBtn.addEventListener('touchend', e => { e.preventDefault(); e.stopPropagation(); _doDelete(); });

  // Field inputs
  el.querySelectorAll('[data-field-key]').forEach(input => {
    input.addEventListener('mousedown', e => e.stopPropagation());
    input.addEventListener('input', () => {
      const key = input.dataset.fieldKey;
      const field = node.fields.find(f => f.key === key);
      if (!field) return;
      if (input.type === 'checkbox' && !input.dataset.checkVal) {
        field.value = input.checked;
        const lbl = input.closest('.field-toggle-wrapper')?.querySelector('.toggle-label');
        if (lbl) lbl.textContent = input.checked ? 'On' : 'Off';
      } else if (input.dataset.checkVal !== undefined) {
        // multicheckbox — normalise first, a restored session may hold a non-array
        if (!Array.isArray(field.value)) field.value = [];
        const val = input.dataset.checkVal;
        if (input.checked) { if (!field.value.includes(val)) field.value.push(val); }
        else { field.value = field.value.filter(v => v !== val); }
      } else {
        field.value = input.type === 'number' ? Number(input.value) : input.value;
      }
      // Update slider display
      if (input.type === 'range') {
        // CSS.escape: a restored session can carry an arbitrary field key, and
        // an unescaped quote would make this an invalid selector and throw.
        const disp = el.querySelector(`[data-slider-display="${CSS.escape(key)}"]`);
        if (disp) disp.textContent = formatSliderValue(field, input.value);
      }
    });
  });

  // Random seed button
  const randomBtn = el.querySelector('.btn-random');
  if (randomBtn) {
    randomBtn.addEventListener('mousedown', e => e.stopPropagation());
    randomBtn.addEventListener('click', e => {
      e.stopPropagation();
      const key = randomBtn.dataset.fieldKey;
      const field = node.fields.find(f => f.key === key);
      if (!field) return;
      const val = Math.floor(Math.random() * 2147483647);
      field.value = val;
      const target = el.querySelector(`[data-field-key="${CSS.escape(key)}"]`);
      if (target) target.value = val;
    });
  }

  updateSearchVisibility(el, node);
  return el;
}

function renderField(nodeId, f) {
  // Every interpolation below is escaped: field definitions can come from a
  // user-authored custom node or from restored localStorage/JSON, so none of
  // them are trusted HTML.
  const id       = `f-${escAttr(nodeId)}-${escAttr(f.key)}`;
  const selfLbl  = f.type === 'toggle' || f.type === 'multicheckbox';
  const label    = selfLbl
    ? `<span class="field-label">${escHtml(f.label)}</span>`
    : `<label class="field-label" for="${id}">${escHtml(f.label)}</label>`;
  const key      = escAttr(f.key);
  const nid      = escAttr(nodeId);
  let control    = '';

  switch (f.type) {
    case 'text':
      control = `<input class="field-input" type="text" id="${id}"
                   data-node-id="${nid}" data-field-key="${key}"
                   value="${escAttr(f.value)}" placeholder="${escAttr(f.placeholder || '')}">`;
      break;

    case 'textarea':
      control = `<textarea class="field-textarea" id="${id}"
                   data-node-id="${nid}" data-field-key="${key}"
                   placeholder="${escAttr(f.placeholder || '')}">${escHtml(f.value)}</textarea>`;
      break;

    case 'number':
      if (f.hasRandom) {
        control = `<div class="field-number-wrapper">
          <input class="field-input" type="number" id="${id}"
            data-node-id="${nid}" data-field-key="${key}"
            value="${escAttr(f.value)}" min="${escAttr(f.min ?? '')}" max="${escAttr(f.max ?? '')}">
          <button class="btn-random" type="button" data-field-key="${key}"
            aria-label="Randomise ${escAttr(f.label)}"><span aria-hidden="true">🎲</span> Random</button>
        </div>`;
      } else {
        control = `<input class="field-input" type="number" id="${id}"
                     data-node-id="${nid}" data-field-key="${key}"
                     value="${escAttr(f.value)}" min="${escAttr(f.min ?? '')}" max="${escAttr(f.max ?? '')}">`;
      }
      break;

    case 'dropdown':
      control = `<select class="field-select" id="${id}"
                   data-node-id="${nid}" data-field-key="${key}">
                   ${(f.options || []).map(o => `<option value="${escAttr(o)}"${o === f.value ? ' selected' : ''}>${escHtml(o)}</option>`).join('')}
                 </select>`;
      break;

    case 'slider': {
      const disp = formatSliderValue(f, f.value);
      control = `<div class="field-slider-wrapper">
        <input class="field-slider" type="range" id="${id}"
          data-node-id="${nid}" data-field-key="${key}"
          min="${escAttr(f.min)}" max="${escAttr(f.max)}" step="${escAttr(f.step ?? 1)}" value="${escAttr(f.value)}">
        <span class="field-slider-value" data-slider-display="${key}">${escHtml(disp)}</span>
      </div>`;
      break;
    }

    case 'toggle':
      control = `<div class="field-toggle-wrapper">
        <label class="field-toggle">
          <input type="checkbox" id="${id}"
            data-node-id="${nid}" data-field-key="${key}"
            aria-label="${escAttr(f.label)}"
            ${f.value ? 'checked' : ''}>
          <span class="field-toggle-track"></span>
        </label>
        <span class="toggle-label">${f.value ? 'On' : 'Off'}</span>
      </div>`;
      break;

    case 'multicheckbox': {
      // f.value may be a non-array after a hand-edited or older saved session.
      const picked = Array.isArray(f.value) ? f.value : [];
      control = `<div class="field-multicheckbox" role="group" aria-label="${escAttr(f.label)}">
        ${(f.options || []).map(o => `
          <label class="field-checkbox-item">
            <input type="checkbox"
              data-node-id="${nid}" data-field-key="${key}" data-check-val="${escAttr(o)}"
              ${picked.includes(o) ? 'checked' : ''}>
            <span class="field-checkbox-label">${escHtml(o)}</span>
          </label>`).join('')}
      </div>`;
      break;
    }

    default:
      control = `<input class="field-input" type="text" id="${id}"
                   data-node-id="${nid}" data-field-key="${key}"
                   value="${escAttr(String(f.value))}">`;
  }

  return `<div class="node-field">${label}${control}</div>`;
}

function formatSliderValue(field, val) {
  const v = parseFloat(val);
  const prefix = field.unit === 'f/' ? 'f/' : '';
  const suffix = (field.unit && field.unit !== 'f/') ? field.unit : '';
  return `${prefix}${Number.isInteger(v) ? v : v.toFixed(1)}${suffix}`;
}

// ── Node management ───────────────────────────────────────────────────────────

/** Cascade away from an occupied slot so a new node is never hidden exactly
 *  behind an existing one — the toolbar dropdown always drops at viewport
 *  centre, so without this every node after the first was invisible. */
function findFreeSpot(x, y) {
  const step = GRID * 2;
  let nx = x, ny = y;
  for (let i = 0; i < 200; i++) {
    if (!window.AppState.nodes.some(n => n.x === nx && n.y === ny)) break;
    nx += step;
    ny += step;
  }
  return { x: nx, y: ny };
}

export function addNodeToCanvas(type, cx, cy, customDef = null) {
  const { createNode } = window._nodeFactory;
  const node = createNode(type, cx, cy, customDef);
  if (!node) return;
  const spot = findFreeSpot(node.x, node.y);
  node.x = spot.x;
  node.y = spot.y;
  window.AppState.nodes.push(node);
  renderNode(node);
  selectNode(node.id);
  updateConnections();
  updateMinimap();
  updateEmptyHint();
  window.prompt0r.pushHistory();
  window.prompt0r.showToast(`Added: ${node.name}`, 'success');
}

export function deleteNode(id) {
  window.AppState.nodes = window.AppState.nodes.filter(n => n.id !== id);
  window.AppState.connections = window.AppState.connections.filter(c => c.from !== id && c.to !== id);
  const el = document.getElementById(`node-${id}`);
  if (el) el.remove();
  if (window.AppState.selectedNodeId === id) window.AppState.selectedNodeId = null;
  updateConnections();
  updateMinimap();
  updateEmptyHint();
  window.prompt0r.pushHistory();
}

export function selectNode(id) {
  window.AppState.selectedNodeId = id;
  canvasWorld.querySelectorAll('.node').forEach(el => {
    el.classList.toggle('selected', el.dataset.nodeId === id);
  });
}

function updateEmptyHint() {
  emptyHint.style.display = window.AppState.nodes.length === 0 ? 'block' : 'none';
}

// ── Connections (SVG) ─────────────────────────────────────────────────────────

function getOutPos(node) {
  return { x: node.x + NODE_WIDTH, y: node.y + PORT_Y };
}
function getInPos(node) {
  return { x: node.x,             y: node.y + PORT_Y };
}

function bezierPath(x1, y1, x2, y2) {
  const cp = Math.min(Math.abs(x2 - x1) * 0.6, 120);
  return `M${x1} ${y1} C${x1+cp} ${y1} ${x2-cp} ${y2} ${x2} ${y2}`;
}

export function updateConnections() {
  // Keep the pending path if it exists
  const pendingEl = connectionsSvg.querySelector('.connection-pending');
  connectionsSvg.innerHTML = '';
  if (pendingEl) connectionsSvg.appendChild(pendingEl);

  for (const conn of window.AppState.connections) {
    const fromNode = window.AppState.nodes.find(n => n.id === conn.from);
    const toNode   = window.AppState.nodes.find(n => n.id === conn.to);
    if (!fromNode || !toNode) continue;

    const p1 = getOutPos(fromNode);
    const p2 = getInPos(toNode);
    const color = (CATEGORIES[fromNode.category] || CATEGORIES.custom).color;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', bezierPath(p1.x, p1.y, p2.x, p2.y));
    path.setAttribute('stroke', color);
    path.setAttribute('class', 'connection-path');
    path.dataset.connId = conn.id;
    path.addEventListener('click', () => {
      window.AppState.connections = window.AppState.connections.filter(c => c.id !== conn.id);
      updateConnections();
      window.prompt0r.pushHistory();
    });
    path.style.pointerEvents = 'stroke';
    connectionsSvg.insertBefore(path, connectionsSvg.firstChild);
  }
}

function drawPendingConnection(x1, y1, x2, y2, color) {
  let el = connectionsSvg.querySelector('.connection-pending');
  if (!el) {
    el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    el.setAttribute('class', 'connection-pending');
    connectionsSvg.appendChild(el);
  }
  el.setAttribute('d', bezierPath(x1, y1, x2, y2));
  el.setAttribute('stroke', color || '#00e5ff');
}

function removePendingConnection() {
  const el = connectionsSvg.querySelector('.connection-pending');
  if (el) el.remove();
}

// ── Minimap ────────────────────────────────────────────────────────────────────

export function updateMinimap() {
  const W = minimapCanvas.width;
  const H = minimapCanvas.height;
  const ctx = minimapCtx;
  ctx.clearRect(0, 0, W, H);

  // Background
  ctx.fillStyle = '#0f0f13';
  ctx.fillRect(0, 0, W, H);

  const nodes = window.AppState.nodes;

  // With no nodes the bounds collapse to the viewport itself, so the same
  // projection below still produces a sane map and a clickable _mapInfo.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  nodes.forEach(n => {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + NODE_WIDTH);
    maxY = Math.max(maxY, n.y + 200);
  });

  const { panX, panY, zoom } = window.AppState.canvas;
  const vpW = canvasWrapper.clientWidth  / zoom;
  const vpH = canvasWrapper.clientHeight / zoom;
  const vpX = -panX / zoom;
  const vpY = -panY / zoom;

  const pad = 80;
  const hasNodes  = nodes.length > 0;
  const worldMinX = hasNodes ? Math.min(minX - pad, vpX - pad) : vpX - pad;
  const worldMinY = hasNodes ? Math.min(minY - pad, vpY - pad) : vpY - pad;
  const worldMaxX = hasNodes ? Math.max(maxX + pad, vpX + vpW + pad) : vpX + vpW + pad;
  const worldMaxY = hasNodes ? Math.max(maxY + pad, vpY + vpH + pad) : vpY + vpH + pad;

  const scaleX = W / (worldMaxX - worldMinX);
  const scaleY = H / (worldMaxY - worldMinY);
  const scale  = Math.min(scaleX, scaleY) * 0.9;
  const offX   = (W - (worldMaxX - worldMinX) * scale) / 2 - worldMinX * scale;
  const offY   = (H - (worldMaxY - worldMinY) * scale) / 2 - worldMinY * scale;

  // Draw nodes
  nodes.forEach(n => {
    const cat = CATEGORIES[n.category] || CATEGORIES.custom;
    ctx.fillStyle   = cat.color + '66';
    ctx.strokeStyle = cat.color;
    ctx.lineWidth   = 0.5;
    const nx = n.x * scale + offX;
    const ny = n.y * scale + offY;
    const nw = NODE_WIDTH * scale;
    const nh = Math.max(4, HEADER_HEIGHT * scale);
    roundRect(ctx, nx, ny, nw, nh, 2);
    ctx.fill();
    ctx.stroke();
  });

  // Draw viewport rectangle
  ctx.strokeStyle = '#00e5ff';
  ctx.lineWidth   = 1.5;
  ctx.strokeRect(
    vpX * scale + offX,
    vpY * scale + offY,
    vpW * scale,
    vpH * scale
  );

  // Store mapping info for click handler
  minimapCanvas._mapInfo = { scale, offX, offY };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── Context Menu ──────────────────────────────────────────────────────────────

export function showContextMenu(sx, sy, canvasPos) {
  const menu = document.getElementById('context-menu');
  menu.innerHTML = '';
  menu.style.left = `${sx}px`;
  menu.style.top  = `${sy}px`;

  const { NODE_REGISTRY } = window._nodeFactory;

  // Organise by category
  const byCategory = {};
  for (const [type, def] of Object.entries(NODE_REGISTRY)) {
    if (!byCategory[def.category]) byCategory[def.category] = [];
    byCategory[def.category].push({ type, def });
  }
  // Custom nodes
  window.AppState.customNodes.forEach(cn => {
    if (!byCategory['custom']) byCategory['custom'] = [];
    byCategory['custom'].push({ type: `custom_${cn.id}`, def: cn });
  });

  for (const catKey of CATEGORY_ORDER) {
    const items = byCategory[catKey];
    if (!items || items.length === 0) continue;
    const cat = CATEGORIES[catKey] || CATEGORIES.custom;

    const catHeader = document.createElement('div');
    catHeader.className = 'context-menu-category';
    catHeader.style.color = cat.color;
    catHeader.textContent = cat.name;
    menu.appendChild(catHeader);

    items.forEach(({ type, def }) => {
      const item = document.createElement('div');
      item.className = 'context-menu-item';
      item.setAttribute('role', 'menuitem');
      item.tabIndex = 0;
      item.textContent = `${def.icon || '✨'} ${def.name}`;
      item.title = def.description || '';
      item.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); item.click(); }
      });
      item.addEventListener('click', () => {
        if (type.startsWith('custom_')) {
          addNodeToCanvas(type, canvasPos.x, canvasPos.y, def);
        } else {
          addNodeToCanvas(type, canvasPos.x, canvasPos.y);
        }
        hideContextMenu();
      });
      menu.appendChild(item);
    });
  }

  menu.classList.remove('hidden');
  // Reposition if off-screen
  requestAnimationFrame(() => {
    const mr = menu.getBoundingClientRect();
    if (mr.right  > window.innerWidth)  menu.style.left = `${sx - mr.width}px`;
    if (mr.bottom > window.innerHeight) menu.style.top  = `${sy - mr.height}px`;
  });
}

export function hideContextMenu() {
  document.getElementById('context-menu').classList.add('hidden');
}

/** Single place that opens/closes the Add Node dropdown so the button's
 *  aria-expanded can never drift out of sync with what is on screen. */
export function setAddNodeMenuOpen(open) {
  const menu = document.getElementById('add-node-menu');
  const btn  = document.getElementById('btn-add-node');
  menu.classList.toggle('hidden', !open);
  btn.setAttribute('aria-expanded', String(open));
  if (open) buildAddNodeMenu();
}

export function isAddNodeMenuOpen() {
  return !document.getElementById('add-node-menu').classList.contains('hidden');
}

// ── Add-node dropdown ─────────────────────────────────────────────────────────

export function buildAddNodeMenu() {
  const menu = document.getElementById('add-node-menu');
  menu.innerHTML = '';

  const { NODE_REGISTRY } = window._nodeFactory;
  const byCategory = {};
  for (const [type, def] of Object.entries(NODE_REGISTRY)) {
    if (!byCategory[def.category]) byCategory[def.category] = [];
    byCategory[def.category].push({ type, def });
  }
  window.AppState.customNodes.forEach(cn => {
    if (!byCategory['custom']) byCategory['custom'] = [];
    byCategory['custom'].push({ type: `custom_${cn.id}`, def: cn });
  });

  for (const catKey of CATEGORY_ORDER) {
    const items = byCategory[catKey];
    if (!items || items.length === 0) continue;
    const cat = CATEGORIES[catKey] || CATEGORIES.custom;

    const header = document.createElement('div');
    header.className = 'dropdown-category-header';
    header.innerHTML = `<span class="dropdown-category-dot" style="background:${cat.color}"></span>${cat.name}`;
    menu.appendChild(header);

    items.forEach(({ type, def }) => {
      const item = document.createElement('div');
      item.className = 'dropdown-node-item';
      item.setAttribute('role', 'menuitem');
      item.tabIndex = 0;
      // Custom node definitions are user-authored — escape before interpolating.
      item.innerHTML = `<span aria-hidden="true">${escHtml(def.icon || '✨')}</span><span>${escHtml(def.name)}</span>
        <span class="dropdown-node-tooltip">${escHtml(def.description || '')}</span>`;
      item.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); item.click(); }
      });
      item.addEventListener('click', () => {
        const { panX, panY, zoom } = window.AppState.canvas;
        const cx = (canvasWrapper.clientWidth  / 2 - panX) / zoom;
        const cy = (canvasWrapper.clientHeight / 2 - panY) / zoom;
        if (type.startsWith('custom_')) {
          addNodeToCanvas(type, cx, cy, def);
        } else {
          addNodeToCanvas(type, cx, cy);
        }
        setAddNodeMenuOpen(false);
      });
      menu.appendChild(item);
    });
  }
}

// ── Search ────────────────────────────────────────────────────────────────────

export function applySearch(query) {
  const q = query.toLowerCase().trim();
  window.AppState.searchQuery = q;
  canvasWorld.querySelectorAll('.node').forEach(el => {
    const nodeId = el.dataset.nodeId;
    const node   = window.AppState.nodes.find(n => n.id === nodeId);
    if (!node) return;
    updateSearchVisibility(el, node, q);
  });
}

function updateSearchVisibility(el, node, q) {
  q = q ?? window.AppState.searchQuery;
  if (!q) { el.classList.remove('search-hidden'); return; }
  const match = node.name.toLowerCase().includes(q) || node.category.toLowerCase().includes(q);
  el.classList.toggle('search-hidden', !match);
}

// ── Events ────────────────────────────────────────────────────────────────────

function _setupEvents() {
  // Wheel zoom
  canvasWrapper.addEventListener('wheel', e => {
    e.preventDefault();
    const r = canvasWrapper.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    const { panX, panY, zoom } = window.AppState.canvas;
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.min(3, Math.max(0.25, zoom * factor));
    window.AppState.canvas.panX = mx - (mx - panX) * (newZoom / zoom);
    window.AppState.canvas.panY = my - (my - panY) * (newZoom / zoom);
    window.AppState.canvas.zoom = newZoom;
    applyTransform();
  }, { passive: false });

  // Coords display
  canvasWrapper.addEventListener('mousemove', e => {
    const c = screenToCanvas(e.clientX, e.clientY);
    coordsDisplay.textContent = `x: ${Math.round(c.x)}, y: ${Math.round(c.y)}`;
  });

  // Context menu
  canvasWrapper.addEventListener('contextmenu', e => {
    e.preventDefault();
    const isNode = e.target.closest('.node');
    if (!isNode) showContextMenu(e.clientX, e.clientY, screenToCanvas(e.clientX, e.clientY));
  });

  // Global mouse events
  document.addEventListener('mousedown', _onMouseDown, true);
  document.addEventListener('mousemove', _onMouseMove);
  document.addEventListener('mouseup',   _onMouseUp);

  // Touch events (mobile)
  canvasWrapper.addEventListener('touchstart',  _onTouchStart,  { passive: false });
  canvasWrapper.addEventListener('touchmove',   _onTouchMove,   { passive: false });
  canvasWrapper.addEventListener('touchend',    _onTouchEnd,    { passive: false });
  canvasWrapper.addEventListener('touchcancel', _onTouchCancel, { passive: false });

  // Minimap click
  minimapCanvas.addEventListener('click', e => {
    const info = minimapCanvas._mapInfo;
    if (!info) return;
    const r   = minimapCanvas.getBoundingClientRect();
    const mx  = e.clientX - r.left;
    const my  = e.clientY - r.top;
    const { zoom } = window.AppState.canvas;
    const cx = (mx - info.offX) / info.scale;
    const cy = (my - info.offY) / info.scale;
    window.AppState.canvas.panX = canvasWrapper.clientWidth  / 2 - cx * zoom;
    window.AppState.canvas.panY = canvasWrapper.clientHeight / 2 - cy * zoom;
    applyTransform();
  });
}

function _onMouseDown(e) {
  // Suppress the synthetic mouse events mobile browsers fire after touch
  if (Date.now() - _lastTouchEnd < 400) return;

  // Close menus when clicking outside
  const inDropdown = e.target.closest('.dropdown-wrapper');
  if (!inDropdown) setAddNodeMenuOpen(false);
  const inCtx = e.target.closest('#context-menu');
  if (!inCtx) hideContextMenu();

  if (e.target.closest('.modal-overlay')) return;
  if (e.target.closest('#toolbar')) return;
  if (e.target.closest('#minimap-container')) return;
  if (e.target.closest('#welcome-overlay')) return;

  const portOut  = e.target.closest('.port-output');
  const nodeHead = e.target.closest('.node-header');
  const nodeEl   = e.target.closest('.node');
  const isCanvas = e.target.closest('#canvas-wrapper');

  if (portOut && e.button === 0) {
    e.preventDefault();
    e.stopPropagation();
    const nId  = portOut.closest('.node').dataset.nodeId;
    const node = window.AppState.nodes.find(n => n.id === nId);
    const pos  = getOutPos(node);
    dragState = { type: 'connection', fromNodeId: nId, fromPos: pos,
      color: (CATEGORIES[node.category] || CATEGORIES.custom).color };
    return;
  }

  if (nodeHead && e.button === 0 && !e.target.matches('input,select,textarea,button,.port,.port-output,.port-input')) {
    e.preventDefault();
    const nId  = nodeHead.closest('.node').dataset.nodeId;
    const node = window.AppState.nodes.find(n => n.id === nId);
    const cp   = screenToCanvas(e.clientX, e.clientY);
    dragState  = { type: 'node', nodeId: nId, startCx: cp.x, startCy: cp.y,
      nodeX0: node.x, nodeY0: node.y };
    selectNode(nId);
    document.body.classList.add('dragging');
    return;
  }

  if (nodeEl && e.button === 0) {
    selectNode(nodeEl.dataset.nodeId);
    return;
  }

  if (isCanvas && (e.button === 1 || (e.button === 0 && window.AppState.spaceDown))) {
    e.preventDefault();
    dragState = { type: 'canvas', startX: e.clientX, startY: e.clientY,
      px0: window.AppState.canvas.panX, py0: window.AppState.canvas.panY };
    canvasWrapper.style.cursor = 'grabbing';
    document.body.classList.add('dragging');
    return;
  }

  if (isCanvas && e.button === 0) selectNode(null);
}

function _onMouseMove(e) {
  if (!dragState) return;

  if (dragState.type === 'node') {
    const cp   = screenToCanvas(e.clientX, e.clientY);
    const newX = Math.round((dragState.nodeX0 + cp.x - dragState.startCx) / GRID) * GRID;
    const newY = Math.round((dragState.nodeY0 + cp.y - dragState.startCy) / GRID) * GRID;
    const node = window.AppState.nodes.find(n => n.id === dragState.nodeId);
    if (!node) return;
    node.x = newX; node.y = newY;
    const el = document.getElementById(`node-${dragState.nodeId}`);
    if (el) { el.style.left = `${newX}px`; el.style.top = `${newY}px`; }
    updateConnections();
    updateMinimap();
  }

  else if (dragState.type === 'canvas') {
    window.AppState.canvas.panX = dragState.px0 + (e.clientX - dragState.startX);
    window.AppState.canvas.panY = dragState.py0 + (e.clientY - dragState.startY);
    applyTransform();
  }

  else if (dragState.type === 'connection') {
    const cp = screenToCanvas(e.clientX, e.clientY);
    drawPendingConnection(dragState.fromPos.x, dragState.fromPos.y, cp.x, cp.y, dragState.color);
  }
}

function _onMouseUp(e) {
  if (!dragState) return;

  if (dragState.type === 'node') {
    document.body.classList.remove('dragging');
    window.prompt0r.pushHistory();
  }

  else if (dragState.type === 'canvas') {
    document.body.classList.remove('dragging');
    canvasWrapper.style.cursor = window.AppState.spaceDown ? 'grab' : 'default';
  }

  else if (dragState.type === 'connection') {
    removePendingConnection();
    const portIn = document.elementFromPoint(e.clientX, e.clientY)?.closest('.port-input');
    if (portIn) {
      const toNodeId = portIn.closest('.node').dataset.nodeId;
      if (toNodeId !== dragState.fromNodeId) {
        const dup = window.AppState.connections.some(c => c.from === dragState.fromNodeId && c.to === toNodeId);
        if (!dup) {
          window.AppState.connections.push({ id: `conn_${Date.now()}`, from: dragState.fromNodeId, to: toNodeId });
          window.prompt0r.pushHistory();
        }
      }
    }
    updateConnections();
  }

  dragState = null;
}

// ── Touch handlers (mobile) ───────────────────────────────────────────────────

function _onTouchStart(e) {
  // ── Bug fix: never suppress touches on form elements, buttons, or labels ──
  // Use closest() so tapping a child of <label> (e.g. the toggle track <span>)
  // is also caught — a direct tagName check misses those children.
  if (e.target.closest('input, textarea, select, button, label')) {
    _touchStartedOnInput = true;
    return; // let the browser handle focus / keyboard / click synthesis
  }
  _touchStartedOnInput = false;

  // From here all touches are on non-interactive canvas/node surfaces
  e.preventDefault();
  hideContextMenu();
  clearTimeout(_longPressTimer);

  // ── Two-finger pinch zoom ─────────────────────────────────────────────────
  if (e.touches.length >= 2) {
    if (dragState?.type === 'node' || dragState?.type === 'node-pending') {
      document.body.classList.remove('dragging');
    }
    dragState = null;
    const t1 = e.touches[0], t2 = e.touches[1];
    _pinchState = {
      startDist: Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY),
      startZoom: window.AppState.canvas.zoom,
      midX: (t1.clientX + t2.clientX) / 2,
      midY: (t1.clientY + t2.clientY) / 2,
      px0: window.AppState.canvas.panX,
      py0: window.AppState.canvas.panY
    };
    return;
  }

  _pinchState = null;
  if (e.touches.length !== 1) return;
  const t   = e.touches[0];
  const hit = document.elementFromPoint(t.clientX, t.clientY);
  if (!hit) return;

  const portOut  = hit.closest('.port-output');
  const nodeHead = hit.closest('.node-header');
  const nodeEl   = hit.closest('.node');

  // ── Connection drag from output port ─────────────────────────────────────
  if (portOut) {
    const nId  = portOut.closest('.node').dataset.nodeId;
    const node = window.AppState.nodes.find(n => n.id === nId);
    if (!node) return;
    dragState = { type: 'connection', fromNodeId: nId, fromPos: getOutPos(node),
      color: (CATEGORIES[node.category] || CATEGORIES.custom).color };
    return;
  }

  // ── Node header: arm a PENDING drag — only commits after 8 px movement ───
  // This lets quick taps in the header area (e.g. near icon/name) not
  // accidentally trigger a drag instead of a node select.
  if (nodeHead) {
    const nId  = nodeHead.closest('.node').dataset.nodeId;
    const node = window.AppState.nodes.find(n => n.id === nId);
    if (!node) return;
    const cp  = screenToCanvas(t.clientX, t.clientY);
    dragState = {
      type: 'node-pending',
      nodeId: nId,
      startCx: cp.x, startCy: cp.y,
      nodeX0: node.x, nodeY0: node.y,
      startScreenX: t.clientX, startScreenY: t.clientY
    };
    selectNode(nId);
    return;
  }

  // ── Tap node body → select ────────────────────────────────────────────────
  if (nodeEl) {
    selectNode(nodeEl.dataset.nodeId);
    return;
  }

  // ── Canvas pan + long-press context menu ──────────────────────────────────
  dragState = { type: 'canvas',
    startX: t.clientX, startY: t.clientY,
    px0: window.AppState.canvas.panX, py0: window.AppState.canvas.panY,
    hasMoved: false
  };
  selectNode(null);

  _longPressTimer = setTimeout(() => {
    if (dragState?.type === 'canvas' && !dragState.hasMoved) {
      dragState = null;
      const cp = screenToCanvas(t.clientX, t.clientY);
      showContextMenu(Math.min(t.clientX, window.innerWidth - 220),
                      Math.max(60, t.clientY - 240), cp);
    }
  }, 550);
}

function _onTouchMove(e) {
  // If the touch sequence started on a form element, let the browser handle it
  if (_touchStartedOnInput) return;

  e.preventDefault();

  // ── Pinch zoom ────────────────────────────────────────────────────────────
  if (_pinchState && e.touches.length >= 2) {
    const t1   = e.touches[0], t2 = e.touches[1];
    const dist  = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
    const ratio = dist / _pinchState.startDist;
    const zoom  = Math.min(3, Math.max(0.25, _pinchState.startZoom * ratio));
    const r     = canvasWrapper.getBoundingClientRect();
    const mx    = _pinchState.midX - r.left;
    const my    = _pinchState.midY - r.top;
    window.AppState.canvas.panX = mx - (mx - _pinchState.px0) * (zoom / _pinchState.startZoom);
    window.AppState.canvas.panY = my - (my - _pinchState.py0) * (zoom / _pinchState.startZoom);
    window.AppState.canvas.zoom = zoom;
    applyTransform();
    return;
  }

  if (!dragState || e.touches.length !== 1) return;
  const t = e.touches[0];

  if (dragState.type === 'canvas') {
    clearTimeout(_longPressTimer);
    const dx = t.clientX - dragState.startX;
    const dy = t.clientY - dragState.startY;
    if (Math.hypot(dx, dy) > 8) dragState.hasMoved = true;
    window.AppState.canvas.panX = dragState.px0 + dx;
    window.AppState.canvas.panY = dragState.py0 + dy;
    applyTransform();
  }

  else if (dragState.type === 'node-pending') {
    // Promote to a real drag only once finger has moved ≥ 8 px
    const moved = Math.hypot(t.clientX - dragState.startScreenX, t.clientY - dragState.startScreenY);
    if (moved < 8) return;
    dragState.type = 'node';
    document.body.classList.add('dragging');
    // fall through to the 'node' branch below
  }

  if (dragState.type === 'node') {
    clearTimeout(_longPressTimer);
    const cp   = screenToCanvas(t.clientX, t.clientY);
    const newX = Math.round((dragState.nodeX0 + cp.x - dragState.startCx) / GRID) * GRID;
    const newY = Math.round((dragState.nodeY0 + cp.y - dragState.startCy) / GRID) * GRID;
    const node = window.AppState.nodes.find(n => n.id === dragState.nodeId);
    if (!node) return;
    node.x = newX; node.y = newY;
    const el = document.getElementById(`node-${dragState.nodeId}`);
    if (el) { el.style.left = `${newX}px`; el.style.top = `${newY}px`; }
    updateConnections();
    updateMinimap();
  }

  else if (dragState.type === 'connection') {
    const cp = screenToCanvas(t.clientX, t.clientY);
    drawPendingConnection(dragState.fromPos.x, dragState.fromPos.y, cp.x, cp.y, dragState.color);
  }
}

function _onTouchEnd(e) {
  clearTimeout(_longPressTimer);
  _pinchState = null;
  _lastTouchEnd = Date.now(); // suppress synthetic mouse events
  _touchStartedOnInput = false;

  if (!dragState) return;

  if (dragState.type === 'connection') {
    removePendingConnection();
    if (e.changedTouches.length > 0) {
      const t   = e.changedTouches[0];
      const hit = document.elementFromPoint(t.clientX, t.clientY);
      const portIn = hit?.closest('.port-input');
      if (portIn) {
        const toId = portIn.closest('.node').dataset.nodeId;
        if (toId !== dragState.fromNodeId) {
          const dup = window.AppState.connections.some(c => c.from === dragState.fromNodeId && c.to === toId);
          if (!dup) {
            window.AppState.connections.push({ id: `conn_${Date.now()}`, from: dragState.fromNodeId, to: toId });
            window.prompt0r.pushHistory();
          }
        }
      }
    }
    updateConnections();
  }

  else if (dragState.type === 'node') {
    document.body.classList.remove('dragging');
    window.prompt0r.pushHistory();
  }

  // node-pending means the finger lifted before crossing the drag threshold —
  // treat it as a plain tap (selection already applied in touchstart), no history push.
  // else if (dragState.type === 'node-pending') { /* nothing extra needed */ }

  dragState = null;
}

function _onTouchCancel() {
  clearTimeout(_longPressTimer);
  _pinchState = null;
  _lastTouchEnd = Date.now();
  _touchStartedOnInput = false;
  if (dragState?.type === 'node') document.body.classList.remove('dragging');
  if (dragState?.type === 'connection') removePendingConnection();
  dragState = null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// '&' must be replaced first, otherwise the ampersands introduced by the later
// replacements get double-escaped — and, worse, a stored "&quot;" survives as a
// literal '"' that breaks out of the attribute it was interpolated into.
function escAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
