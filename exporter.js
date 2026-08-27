// exporter.js — JSON export, prompt string assembly, download

export function exportJSON() {
  const { nodes } = window.AppState;

  const promptStr   = assemblePromptString(nodes);
  const negNode     = nodes.find(n => n.type === 'negative_prompt');
  const negPrompt   = negNode ? (negNode.fields.find(f => f.key === 'negative')?.value || '') : '';

  // Generation params from quality nodes
  const cfgNode     = nodes.find(n => n.type === 'cfg_scale');
  const stepsNode   = nodes.find(n => n.type === 'steps');
  const seedNode    = nodes.find(n => n.type === 'seed');
  const samplerNode = nodes.find(n => n.type === 'sampling_method');

  const genParams = {
    cfg_scale: cfgNode     ? cfgNode.fields.find(f => f.key === 'cfg')?.value     ?? 7    : 7,
    steps:     stepsNode   ? stepsNode.fields.find(f => f.key === 'steps')?.value  ?? 30   : 30,
    seed:      seedNode    ? seedNode.fields.find(f => f.key === 'seed')?.value    ?? -1   : -1,
    sampler:   samplerNode ? samplerNode.fields.find(f => f.key === 'sampler')?.value ?? 'DPM++ 2M Karras' : 'DPM++ 2M Karras'
  };

  const output = {
    promptforge_version: '1.0',
    created_at: new Date().toISOString(),
    workflow_name: 'My Image Prompt',
    nodes: nodes.map(node => ({
      id:     node.id,
      type:   node.type,
      name:   node.name,
      values: Object.fromEntries(node.fields.map(f => [f.key, f.value]))
    })),
    prompt_string:   promptStr,
    negative_prompt: negPrompt,
    generation_params: genParams
  };

  // Show modal
  const modal = document.getElementById('export-modal');
  const pre   = document.getElementById('export-json-display');
  pre.innerHTML = syntaxHighlight(output);
  modal.classList.remove('hidden');

  // Store for download
  window._lastExportData = output;
  window.promptForge.showToast('JSON ready — copy or download below', 'success');
}

export function assemblePromptString(nodes) {
  const parts = [];

  const get = (type, key) => {
    const node = nodes.find(n => n.type === type);
    if (!node) return null;
    return node.fields.find(f => f.key === key)?.value ?? null;
  };

  // Subject
  const subject = get('main_subject', 'subject');
  if (subject?.trim()) parts.push(subject.trim());

  const action = get('action_pose', 'action');
  if (action?.trim()) parts.push(action.trim());

  const bg = get('background', 'background');
  if (bg?.trim()) parts.push(`with ${bg.trim()} background`);

  const env = get('environment', 'environment');
  if (env && env !== 'outdoor') parts.push(`in ${env} environment`);

  // Time & weather
  const time    = get('time_of_day', 'time');
  const weather = get('weather', 'weather');
  if (time && weather && weather !== 'clear') parts.push(`during ${time}, ${weather} conditions`);
  else if (time)    parts.push(`during ${time}`);
  else if (weather && weather !== 'clear') parts.push(`${weather} weather`);

  // Lighting
  const lightType = get('light_type', 'light_type');
  const lightDir  = get('light_direction', 'direction');
  const intensity = get('light_intensity', 'intensity');
  if (lightType) {
    let l = `${lightType} lighting`;
    if (lightDir && lightDir !== 'front') l += ` from ${lightDir}`;
    if (intensity !== null && intensity < 30)  l += ', low intensity';
    if (intensity !== null && intensity > 80)  l += ', high intensity';
    parts.push(l);
  }
  const ao  = get('ambient_occlusion', 'ao');
  const hdr = get('hdr_lighting', 'hdr');
  if (ao)  parts.push('ambient occlusion');
  if (hdr) parts.push('HDR lighting');

  // Color & mood
  const palette = get('color_palette', 'palette');
  if (palette?.trim()) parts.push(`color palette: ${palette.trim()}`);

  const grading = get('color_grading', 'grading');
  if (grading && grading !== 'none') parts.push(`${grading} color grading`);

  const mood = get('mood_emotion', 'mood');
  if (mood && mood !== 'serene') parts.push(`${mood} mood`);

  const temp = get('color_temperature', 'temperature');
  if (temp !== null) {
    if (temp <= 3000) parts.push('warm, tungsten-toned lighting');
    else if (temp >= 8000) parts.push('cool, daylight-balanced tones');
  }

  // Style
  const artStyle = get('art_style', 'style');
  if (artStyle && artStyle !== 'photorealistic') parts.push(`${artStyle} style`);
  else if (artStyle === 'photorealistic') parts.push('photorealistic');

  const artist = get('artist_reference', 'artist');
  if (artist?.trim()) parts.push(artist.trim());

  const film = get('film_reference', 'film');
  if (film?.trim()) parts.push(film.trim());

  const era = get('era_period', 'era');
  if (era && era !== 'contemporary') parts.push(`${era} era`);

  const engine = get('render_engine', 'engine');
  if (engine && engine !== 'none') parts.push(`rendered in ${engine}`);

  // Camera
  const shot   = get('shot_type', 'shot');
  const focal  = get('focal_length', 'focal');
  const aper   = get('aperture', 'aperture');
  const camMov = get('camera_movement', 'movement');
  const fmt    = get('film_format', 'format');

  if (shot) parts.push(shot);
  if (focal) parts.push(`${focal} lens`);
  if (aper !== null) {
    const f = parseFloat(aper);
    parts.push(`f/${f.toFixed(1)} aperture${f < 2.8 ? ', shallow depth of field, bokeh' : ''}`);
  }
  if (camMov && camMov !== 'static') parts.push(`${camMov} camera`);
  if (fmt && fmt !== 'digital') parts.push(`shot on ${fmt}`);

  // Lens effects
  const lensNode = nodes.find(n => n.type === 'lens_effects');
  if (lensNode) {
    const effects = lensNode.fields.find(f => f.key === 'effects')?.value ?? [];
    if (effects.length > 0) parts.push(effects.join(', '));
  }

  // Quality
  const detail = get('detail_level', 'detail');
  if (detail && detail !== 'normal') parts.push(detail);

  const res = get('resolution', 'resolution');
  if (res && res !== '1024px') parts.push(res);

  return parts.join(', ');
}

export function downloadJSON(data, filename) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Syntax Highlight ──────────────────────────────────────────────────────────

function esc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function syntaxHighlight(obj) {
  const raw = JSON.stringify(obj, null, 2);
  return esc(raw).replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    match => {
      let cls = 'json-number';
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? 'json-key' : 'json-string';
      } else if (/true|false/.test(match)) {
        cls = 'json-boolean';
      } else if (/null/.test(match)) {
        cls = 'json-null';
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
}
