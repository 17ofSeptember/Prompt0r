// nodes.js — Node type registry and factory

export const CATEGORIES = {
  subject:  { name: 'Subject / Content', color: '#7c3aed', icon: '🎭' },
  lighting: { name: 'Lighting',          color: '#f59e0b', icon: '💡' },
  color:    { name: 'Color / Mood',      color: '#10b981', icon: '🎨' },
  style:    { name: 'Style / Art',       color: '#3b82f6', icon: '🖌️' },
  camera:   { name: 'Camera / Lens',     color: '#ef4444', icon: '📷' },
  quality:  { name: 'Quality / Detail',  color: '#8b5cf6', icon: '⚙️' },
  custom:   { name: 'Custom',            color: '#6b7280', icon: '✨' }
};

export const CATEGORY_ORDER = ['subject','lighting','color','style','camera','quality','custom'];

export const NODE_REGISTRY = {
  // ── SUBJECT / CONTENT ──────────────────────────────────────────────────────
  main_subject: {
    name: 'Main Subject', category: 'subject', icon: '🎭',
    description: 'Describe the primary subject of the image',
    fields: [
      { key: 'subject', label: 'Subject Description', type: 'textarea', value: '',
        placeholder: 'A mysterious hooded figure standing at the edge of a cliff...' }
    ]
  },
  background: {
    name: 'Background', category: 'subject', icon: '🌄',
    description: 'Describe the background of the scene',
    fields: [
      { key: 'background', label: 'Background', type: 'text', value: '',
        placeholder: 'Ancient stone temple ruins shrouded in mist...' }
    ]
  },
  environment: {
    name: 'Environment', category: 'subject', icon: '🌍',
    description: 'Set the overall environment type',
    fields: [
      { key: 'environment', label: 'Environment Type', type: 'dropdown', value: 'outdoor',
        options: ['indoor','outdoor','studio','fantasy','sci-fi','urban','nature','abstract'] }
    ]
  },
  time_of_day: {
    name: 'Time of Day', category: 'subject', icon: '🕐',
    description: 'Set the time of day for lighting and atmosphere',
    fields: [
      { key: 'time', label: 'Time of Day', type: 'dropdown', value: 'golden hour',
        options: ['dawn','morning','midday','golden hour','dusk','night','midnight'] }
    ]
  },
  weather: {
    name: 'Weather', category: 'subject', icon: '⛅',
    description: 'Set weather conditions for the scene',
    fields: [
      { key: 'weather', label: 'Weather', type: 'dropdown', value: 'clear',
        options: ['clear','cloudy','overcast','rainy','stormy','foggy','snowy','hazy'] }
    ]
  },
  action_pose: {
    name: 'Action / Pose', category: 'subject', icon: '🏃',
    description: 'Describe the action or pose of the subject',
    fields: [
      { key: 'action', label: 'Action / Pose', type: 'text', value: '',
        placeholder: 'Standing confidently, arms crossed, looking into the distance...' }
    ]
  },

  // ── LIGHTING ───────────────────────────────────────────────────────────────
  light_type: {
    name: 'Light Type', category: 'lighting', icon: '💡',
    description: 'Choose the primary light source type',
    fields: [
      { key: 'light_type', label: 'Light Type', type: 'dropdown', value: 'natural',
        options: ['natural','studio','neon','candlelight','bioluminescent','rim light','volumetric','god rays'] }
    ]
  },
  light_direction: {
    name: 'Light Direction', category: 'lighting', icon: '🔦',
    description: 'Set the direction of the primary light source',
    fields: [
      { key: 'direction', label: 'Direction', type: 'dropdown', value: 'front',
        options: ['front','side','back','top-down','under-lit','3-point setup'] }
    ]
  },
  light_intensity: {
    name: 'Light Intensity', category: 'lighting', icon: '☀️',
    description: 'Control the strength of the light (0–100)',
    fields: [
      { key: 'intensity', label: 'Intensity', type: 'slider', value: 75, min: 0, max: 100, step: 1, unit: '%' }
    ]
  },
  shadow_hardness: {
    name: 'Shadow Hardness', category: 'lighting', icon: '🌑',
    description: 'Control shadow softness (0=no shadows, 100=hard shadows)',
    fields: [
      { key: 'hardness', label: 'Hardness', type: 'slider', value: 50, min: 0, max: 100, step: 1, unit: '' }
    ]
  },
  ambient_occlusion: {
    name: 'Ambient Occlusion', category: 'lighting', icon: '🌫️',
    description: 'Toggle ambient occlusion (contact shadows in crevices)',
    fields: [
      { key: 'ao', label: 'Ambient Occlusion', type: 'toggle', value: false }
    ]
  },
  hdr_lighting: {
    name: 'HDR Lighting', category: 'lighting', icon: '✨',
    description: 'Toggle HDR lighting for greater dynamic range',
    fields: [
      { key: 'hdr', label: 'HDR Lighting', type: 'toggle', value: false }
    ]
  },

  // ── COLOR / MOOD ───────────────────────────────────────────────────────────
  color_palette: {
    name: 'Color Palette', category: 'color', icon: '🎨',
    description: 'Describe the overall color palette of the scene',
    fields: [
      { key: 'palette', label: 'Color Palette', type: 'text', value: '',
        placeholder: 'muted earth tones, warm browns and oranges...' }
    ]
  },
  saturation: {
    name: 'Saturation', category: 'color', icon: '💧',
    description: 'Control color saturation (100 = normal)',
    fields: [
      { key: 'saturation', label: 'Saturation', type: 'slider', value: 100, min: 0, max: 200, step: 1, unit: '%' }
    ]
  },
  contrast: {
    name: 'Contrast', category: 'color', icon: '◐',
    description: 'Control image contrast (100 = normal)',
    fields: [
      { key: 'contrast', label: 'Contrast', type: 'slider', value: 100, min: 0, max: 200, step: 1, unit: '%' }
    ]
  },
  color_temperature: {
    name: 'Color Temperature', category: 'color', icon: '🌡️',
    description: 'Set color temperature from warm (low K) to cool (high K)',
    fields: [
      { key: 'temperature', label: 'Temperature', type: 'slider', value: 6500, min: 1000, max: 12000, step: 100, unit: 'K' }
    ]
  },
  color_grading: {
    name: 'Color Grading', category: 'color', icon: '🎞️',
    description: 'Apply a cinematic color grading style',
    fields: [
      { key: 'grading', label: 'Grading', type: 'dropdown', value: 'none',
        options: ['none','cinematic','vintage','cross-process','bleach bypass','teal-orange','monochrome'] }
    ]
  },
  mood_emotion: {
    name: 'Mood / Emotion', category: 'color', icon: '😌',
    description: 'Set the overall emotional tone of the image',
    fields: [
      { key: 'mood', label: 'Mood', type: 'dropdown', value: 'serene',
        options: ['serene','dramatic','melancholic','joyful','tense','mysterious','romantic','epic'] }
    ]
  },

  // ── STYLE / ART DIRECTION ──────────────────────────────────────────────────
  art_style: {
    name: 'Art Style', category: 'style', icon: '🖼️',
    description: 'Set the primary artistic rendering style',
    fields: [
      { key: 'style', label: 'Art Style', type: 'dropdown', value: 'photorealistic',
        options: ['photorealistic','oil painting','watercolor','anime','comic book','concept art',
                  'impressionist','surrealist','minimalist','pixel art','3D render','sketch'] }
    ]
  },
  artist_reference: {
    name: 'Artist Reference', category: 'style', icon: '👨‍🎨',
    description: "Reference a specific artist's style",
    fields: [
      { key: 'artist', label: 'Artist Reference', type: 'text', value: '',
        placeholder: 'in the style of Monet, Greg Rutkowski...' }
    ]
  },
  film_reference: {
    name: 'Film Reference', category: 'style', icon: '🎬',
    description: "Reference a specific film's visual style",
    fields: [
      { key: 'film', label: 'Film Reference', type: 'text', value: '',
        placeholder: 'cinematic like Blade Runner 2049, Dune...' }
    ]
  },
  era_period: {
    name: 'Era / Period', category: 'style', icon: '📅',
    description: 'Set the historical or fictional era of the scene',
    fields: [
      { key: 'era', label: 'Era', type: 'dropdown', value: 'contemporary',
        options: ['contemporary','retro 80s','retro 90s','Victorian','Renaissance','futuristic','medieval'] }
    ]
  },
  render_engine: {
    name: 'Render Engine', category: 'style', icon: '⚙️',
    description: 'Specify a 3D render engine for technical quality',
    fields: [
      { key: 'engine', label: 'Render Engine', type: 'dropdown', value: 'none',
        options: ['none','Unreal Engine','Octane','Arnold','Cycles','Redshift','V-Ray'] }
    ]
  },

  // ── CAMERA / LENS ──────────────────────────────────────────────────────────
  shot_type: {
    name: 'Shot Type', category: 'camera', icon: '🎯',
    description: 'Set the camera shot type and subject framing',
    fields: [
      { key: 'shot', label: 'Shot Type', type: 'dropdown', value: 'medium shot',
        options: ['close-up','medium shot','wide shot','extreme close-up','aerial',
                  "worm's eye","bird's eye",'Dutch angle'] }
    ]
  },
  focal_length: {
    name: 'Lens Focal Length', category: 'camera', icon: '🔭',
    description: 'Choose the camera lens focal length',
    fields: [
      { key: 'focal', label: 'Focal Length', type: 'dropdown', value: '50mm standard',
        options: ['14mm ultra-wide','24mm wide','35mm','50mm standard','85mm portrait',
                  '135mm','200mm telephoto','400mm'] }
    ]
  },
  aperture: {
    name: 'Aperture / DOF', category: 'camera', icon: '🔵',
    description: 'Control depth of field via aperture setting',
    fields: [
      { key: 'aperture', label: 'Aperture', type: 'slider', value: 2.8, min: 1.2, max: 22, step: 0.1, unit: 'f/' }
    ]
  },
  camera_movement: {
    name: 'Camera Movement', category: 'camera', icon: '🎥',
    description: 'Suggest a camera movement or shooting style',
    fields: [
      { key: 'movement', label: 'Movement', type: 'dropdown', value: 'static',
        options: ['static','handheld','dolly','tracking','panning'] }
    ]
  },
  film_format: {
    name: 'Film Format', category: 'camera', icon: '📽️',
    description: 'Set the capture medium or film format',
    fields: [
      { key: 'format', label: 'Film Format', type: 'dropdown', value: 'digital',
        options: ['digital','35mm film','medium format','large format','Polaroid','VHS'] }
    ]
  },
  lens_effects: {
    name: 'Lens Effects', category: 'camera', icon: '💫',
    description: 'Add lens-based optical effects',
    fields: [
      { key: 'effects', label: 'Lens Effects', type: 'multicheckbox', value: [],
        options: ['lens flare','chromatic aberration','vignette','film grain','motion blur'] }
    ]
  },

  // ── QUALITY / DETAIL ───────────────────────────────────────────────────────
  resolution: {
    name: 'Resolution Target', category: 'quality', icon: '📐',
    description: 'Set the target output resolution',
    fields: [
      { key: 'resolution', label: 'Resolution', type: 'dropdown', value: '1024px',
        options: ['512px','768px','1024px','2048px','4K','8K'] }
    ]
  },
  detail_level: {
    name: 'Detail Level', category: 'quality', icon: '🔬',
    description: 'Set the overall level of rendered detail',
    fields: [
      { key: 'detail', label: 'Detail Level', type: 'dropdown', value: 'high detail',
        options: ['low detail','normal','high detail','ultra detailed','hyperrealistic'] }
    ]
  },
  negative_prompt: {
    name: 'Negative Prompt', category: 'quality', icon: '🚫',
    description: 'List elements to exclude from the generated image',
    fields: [
      { key: 'negative', label: 'Exclude', type: 'textarea', value: '',
        placeholder: 'blurry, low quality, distorted, watermark, text, ugly...' }
    ]
  },
  cfg_scale: {
    name: 'CFG Scale', category: 'quality', icon: '🎚️',
    description: 'Guidance strength — how closely to follow the prompt (1–30)',
    fields: [
      { key: 'cfg', label: 'CFG Scale', type: 'slider', value: 7, min: 1, max: 30, step: 0.5 }
    ]
  },
  steps: {
    name: 'Steps', category: 'quality', icon: '📊',
    description: 'Number of diffusion sampling steps',
    fields: [
      { key: 'steps', label: 'Steps', type: 'slider', value: 30, min: 10, max: 150, step: 1 }
    ]
  },
  seed: {
    name: 'Seed', category: 'quality', icon: '🎲',
    description: 'Random seed for reproducible generation (-1 = random)',
    fields: [
      { key: 'seed', label: 'Seed', type: 'number', value: -1, min: -1, max: 2147483647, hasRandom: true }
    ]
  },
  sampling_method: {
    name: 'Sampling Method', category: 'quality', icon: '🔄',
    description: 'Choose the diffusion sampling algorithm',
    fields: [
      { key: 'sampler', label: 'Sampler', type: 'dropdown', value: 'DPM++ 2M Karras',
        options: ['Euler','Euler a','DPM++ 2M Karras','DDIM','LMS'] }
    ]
  }
};

let _nodeCounter = 0;

export function createNode(type, x, y, customDef = null) {
  const def = customDef || NODE_REGISTRY[type];
  if (!def) { console.error(`Unknown node type: ${type}`); return null; }

  _nodeCounter++;
  const id = `node_${String(_nodeCounter).padStart(3, '0')}`;

  const fields = def.fields.map(f => ({
    ...f,
    value: Array.isArray(f.value) ? [...f.value] : f.value
  }));

  return {
    id,
    type: customDef ? type : type,
    category: def.category || 'custom',
    name: def.name,
    icon: def.icon || '✨',
    x: Math.round(x / 20) * 20,
    y: Math.round(y / 20) * 20,
    collapsed: false,
    fields
  };
}

export function setNodeCounter(n) { _nodeCounter = n; }
