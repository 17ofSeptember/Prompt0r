# ⚡ PromptForge

**Visual AI Prompt Builder** — construct rich, structured image-generation prompts on a node
canvas, then export them as JSON for any AI image generator.

PromptForge is a dependency-free static site. There is no build step, no server, and no
account: everything runs in the browser and your work never leaves your machine.

---

## Quick start

The app uses native ES modules, so it must be served over HTTP — opening `index.html`
directly from the filesystem (`file://`) will fail with a CORS error.

```bash
npm run dev          # serves on http://localhost:3000
```

Any static server works just as well:

```bash
python3 -m http.server 3000
npx serve .
```

---

## How it works

1. **Add nodes** — right-click the canvas, or use **＋ Add Node** in the toolbar. Nodes are
   grouped by category (Subject, Lighting, Color, Style, Camera, Quality).
2. **Configure** — fill in each node's fields. Drag node headers to rearrange; drag from an
   output port to an input port to visually group related nodes.
3. **Export** — **⬇ Export JSON** assembles every node into a single prompt string plus a
   structured document, ready to copy or download.

### Exported format

```jsonc
{
  "promptforge_version": "1.0",
  "created_at": "2026-08-26T21:00:00.000Z",
  "workflow_name": "My Image Prompt",
  "nodes": [ { "id": "node_001", "type": "main_subject", "name": "Main Subject",
               "values": { "subject": "A lone lighthouse in a storm" } } ],
  "prompt_string": "A lone lighthouse in a storm, photorealistic, 50mm standard lens, ...",
  "negative_prompt": "blurry, low quality, watermark",
  "generation_params": { "cfg_scale": 7, "steps": 30, "seed": -1, "sampler": "DPM++ 2M Karras" }
}
```

`prompt_string` is assembled in a deliberate order (subject → scene → lighting → color →
style → camera → quality) so the result reads naturally to a diffusion model. Nodes left at
their default value are omitted, which keeps the prompt short. When two nodes share a type,
the first one on the canvas wins.

---

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl/⌘ + Z` | Undo |
| `Ctrl/⌘ + Shift + Z` / `Ctrl + Y` | Redo |
| `Ctrl/⌘ + S` | Save session |
| `Ctrl/⌘ + E` | Export JSON |
| `Delete` / `Backspace` | Delete the selected node |
| `F` | Fit all nodes to screen |
| `Escape` | Close any menu or dialog, deselect |
| `Space` + drag | Pan the canvas |
| Scroll / pinch | Zoom (25%–300%) |

Middle-mouse drag also pans. On touch devices: long-press the canvas for the node menu,
two-finger pinch to zoom.

---

## Data & persistence

Everything lives in `localStorage` on the current device. Nothing is uploaded.

| Key | Contents |
| --- | --- |
| `promptforge_autosave` | Written ~800ms after any change, and restored on next visit |
| `promptforge_session` | The explicit **💾 Save** slot, restored by **📂 Load** |
| `promptforge_custom_nodes` | Custom node definitions you've created |
| `promptforge_welcomed` | Whether the welcome overlay has been dismissed |

Clearing site data erases all of it, so use **Export JSON** for anything you want to keep.
If storage is blocked (Safari private mode) or full, the app keeps working and warns once —
it just can't persist between reloads.

---

## Project layout

```
index.html      Markup, meta tags, CSP
src/app.js      Entry point: state, history, persistence, toolbar, modals, shortcuts
src/canvas.js   Rendering, pan/zoom, drag, connections, minimap, touch input
src/nodes.js    Node type registry + node factory
src/exporter.js Prompt-string assembly, JSON export, download
src/style.css   Theme and layout
_headers        Security + caching headers for Netlify / Cloudflare Pages
```

State is intentionally global (`window.AppState`) and modules talk through
`window.promptForge` — this sidesteps a circular import between `app.js` and `canvas.js`
without pulling in a bundler.

### Adding a node type

Add an entry to `NODE_REGISTRY` in `src/nodes.js`:

```js
my_node: {
  name: 'My Node', category: 'style', icon: '🎨',
  description: 'What this node controls',
  fields: [
    { key: 'my_field', label: 'My Field', type: 'dropdown',
      value: 'a', options: ['a', 'b', 'c'] }
  ]
}
```

Supported field types: `text`, `textarea`, `number` (optional `hasRandom`), `dropdown`,
`slider` (`min`/`max`/`step`/`unit`), `toggle`, `multicheckbox`.

To have the node contribute to `prompt_string`, add a clause in `assemblePromptString()`
in `src/exporter.js`. Nodes not referenced there still appear in the `nodes` array of the
export — they just don't affect the assembled sentence.

Users can also build nodes at runtime via **✦ Custom**; those are stored in `localStorage`
rather than in the registry.

---

## Deploying

It's a static folder — publish the repository root.

**Netlify / Cloudflare Pages** — no build command, publish directory `.`. The `_headers`
file is picked up automatically.

**Vercel** — no framework preset, output directory `.`. Vercel ignores `_headers`; port the
same values into `vercel.json` under `headers`.

**GitHub Pages** — push and enable Pages on the branch root. Pages cannot send custom
headers, so the `<meta>` CSP in `index.html` is the only policy that applies; in particular
`frame-ancestors` will not be enforced (browsers ignore it in a meta tag).

### Security posture

- No third-party scripts, no analytics, no ad network, no outbound requests except Google
  Fonts stylesheets and font files.
- A strict CSP is set both as a `<meta>` tag and in `_headers`. `style-src` needs
  `'unsafe-inline'` because node colours are applied as inline style attributes.
- All user-authored text (node names, field labels, custom node definitions, restored
  session data) is HTML-escaped before it reaches `innerHTML`.

---

## Browser support

Current Chrome, Edge, Firefox, and Safari, plus iOS Safari and Chrome for Android. Requires
ES modules, `structuredClone` (with a JSON fallback), and CSS custom properties.

---

## License

[MIT](LICENSE)
