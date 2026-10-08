// ── THEME / PARAMÈTRES ──────────────────────────────────────────────
const THEME_VARS = [
  { group: 'Arrière-plans', items: [
    { key:'--bg', label:'Fond général' },
    { key:'--bg2', label:'Fond des panneaux' },
    { key:'--bg3', label:'Fond des cartes' },
    { key:'--bg4', label:'Fond au survol' },
  ]},
  { group: 'Bordures', items: [
    { key:'--border', label:'Bordure standard' },
    { key:'--border2', label:'Bordure accentuée' },
  ]},
  { group: 'Texte', items: [
    { key:'--txt', label:'Texte principal' },
    { key:'--txt2', label:'Texte secondaire' },
    { key:'--txt3', label:'Texte tertiaire' },
  ]},
  { group: 'Accent de l\'interface', items: [
    { key:'--accent', label:'Accent (boutons, sélection, courbe d\'équité)', derive:true },
  ]},
  { group: 'Couleurs sémantiques', items: [
    { key:'--green', label:'Gains / TP', derive:true },
    { key:'--red', label:'Pertes / SL', derive:true },
    { key:'--amber', label:'Break-even / alerte', derive:true },
    { key:'--blue', label:'Accent info', derive:true },
    { key:'--purple', label:'Accent secondaire', derive:true },
  ]},
  { group: 'Menu latéral', items: [
    { key:'--nav-icon-color', label:'Couleur des icônes' },
    { key:'--nav-text-color', label:'Couleur du texte' },
  ]},
  { group: 'Logo', items: [
    { key:'--logo-color', label:'Couleur du logo' },
  ]},
];

