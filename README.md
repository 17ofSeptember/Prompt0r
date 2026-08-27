<div align="center">

# ⚡ Prompt0r

**Visual AI Prompt Builder**

Build rich, structured image generation prompts on a node canvas, then export them as JSON for any AI image generator.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
![No build step](https://img.shields.io/badge/build-none%20required-brightgreen)
![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)

</div>

---

## What it does

Writing a good image prompt means juggling a dozen concerns at once: the subject, the
lighting, the color grade, the lens, the render quality. Cram all of that into one text box
and it becomes very hard to see what you actually asked for, or to change one thing without
disturbing everything else.

Prompt0r splits the prompt into **nodes**. Each node controls exactly one aspect of the
image. You place the nodes you care about on a canvas, fill them in, and Prompt0r assembles
them into a single well ordered prompt string plus a structured JSON document.

**Highlights**

* **31 built-in node types** across six categories: Subject, Lighting, Color and Mood,
  Style and Art, Camera and Lens, and Quality and Detail.
* **Custom nodes.** Build your own node type with your own fields (text, dropdown, slider,
  toggle, number) and reuse it whenever you like.
* **Smart prompt assembly.** Nodes are emitted in a deliberate order that reads naturally to
  a diffusion model, and any node left at its default value is skipped so the prompt stays
  tight.
* **Generation parameters.** CFG scale, steps, seed, and sampler are exported as structured
  fields, not buried in prose.
* **Real canvas.** Pan, zoom, drag, a minimap, node search, connections between nodes, and
  full undo and redo.
* **Runs entirely in your browser.** No account, no server, no upload, no tracking, no
  third party scripts. Your prompts never leave your machine.
* **Autosave.** Your canvas comes back exactly as you left it.
* **Works on touch.** Pinch to zoom, long press for the node menu, drag to move nodes.

---

## Install and run

Prompt0r is a static site with zero dependencies. There is nothing to build and nothing to
install.

> **Important:** the app uses native ES modules, so it has to be served over HTTP.
> Double clicking `index.html` to open it as a `file://` URL will fail with a CORS error.
> Use one of the commands below instead.

### Option 1: npm

```bash
git clone https://github.com/17ofSeptember/prompt0r.git
cd prompt0r
npm run dev
```

Then open **http://localhost:3000**.

### Option 2: Python (no Node needed)

```bash
git clone https://github.com/17ofSeptember/prompt0r.git
cd prompt0r
python3 -m http.server 3000
```

Then open **http://localhost:3000**.

### Option 3: any static server

```bash
npx serve .
php -S localhost:3000
```

### Deploying

Publish the repository root as a static site. There is no build command and no output
directory.

| Host | Setup |
| :--- | :--- |
| **Netlify** | Build command: none. Publish directory: `.` The included `_headers` file is applied automatically. |
| **Cloudflare Pages** | Same as Netlify. `_headers` is applied automatically. |
| **Vercel** | No framework preset. Output directory: `.` Vercel ignores `_headers`, so copy those values into a `vercel.json` `headers` block. |
| **GitHub Pages** | Push and enable Pages on the branch root. Pages cannot send custom headers, so only the `<meta>` CSP inside `index.html` applies. |

---

## How to use it

### 1. Add nodes

Three ways, whichever suits you:

* Click **＋ Add Node** in the toolbar and pick from the categorized list.
* **Right click** anywhere on the canvas to drop a node at that exact spot.
* On touch devices, **long press** the canvas.

New nodes cascade so they never land hidden behind an existing one.

### 2. Configure them

Fill in each node's fields. Everything updates live.

* **Drag a node header** to move it. Nodes snap to a 20px grid.
* **Click ▼** on a node header to collapse it once you are done with it.
* **Drag from an output port** (the circle on the right) **to an input port** (the circle on
  the left) to visually group related nodes. Click a connection line to delete it.
* **Search** in the toolbar to filter the canvas down to matching nodes.

Only add the nodes you actually care about. A prompt with five well chosen nodes beats one
with thirty defaults.

### 3. Export

Click **⬇ Export JSON** or press `Ctrl/⌘ + E`. You get a syntax highlighted preview, then
copy it to your clipboard or download it as a `.json` file.

```jsonc
{
  "prompt0r_version": "1.0",
  "created_at": "2026-08-26T21:00:00.000Z",
  "workflow_name": "My Image Prompt",
  "nodes": [
    {
      "id": "node_001",
      "type": "main_subject",
      "name": "Main Subject",
      "values": { "subject": "A lone lighthouse in a storm" }
    }
  ],
  "prompt_string": "A lone lighthouse in a storm, photorealistic, 50mm standard lens, f/2.8 aperture, shallow depth of field, bokeh, high detail",
  "negative_prompt": "blurry, low quality, watermark",
  "generation_params": {
    "cfg_scale": 7,
    "steps": 30,
    "seed": -1,
    "sampler": "DPM++ 2M Karras"
  }
}
```

Paste `prompt_string` into any image generator, or feed the whole document to a tool that
understands the structured fields.

> **Note:** if you place two nodes of the same type, the first one on the canvas is the one
> that reaches `prompt_string`. The rest still appear in the `nodes` array.

### Building a custom node

Click **✦ Custom**, give it a name, an icon, and a description, then add fields. Each field
needs a label and a type:

| Type | Extra input |
| :--- | :--- |
| Text, Text Area, Number | Default value only |
| Dropdown | Comma separated options, for example `warm, neutral, cool` |
| Slider | Min and max, for example `0,100` |
| Toggle | Default of `true` or `false` |

Saved custom nodes appear under the **Custom** category and persist in your browser.

### Keyboard shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Ctrl/⌘ + Z` | Undo |
| `Ctrl/⌘ + Shift + Z` or `Ctrl + Y` | Redo |
| `Ctrl/⌘ + S` | Save session |
| `Ctrl/⌘ + E` | Export JSON |
| `Delete` or `Backspace` | Delete the selected node |
| `F` | Fit all nodes to screen |
| `Escape` | Close any menu or dialog, and deselect |
| `Space` + drag | Pan the canvas |
| Scroll or pinch | Zoom, 25% to 300% |

Middle mouse drag also pans.

---

## Where your data lives

Everything stays in `localStorage` on your own device. Nothing is uploaded, ever.

| Key | Contents |
| :--- | :--- |
| `prompt0r_autosave` | Written about 800ms after any change, restored on your next visit |
| `prompt0r_session` | The explicit **💾 Save** slot, restored by **📂 Load** |
| `prompt0r_custom_nodes` | Custom node types you have created |
| `prompt0r_welcomed` | Whether the welcome screen has been dismissed |

Clearing your browser's site data erases all of it, so use **Export JSON** for anything you
want to keep permanently. If storage is unavailable, such as in Safari private mode or when
the quota is full, the app keeps working and warns you once. It simply cannot remember
things between reloads.

---

## Project structure

```
index.html        Markup, meta tags, Content Security Policy
src/app.js        Entry point: state, undo history, persistence, toolbar, modals, shortcuts
src/canvas.js     Rendering, pan and zoom, dragging, connections, minimap, touch input
src/nodes.js      Node type registry and the node factory
src/exporter.js   Prompt string assembly, JSON export, download
src/style.css     Theme and layout
_headers          Security and caching headers for Netlify and Cloudflare Pages
```

State is deliberately global on `window.AppState`, and modules communicate through
`window.prompt0r`. That sidesteps a circular import between `app.js` and `canvas.js`
without dragging in a bundler.

### Adding a built-in node type

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

Field types: `text`, `textarea`, `number` (add `hasRandom` for a dice button), `dropdown`,
`slider` (with `min`, `max`, `step`, `unit`), `toggle`, and `multicheckbox`.

To make the node contribute to `prompt_string`, add a clause in `assemblePromptString()` in
`src/exporter.js`. A node you skip there still appears in the export's `nodes` array. It
just does not affect the assembled sentence.

---

## Security

* No third party scripts, no analytics, no ad networks, no telemetry.
* The only outbound requests are to Google Fonts for the two typefaces.
* A strict Content Security Policy ships both as a `<meta>` tag and in `_headers`.
* All user authored text, including node names, field labels, custom node definitions, and
  restored session data, is HTML escaped before it is rendered.

Found a security issue? Please open an issue on the
[issue tracker](https://github.com/17ofSeptember/prompt0r/issues).

---

## Browser support

Current versions of Chrome, Edge, Firefox, and Safari, plus iOS Safari and Chrome for
Android. Requires ES modules, CSS custom properties, and `structuredClone` (a JSON fallback
covers older engines).

---

## Contributing

Issues and pull requests are welcome. There is no build step and no test runner to set up,
so just serve the folder and start editing. Please keep the project dependency free.

---

## License

Licensed under the [GNU Affero General Public License v3.0](LICENSE).

You are free to use, study, modify, share, and redistribute this software. The one condition
is that it stays open: if you distribute a modified version, **or run one as a network
service that other people can reach**, you have to make your source available under the same
license.

---

<div align="center">

Created by **[17OfSeptember](https://github.com/17ofSeptember)**

https://github.com/17ofSeptember

</div>