const THEME_PRESETS = {
  // Thème de la marque : bleu nuit de l'icône (dégradé #151935 → #0E1020), blanc et menthe du logo. Touches propres
  // (classe body.theme-lockin, 70-premium.css) : fond en dégradé, boutons en pilule, page active marquée par un petit niveau.
  lockin:   { name:'LockIn', emoji:'◉', colors:{'--bg':'#0e1020','--bg2':'#13162a','--bg3':'#1a1e36','--bg4':'#232844','--border':'#22273f','--border2':'#2f3553','--txt':'#f5f7fb','--txt2':'#c4c9db','--txt3':'#9da4bc','--accent':'#3ee6a8','--on-accent':'#06281c','--green':'#22c55e','--red':'#f2555a','--amber':'#e8a53a','--blue':'#6ea8ff','--purple':'#a78bfa','--nav-icon-color':'#9da4bc','--nav-text-color':'#c4c9db','--logo-color':'#3ee6a8'} },
  default:  { name:'Graphite', emoji:'◐', colors:{'--bg':'#0c0d10','--bg2':'#121418','--bg3':'#181b21','--bg4':'#20242c','--border':'#22262e','--border2':'#2e333d','--txt':'#eceef2','--txt2':'#c0c5cf','--txt3':'#99a0ad','--accent':'#3ee6a8','--on-accent':'#06281c','--green':'#22c55e','--red':'#f2555a','--amber':'#e8a53a','--blue':'#5aa9ff','--purple':'#a78bfa','--nav-icon-color':'#99a0ad','--nav-text-color':'#c0c5cf','--logo-color':'#3ee6a8'} },
  proclair: { name:'Porcelaine', emoji:'○', colors:{'--bg':'#f6f7f9','--bg2':'#ffffff','--bg3':'#f2f3f6','--bg4':'#e9ebf0','--border':'#e4e6eb','--border2':'#d5d8df','--txt':'#111318','--txt2':'#3f4554','--txt3':'#5f6676','--accent':'#0f766e','--on-accent':'#ffffff','--green':'#15803d','--red':'#d93a47','--amber':'#b9770e','--blue':'#2f7fdb','--purple':'#7a5ae0','--nav-icon-color':'#5f6676','--nav-text-color':'#3f4554','--logo-color':'#0f766e'} },
  midnight: { name:'Minuit', emoji:'◑', colors:{'--bg':'#0a0d16','--bg2':'#0f1320','--bg3':'#151a2b','--bg4':'#1c2236','--border':'#1f2639','--border2':'#2a3249','--txt':'#e8ebf5','--txt2':'#bcc3d8','--txt3':'#959db6','--accent':'#3ee6a8','--on-accent':'#06281c','--green':'#22c55e','--red':'#f2555a','--amber':'#e8a53a','--blue':'#7aa2ff','--purple':'#b49cff','--nav-icon-color':'#959db6','--nav-text-color':'#bcc3d8','--logo-color':'#3ee6a8'} },
  contrast: { name:'Contraste', emoji:'●', colors:{'--bg':'#000000','--bg2':'#0b0b0c','--bg3':'#151517','--bg4':'#202023','--border':'#3a3a3f','--border2':'#55555c','--txt':'#ffffff','--txt2':'#d0d0d6','--txt3':'#a5a5ad','--accent':'#4befb6','--on-accent':'#04140d','--green':'#4ade80','--red':'#ff6b70','--amber':'#ffc04d','--blue':'#6fb8ff','--purple':'#c4adff','--nav-icon-color':'#a5a5ad','--nav-text-color':'#d0d0d6','--logo-color':'#4befb6'} },
};
// Anciens réglages : un journal resté sur l'ancien thème « Sombre » par défaut bascule sur la nouvelle charte « Terminal pro ».
// Un thème personnalisé (couleur modifiée à la main → plus de --preset-key) n'est jamais touché.
// Marque LockIn : les 4 thèmes de base passent de l'accent violet au vert menthe de la marque (texte sombre sur les
// boutons pour rester lisible). Seulement si l'accent est encore celui d'origine : un accent choisi à la main est gardé.
(function migrateToBrandAccent() {
  try {
    if (DB.getItem('g_brand_v1')) return;
    const OLD = { default: '#5d6cf6', proclair: '#4f5fe8', midnight: '#7aa2ff', contrast: '#8c9bff' };
    const th = JSON.parse(DB.getItem('g_theme') || '{}') || {}, key = th['--preset-key'];
    if (OLD[key] && String(th['--accent'] || '').toLowerCase() === OLD[key]) {
      const c = THEME_PRESETS[key].colors;
      ['--accent', '--on-accent', '--logo-color'].forEach(k => { th[k] = c[k]; });
      th['--accent-d'] = hexToRgba(c['--accent'], .12);
      DB.setItem('g_theme', JSON.stringify(th));
    }
    DB.setItem('g_brand_v1', '1');
  } catch (e) {}
})();
(function migrateToTerminalCharter() {
  try {
    if (DB.getItem('g_charter_v2')) return;
    const th = JSON.parse(DB.getItem('g_theme') || '{}') || {};
    if (th['--preset-key'] === 'default' && th['--bg'] === '#0b0c10') {
      Object.keys(th).forEach(k => { if (/^--(bg|bg2|bg3|bg4|border|border2|txt|txt2|txt3|green|red|amber|blue|purple|accent)(-d|-dd)?$/.test(k)) delete th[k]; });
      DB.setItem('g_theme', JSON.stringify(th));
    }
    if (th['--preset-key'] === 'proclair' && th['--bg'] === '#f4f5fa') {
      Object.keys(th).forEach(k => { if (/^--(bg|bg2|bg3|bg4|border|border2|txt|txt2|txt3|green|red|amber|blue|purple|accent)(-d|-dd)?$/.test(k)) delete th[k]; });
      Object.entries(THEME_PRESETS.proclair.colors).forEach(([k, v]) => {
        th[k] = v;
        if (['--green', '--red', '--amber', '--blue', '--purple', '--accent'].includes(k)) th[k + '-d'] = hexToRgba(v, .12);
        if (k === '--green' || k === '--red') th[k + '-dd'] = hexToRgba(v, .06);
      });
      DB.setItem('g_theme', JSON.stringify(th));
    }
    DB.setItem('g_charter_v2', '1');
  } catch (e) {}
})();


// Charte « Premium sobre » (une seule fois) :
//  - le thème personnel « 02 » devient « Néon » et passe en tête des thèmes ;
//  - un journal resté sur un thème prédéfini reprend les nouvelles couleurs de ce thème (ou Graphite si son thème
//    n'existe plus) ; un thème personnel appliqué (couleurs modifiées à la main) n'est jamais touché ;
//  - les anciens réglages de structure (police, arrondi, style des cartes…) des thèmes prédéfinis sont retirés
//    pour laisser place à la nouvelle charte.
(function migrateToPremiumCharter() {
  try {
    if (DB.getItem('g_charter_v3')) return;
    const list = JSON.parse(DB.getItem('g_custom_themes') || '[]');
    if (Array.isArray(list)) {
      const neon = list.find(t => t && String(t.name).trim() === '02') || list.find(t => t && /^n[ée]on$/i.test(String(t.name).trim()));
      if (neon) { neon.name = 'Néon'; neon.neon = true; DB.setItem('g_custom_themes', JSON.stringify(list)); }
    }
    const th = JSON.parse(DB.getItem('g_theme') || '{}') || {};
    const key = th['--preset-key'];
    if (key) {
      const STRUCT = ['--radius', '--r', '--r2', '--r3', '--font-sans', '--font-mono', '--sans', '--mono', '--card-style', '--bg-style', '--glow', '--bstyle'];
      Object.keys(th).forEach(k => { if (/^--(bg|bg2|bg3|bg4|border|border2|txt|txt2|txt3|green|red|amber|blue|purple|accent|nav-icon-color|nav-text-color|logo-color)(-d|-dd)?$/.test(k) || STRUCT.includes(k)) delete th[k]; });
      const next = THEME_PRESETS[key] ? key : 'default';
      Object.entries(THEME_PRESETS[next].colors).forEach(([k, v]) => {
        th[k] = v;
        if (['--green', '--red', '--amber', '--blue', '--purple', '--accent'].includes(k)) th[k + '-d'] = hexToRgba(v, .13);
        if (k === '--green' || k === '--red') th[k + '-dd'] = hexToRgba(v, .06);
      });
      th['--preset-key'] = next;
      DB.setItem('g_theme', JSON.stringify(th));
    }
    DB.setItem('g_charter_v3', '1');
  } catch (e) {}
})();


// Thème prédéfini appliqué : ses couleurs suivent les retouches de la charte (ex. textes secondaires plus lisibles).
// Un thème personnel (Néon, ou couleurs modifiées à la main) n'est jamais touché.
(function refreshPresetColors() {
  try {
    const VER = '5';   // 5 : marque LockIn (accent menthe, vert des gains distinct)
    if (DB.getItem('g_preset_colors_ver') === VER) return;
    const th = JSON.parse(DB.getItem('g_theme') || '{}') || {};
    const p = th['--preset-key'] && THEME_PRESETS[th['--preset-key']];
    if (p) {
      Object.entries(p.colors).forEach(([k, v]) => {
        th[k] = v;
        if (['--green', '--red', '--amber', '--blue', '--purple', '--accent'].includes(k)) th[k + '-d'] = hexToRgba(v, .13);
        if (k === '--green' || k === '--red') th[k + '-dd'] = hexToRgba(v, .06);
      });
      DB.setItem('g_theme', JSON.stringify(th));
    }
    DB.setItem('g_preset_colors_ver', VER);
  } catch (e) {}
})();


function hexToRgba(hex, alpha) {
  let h = hex.replace('#','');
  if (h.length === 3) h = h.split('').map(c=>c+c).join('');
  const num = parseInt(h,16);
  return `rgba(${(num>>16)&255},${(num>>8)&255},${num&255},${alpha})`;
}
// Thème venant du stockage ou d'un backup : seulement des variables CSS « --nom » avec des valeurs simples
// (pas d'url(), d'@import ni de caractères de structure) — un thème importé ne peut ni charger une ressource externe ni casser le CSS.
function safeThemeObj(o) {
  const out = {};
  if (!o || typeof o !== 'object' || Array.isArray(o)) return out;
  Object.keys(o).forEach(k => {
    const v = o[k];
    if (!/^--[\w-]{1,40}$/.test(k) || (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean')) return;
    const s = String(v);
    if (s.length > 200 || /url\s*\(|image\s*\(|@import|expression\s*\(|[\\<>{};]/i.test(s)) return;
    out[k] = v;
  });
  return out;
}
function loadThemeObj() {
  try { return safeThemeObj(JSON.parse(DB.getItem((GP + 'theme')) || '{}')); } catch(e) { return {}; }
}
function saveThemeObj(theme) { DB.setItem((GP + 'theme'), JSON.stringify(theme)); }

function applyBodyStyleClasses(theme) {
  document.body.classList.remove('bgstyle-gradient','bgstyle-grid','cardstyle-glass','cardstyle-elevated','glow-on');
  const bg = theme['--bg-style'];
  if (bg === 'gradient') document.body.classList.add('bgstyle-gradient');
  else if (bg === 'grid') document.body.classList.add('bgstyle-grid');
  const card = theme['--card-style'];
  if (card === 'glass') document.body.classList.add('cardstyle-glass');
  else if (card === 'elevated') document.body.classList.add('cardstyle-elevated');
  if (theme['--glow']) document.body.classList.add('glow-on');
  document.body.classList.toggle('theme-lockin', theme['--preset-key'] === 'lockin');
}

function applySavedTheme() {
  const theme = loadThemeObj();
  Object.entries(theme).forEach(([k,v]) => {
    if (k.startsWith('--') ) document.documentElement.style.setProperty(k, v);
  });
  if (theme['--radius'] !== undefined) applyRadiusVars(parseInt(theme['--radius']));
  if (theme['--font-sans']) document.documentElement.style.setProperty('--sans', theme['--font-sans']);
  if (theme['--font-mono']) document.documentElement.style.setProperty('--mono', theme['--font-mono']);
  if (theme['--bstyle']) document.documentElement.style.setProperty('--bstyle', theme['--bstyle']);
  CHART_LINE_STYLE = theme['--chart-line-style'] || 'solid';
  applyBodyStyleClasses(theme);
}

const LINE_DASH_MAP = { solid: [], dashed: [7,4], dotted: [1.5,3] };
let CHART_LINE_STYLE = 'solid';
function currentLineDash() { return LINE_DASH_MAP[CHART_LINE_STYLE] || []; }

function onBorderStyleChange(val) {
  document.documentElement.style.setProperty('--bstyle', val);
  const theme = loadThemeObj();
  theme['--bstyle'] = val;
  saveThemeObj(theme);
}
function onChartLineStyleChange(val) {
  CHART_LINE_STYLE = val;
  const theme = loadThemeObj();
  theme['--chart-line-style'] = val;
  saveThemeObj(theme);
  renderAll();
}

function currentVar(key, fallback) {
  const theme = loadThemeObj();
  if (theme[key]) return theme[key];
  const cs = getComputedStyle(document.documentElement).getPropertyValue(key).trim();
  return cs || fallback;
}

function onColorPick(key, hex, derive) {
  document.documentElement.style.setProperty(key, hex);
  const theme = loadThemeObj();
  theme[key] = hex;
  delete theme['--preset-key'];
  if (derive) {
    const d = hexToRgba(hex, .12);
    document.documentElement.style.setProperty(key+'-d', d);
    theme[key+'-d'] = d;
    if (key === '--green' || key === '--red') {
      const dd = hexToRgba(hex, .06);
      document.documentElement.style.setProperty(key+'-dd', dd);
      theme[key+'-dd'] = dd;
    }
  }
  saveThemeObj(theme);
  applyBodyStyleClasses(theme);
}

function onRadiusChange(val) {
  const r = parseInt(val);
  document.getElementById('radius-val').textContent = r + 'px';
  applyRadiusVars(r);
  const theme = loadThemeObj();
  theme['--radius'] = r;
  saveThemeObj(theme);
  document.querySelectorAll('.shape-preset-btn').forEach(b => {
    b.classList.toggle('style-btn-active', String(r) === b.dataset.r);
  });
  const slider = document.getElementById('radius-slider');
  if (slider) slider.value = Math.min(r, 30);
}
function applyRadiusVars(r) {
  document.documentElement.style.setProperty('--r', r + 'px');
  document.documentElement.style.setProperty('--r2', (r+4) + 'px');
  document.documentElement.style.setProperty('--r3', (r+8) + 'px');
}

function onFontChange(val) {
  document.documentElement.style.setProperty('--sans', val);
  const theme = loadThemeObj();
  theme['--font-sans'] = val;
  saveThemeObj(theme);
}
function onFontMonoChange(val) {
  document.documentElement.style.setProperty('--mono', val);
  const theme = loadThemeObj();
  theme['--font-mono'] = val;
  saveThemeObj(theme);
  renderAll();
}

function onBgStyleChange(val) {
  const theme = loadThemeObj();
  theme['--bg-style'] = val;
  saveThemeObj(theme);
  applyBodyStyleClasses(theme);
  renderSettingsPage();
}
function onCardStyleChange(val) {
  const theme = loadThemeObj();
  theme['--card-style'] = val;
  saveThemeObj(theme);
  applyBodyStyleClasses(theme);
  renderSettingsPage();
}
function onGlowChange(checked) {
  const theme = loadThemeObj();
  theme['--glow'] = checked;
  saveThemeObj(theme);
  applyBodyStyleClasses(theme);
}
function onTextureChange(checked) {
  DB.setItem((GP + 'theme_texture'), checked ? '1' : '0');
  document.body.classList.toggle('texture-on', checked);
}
function applySystemTheme() {
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyPreset(prefersDark ? 'default' : 'proclair');
}
function onAutoThemeChange(checked) {
  DB.setItem((GP + 'theme_autosystem'), checked ? '1' : '0');
  if (checked) applySystemTheme();
}
if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (DB.getItem((GP + 'theme_autosystem')) === '1') applySystemTheme();
  });
}

function applyPreset(key, silent) {
  const preset = THEME_PRESETS[key];
  if (!preset) return;
  const theme = loadThemeObj();
  // Un thème sans couleur d'accent propre reprend son bleu d'information.
  if (!preset.colors['--accent']) preset.colors['--accent'] = preset.colors['--blue'];
  Object.entries(preset.colors).forEach(([k,v]) => {
    document.documentElement.style.setProperty(k, v);
    theme[k] = v;
    if (['--green','--red','--amber','--blue','--purple','--accent'].includes(k)) {
      const d = hexToRgba(v, .12);
      document.documentElement.style.setProperty(k+'-d', d);
      theme[k+'-d'] = d;
      if (k === '--green' || k === '--red') {
        const dd = hexToRgba(v, .06);
        document.documentElement.style.setProperty(k+'-dd', dd);
        theme[k+'-dd'] = dd;
      }
    }
  });
  theme['--preset-key'] = key;
  saveThemeObj(theme);
  applyBodyStyleClasses(theme);
  renderSettingsPage();
  if (typeof renderAll === 'function') renderAll();
  if (!silent) showToast(preset.emoji + ' Thème "' + preset.name + '" appliqué ✓', 'success');
}

function resetTheme() {
  DB.removeItem((GP + 'theme'));
  location.reload();
}

function renderThemePresetGrid() {
  const cont = document.getElementById('theme-preset-grid');
  if (!cont) return;
  const theme = loadThemeObj();
  const activeKey = theme['--preset-key'] || 'default';
  // Ton thème personnel « Néon » en premier, puis les thèmes de la charte.
  const neon = getCustomThemes().find(t => t.neon);
  const neonCard = neon ? (() => {
    const c = neon.theme || {}, active = !theme['--preset-key'] && ['--bg', '--accent', '--green'].every(k => theme[k] === c[k]);
    return html`<div class="theme-swatch neon${raw(active ? ' active' : '')}" onclick="applyCustomTheme(${raw(Number(neon.id) || 0)})">
      ${swatchStrip([c['--bg'], c['--bg3'], c['--green'], c['--red'], c['--accent'] || c['--purple'] || c['--blue']])}
      <div class="swatch-name">✦ Néon</div>
    </div>`;
  })() : '';
  const others = getCustomThemes().filter(t => !t.neon).map(t => {
    const c = t.theme || {}, active = !theme['--preset-key'] && ['--bg', '--accent', '--green', '--txt'].every(k => theme[k] === c[k]);
    return html`<div class="theme-swatch custom-in-grid${raw(active ? ' active' : '')}" onclick="applyCustomTheme(${raw(Number(t.id) || 0)})">
      ${swatchStrip([c['--bg'], c['--bg3'], c['--green'], c['--red'], c['--accent'] || c['--purple'] || c['--blue']])}
      <div class="swatch-name">💾 ${t.name}</div>
    </div>`;
  });
  mount(cont, html`${neonCard}${Object.entries(THEME_PRESETS).map(([key, p]) => {
    const c = p.colors;
    return html`<div class="theme-swatch${raw(key === activeKey && !(neonCard && !theme['--preset-key']) ? ' active' : '')}" onclick="applyPreset('${key}')">
      ${swatchStrip([c['--bg'], c['--bg3'], c['--green'], c['--red'], c['--accent'] || c['--blue']])}
      <div class="swatch-name">${p.emoji} ${p.name}</div>
    </div>`;
  })}${others}`);
}

// Aperçu d'un thème : ses 5 couleurs passées en variables CSS (seules valeurs en ligne, vérifiées par safeColor).
function swatchStrip(colors) {
  const fb = ['#111', '#222', '#22c55e', '#ef4444', '#a78bfa'];
  return html`<div class="swatch-strip" style="${raw(colors.map((c, i) => `--s${i + 1}:${safeColor(c, fb[i])}`).join(';'))}"><span></span><span></span><span></span><span></span><span></span></div>`;
}
function getCustomThemes() {
  try { const l = JSON.parse(DB.getItem((GP + 'custom_themes')) || '[]'); return Array.isArray(l) ? l.filter(t => t && typeof t === 'object').map(t => Object.assign({}, t, { theme: safeThemeObj(t.theme) })) : []; } catch (e) { return []; }
}
// Couleur acceptée seulement si c'est vraiment une couleur (#hex, rgb(a)) : un thème importé ne peut pas injecter de HTML via un attribut style.
function safeColor(v, fallback) { return (typeof v === 'string' && /^(#[0-9a-fA-F]{3,8}|rgba?\([\d.,\s%]+\))$/.test(v.trim())) ? v.trim() : fallback; }
function saveCustomThemesList(list) {
  DB.setItem((GP + 'custom_themes'), JSON.stringify(list));
}
function saveCurrentThemeAs() {
  const name = prompt('Nom de ce thème :', '');
  if (!name || !name.trim()) return;
  const theme = loadThemeObj();
  const list = getCustomThemes();
  list.push({ id: Date.now(), name: name.trim(), theme, savedAt: Date.now() });
  saveCustomThemesList(list);
  renderCustomThemesGrid();
  showToast('Thème "' + name.trim() + '" enregistré ✓', 'success');
}
function applyCustomTheme(id) {
  const list = getCustomThemes();
  const entry = list.find(t => Number(t.id) === id);
  if (!entry) return;
  saveThemeObj(entry.theme);
  Object.entries(entry.theme).forEach(([k,v]) => {
    if (k.startsWith('--')) document.documentElement.style.setProperty(k, v);
  });
  applySavedTheme();
  renderThemePresetGrid();
  renderCustomThemesGrid();
  renderAll();
  showToast('Thème "' + entry.name + '" appliqué ✓', 'success');
}
function deleteCustomTheme(id, event) {
  if (event) event.stopPropagation();
  const list = getCustomThemes().filter(t => Number(t.id) !== id);
  saveCustomThemesList(list);
  renderCustomThemesGrid();
}
function renderCustomThemesGrid() {
  renderThemePresetGrid();   // les thèmes enregistrés apparaissent aussi dans la grille des thèmes
  const cont = document.getElementById('custom-theme-grid');
  if (!cont) return;
  const list = getCustomThemes();
  if (!list.length) {
    mount(cont, html`<p class="theme-empty">Aucun thème enregistré pour l'instant — personnalise les couleurs ci-dessous puis clique sur "Enregistrer le thème actuel".</p>`);
    return;
  }
  mount(cont, html`${list.map(entry => {
    const c = entry.theme || {}, id = raw(Number(entry.id) || 0);
    return html`<div class="theme-swatch custom" onclick="applyCustomTheme(${id})">
      <button class="theme-del" onclick="deleteCustomTheme(${id}, event)" title="Supprimer">×</button>
      ${swatchStrip([c['--bg'], c['--bg3'], c['--green'], c['--red'], c['--purple']])}
      <div class="swatch-name">💾 ${entry.name}</div>
    </div>`;
  })}`);
}


function renderSettingsPage() {
  renderThemePresetGrid();
  renderCustomThemesGrid();
  const cont = document.getElementById('settings-groups');
  if (!cont) return;
  mount(cont, html`${THEME_VARS.map(g => html`
    <div class="cz-group">
      <div class="cz-group-title">${g.group}</div>
      <div class="color-grid">
        ${g.items.map(it => {
          const val = currentVar(it.key, '#000000');
          const safe = /^#[0-9a-fA-F]{6}$/.test(val) ? val : '#000000';
          return html`<div class="color-item">
            <input type="color" value="${safe}" onchange="onColorPick('${it.key}', this.value, ${raw(!!it.derive)})">
            <div class="color-item-txt"><div class="color-item-label">${it.label}</div><div class="color-item-val">${safe}</div></div>
          </div>`;
        })}
      </div>
    </div>`)}`);

  const radiusSlider = document.getElementById('radius-slider');
  const radiusVal = document.getElementById('radius-val');
  const theme = loadThemeObj();
  if (radiusSlider) {
    const r = theme['--radius'] !== undefined ? theme['--radius'] : 10;
    radiusSlider.value = r;
    if (radiusVal) radiusVal.textContent = r + 'px';
  }
  const fontSelect = document.getElementById('font-select');
  if (fontSelect) fontSelect.value = theme['--font-sans'] || "'Inter',system-ui,sans-serif";
  const fontMonoSelect = document.getElementById('font-mono-select');
  if (fontMonoSelect) fontMonoSelect.value = theme['--font-mono'] || "'Inter',system-ui,-apple-system,'Segoe UI',sans-serif";
  const borderStyleSelect = document.getElementById('border-style-select');
  if (borderStyleSelect) borderStyleSelect.value = theme['--bstyle'] || 'solid';
  const chartLineSelect = document.getElementById('chart-line-style-select');
  if (chartLineSelect) chartLineSelect.value = theme['--chart-line-style'] || 'solid';
  const heatSlider = document.getElementById('heat-intensity-slider');
  const heatVal = document.getElementById('heat-intensity-val');
  if (heatSlider) {
    const pct = Math.round(CAL_HEAT_INTENSITY * 100);
    heatSlider.value = pct;
    if (heatVal) heatVal.textContent = pct + '%';
  }
  const chartSlider = document.getElementById('chart-intensity-slider');
  const chartVal = document.getElementById('chart-intensity-val');
  if (chartSlider) {
    const pct2 = Math.round(CHART_INTENSITY * 100);
    chartSlider.value = pct2;
    if (chartVal) chartVal.textContent = pct2 + '%';
  }
  document.querySelectorAll('.shape-preset-btn').forEach(b => {
    b.classList.toggle('style-btn-active', String(theme['--radius'] !== undefined ? theme['--radius'] : 10) === b.dataset.r);
  });

  document.querySelectorAll('.bg-style-btn').forEach(b => {
    b.classList.toggle('style-btn-active', (theme['--bg-style'] || 'solid') === b.dataset.val);
  });
  document.querySelectorAll('.card-style-btn').forEach(b => {
    b.classList.toggle('style-btn-active', (theme['--card-style'] || 'flat') === b.dataset.val);
  });
  const glowToggle = document.getElementById('glow-toggle');
  if (glowToggle) glowToggle.checked = !!theme['--glow'];
  const textureToggle = document.getElementById('texture-toggle');
  if (textureToggle) textureToggle.checked = DB.getItem((GP + 'theme_texture')) === '1';
  const autoThemeToggle = document.getElementById('autotheme-toggle');
  if (autoThemeToggle) autoThemeToggle.checked = DB.getItem((GP + 'theme_autosystem')) === '1';
}


// Onglets de « Personnaliser mon thème ».
function showCzTab(id) {
  document.querySelectorAll('#settings-adv .cz-tab').forEach(b => { const on = b.dataset.cz === id; b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); });
  document.querySelectorAll('#settings-adv .cz-pane').forEach(p => p.classList.toggle('active', p.dataset.cz === id));
  try { DB.setItem(GP + 'cz_tab', id); } catch (e) {}
}
onReady(() => { const t = DB.getItem(GP + 'cz_tab'); if (t) showCzTab(t); });
