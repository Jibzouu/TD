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
  default:  { name:'Terminal pro', emoji:'📟', colors:{'--bg':'#0a0c10','--bg2':'#10131a','--bg3':'#161a23','--bg4':'#1e2330','--border':'#222836','--border2':'#2e3545','--txt':'#e6e9ef','--txt2':'#9aa3b5','--txt3':'#7d879b','--accent':'#4c8dff','--green':'#26a69a','--red':'#ef5350','--amber':'#c98500','--blue':'#4c8dff','--purple':'#9d8cff','--nav-icon-color':'#7d879b','--nav-text-color':'#9aa3b5','--logo-color':'#4c8dff'} },
  proclair: { name:'Terminal clair', emoji:'💎', colors:{'--bg':'#f5f6f9','--bg2':'#ffffff','--bg3':'#f8f9fb','--bg4':'#eceef3','--border':'#e2e5ec','--border2':'#cfd4de','--txt':'#151823','--txt2':'#4b5268','--txt3':'#687087','--accent':'#2f6fe0','--green':'#0f8f7e','--red':'#d63d3a','--amber':'#b7791f','--blue':'#2f6fe0','--purple':'#6d4fd8','--nav-icon-color':'#687087','--nav-text-color':'#4b5268','--logo-color':'#2f6fe0'} },
  midnight: { name:'Minuit bleu', emoji:'🌌', colors:{'--bg':'#05070f','--bg2':'#0b0f1e','--bg3':'#111834','--bg4':'#182247','--border':'#1f2a4d','--border2':'#2c3a66','--txt':'#e6ecff','--txt2':'#8e9bd1','--txt3':'#7280b8','--accent':'#38bdf8','--green':'#34d399','--red':'#fb7185','--amber':'#fbbf24','--blue':'#38bdf8','--purple':'#c084fc'} },
  forest:   { name:'Forêt', emoji:'🌲', colors:{'--bg':'#0c1210','--bg2':'#121b17','--bg3':'#1a2620','--bg4':'#22332a','--border':'#2b3d33','--border2':'#3a5245','--txt':'#eaf3ec','--txt2':'#93ab9c','--txt3':'#7a9383','--accent':'#67e8f9','--green':'#4ade80','--red':'#f87171','--amber':'#facc15','--blue':'#67e8f9','--purple':'#bef264'} },
  paper:    { name:'Papier', emoji:'📄', colors:{'--bg':'#f5f3ee','--bg2':'#ffffff','--bg3':'#efece4','--bg4':'#e6e2d6','--border':'#d8d3c4','--border2':'#c3bca8','--txt':'#20211d','--txt2':'#5b5a4f','--txt3':'#6f6c5e','--accent':'#1d4ed8','--green':'#15803d','--red':'#b91c1c','--amber':'#b45309','--blue':'#1d4ed8','--purple':'#7c3aed'} },
  neon:     { name:'Synthwave', emoji:'🌆', colors:{'--bg':'#0a0118','--bg2':'#150726','--bg3':'#1f0d38','--bg4':'#2a1450','--border':'#3d1f66','--border2':'#562b8a','--txt':'#f5e9ff','--txt2':'#b79ddb','--txt3':'#9a7fc4','--accent':'#00d4ff','--green':'#00f5d4','--red':'#ff2975','--amber':'#ffb800','--blue':'#00d4ff','--purple':'#f222ff'} },
  sunset:   { name:'Coucher de soleil', emoji:'🌇', colors:{'--bg':'#1a0f0a','--bg2':'#241610','--bg3':'#2f1d15','--bg4':'#3d2620','--border':'#4a2f24','--border2':'#614030','--txt':'#fff1e6','--txt2':'#d9a789','--txt3':'#b08670','--accent':'#ffa94d','--green':'#4ade80','--red':'#ff6b5b','--amber':'#ffa94d','--blue':'#7dd3fc','--purple':'#fb923c'} },
  ocean:    { name:'Océan profond', emoji:'🌊', colors:{'--bg':'#051419','--bg2':'#0a2129','--bg3':'#0f303b','--bg4':'#164252','--border':'#1d5468','--border2':'#276b82','--txt':'#e0f7fa','--txt2':'#7fb8c9','--txt3':'#6a9fb0','--accent':'#38bdf8','--green':'#2dd4bf','--red':'#f87171','--amber':'#fbbf24','--blue':'#38bdf8','--purple':'#a78bfa'} },
  contrast: { name:'Contraste', emoji:'⬛', colors:{'--bg':'#000000','--bg2':'#0a0a0a','--bg3':'#141414','--bg4':'#1f1f1f','--border':'#333333','--border2':'#4d4d4d','--txt':'#ffffff','--txt2':'#b3b3b3','--txt3':'#8c8c8c','--accent':'#3399ff','--green':'#00ff66','--red':'#ff3333','--amber':'#ffcc00','--blue':'#3399ff','--purple':'#cc66ff'} },
  matrix:   { name:'Matrix', emoji:'🖥️', colors:{'--bg':'#000800','--bg2':'#001a00','--bg3':'#002e00','--bg4':'#004400','--border':'#0a5c0a','--border2':'#147814','--txt':'#c8ffc8','--txt2':'#6fcf6f','--txt3':'#5aad5a','--accent':'#33ffcc','--green':'#00ff41','--red':'#ff4444','--amber':'#ffcc00','--blue':'#33ffcc','--purple':'#66ff99'} },
  ledger:   { name:'Ledger', emoji:'📖', colors:{'--bg':'#f0e6d2','--bg2':'#f8f1e0','--bg3':'#ece0c8','--bg4':'#e3d4b0','--border':'#c9b896','--border2':'#b3a074','--txt':'#2b1f14','--txt2':'#6b5940','--txt3':'#7d6a4c','--accent':'#2c4a6e','--green':'#2d5a3d','--red':'#8b2635','--amber':'#a67c00','--blue':'#2c4a6e','--purple':'#6b4571'} },
  mono:     { name:'Mono', emoji:'◼️', colors:{'--bg':'#0a0a0a','--bg2':'#131313','--bg3':'#1a1a1a','--bg4':'#232323','--border':'#2a2a2a','--border2':'#383838','--txt':'#f5f5f5','--txt2':'#a0a0a0','--txt3':'#858585','--accent':'#b0b0b0','--green':'#6b8f71','--red':'#a85d5d','--amber':'#a08b5c','--blue':'#6b7a8f','--purple':'#8f7a8f'} },
};
// Anciens réglages : un journal resté sur l'ancien thème « Sombre » par défaut bascule sur la nouvelle charte « Terminal pro ».
// Un thème personnalisé (couleur modifiée à la main → plus de --preset-key) n'est jamais touché.
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


function hexToRgba(hex, alpha) {
  let h = hex.replace('#','');
  if (h.length === 3) h = h.split('').map(c=>c+c).join('');
  const num = parseInt(h,16);
  return `rgba(${(num>>16)&255},${(num>>8)&255},${num&255},${alpha})`;
}
function loadThemeObj() {
  try { const o = JSON.parse(DB.getItem((GP + 'theme')) || '{}'); return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {}; } catch(e) { return {}; }
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
  cont.innerHTML = Object.entries(THEME_PRESETS).map(([key, p]) => {
    const c = p.colors;
    const active = key === activeKey ? ' active' : '';
    return `<div class="theme-swatch${active}" onclick="applyPreset('${key}')">
      <div class="swatch-strip">
        <span style="background:${c['--bg']}"></span>
        <span style="background:${c['--bg3']}"></span>
        <span style="background:${c['--green']}"></span>
        <span style="background:${c['--red']}"></span>
        <span style="background:${c['--accent'] || c['--blue']}"></span>
      </div>
      <div class="swatch-name">${p.emoji} ${p.name}</div>
    </div>`;
  }).join('');
}

function getCustomThemes() {
  try { const l = JSON.parse(DB.getItem((GP + 'custom_themes')) || '[]'); return Array.isArray(l) ? l.filter(t => t && typeof t === 'object') : []; } catch (e) { return []; }
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
  const cont = document.getElementById('custom-theme-grid');
  if (!cont) return;
  const list = getCustomThemes();
  if (!list.length) {
    cont.innerHTML = '<p style="font-size:11.5px;color:var(--txt3);grid-column:1/-1">Aucun thème enregistré pour l\'instant — personnalise les couleurs ci-dessous puis clique sur "Enregistrer le thème actuel".</p>';
    return;
  }
  cont.innerHTML = list.map(entry => {
    const c = entry.theme || {};
    return `<div class="theme-swatch" style="position:relative" onclick="applyCustomTheme(${Number(entry.id) || 0})">
      <button onclick="deleteCustomTheme(${Number(entry.id) || 0}, event)" title="Supprimer" style="position:absolute;top:6px;right:6px;width:18px;height:18px;border-radius:50%;background:var(--bg4);color:var(--txt3);border:none;font-size:11px;cursor:pointer;line-height:1;z-index:1;display:flex;align-items:center;justify-content:center">×</button>
      <div class="swatch-strip">
        <span style="background:${safeColor(c['--bg'],'#111')}"></span>
        <span style="background:${safeColor(c['--bg3'],'#222')}"></span>
        <span style="background:${safeColor(c['--green'],'#22c55e')}"></span>
        <span style="background:${safeColor(c['--red'],'#ef4444')}"></span>
        <span style="background:${safeColor(c['--purple'],'#a78bfa')}"></span>
      </div>
      <div class="swatch-name">💾 ${esc(entry.name)}</div>
    </div>`;
  }).join('');
}


function renderSettingsPage() {
  renderThemePresetGrid();
  renderCustomThemesGrid();
  const cont = document.getElementById('settings-groups');
  if (!cont) return;
  cont.innerHTML = THEME_VARS.map(g => `
    <div class="panel" style="margin-bottom:20px">
      <div class="panel-hdr">${g.group}</div>
      <div style="padding:16px;display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px">
        ${g.items.map(it => {
          const val = currentVar(it.key, '#000000');
          const safe = /^#[0-9a-fA-F]{6}$/.test(val) ? val : '#000000';
          return `<div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);padding:12px;display:flex;align-items:center;gap:10px">
            <input type="color" value="${safe}" onchange="onColorPick('${it.key}', this.value, ${!!it.derive})" style="width:36px;height:36px;border:none;border-radius:calc(var(--r) * .8);cursor:pointer;background:none;padding:0">
            <div style="min-width:0">
              <div style="font-size:11px;color:var(--txt2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${it.label}</div>
              <div style="font-size:11px;font-family:var(--mono);color:var(--txt3)">${safe}</div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`).join('');

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
  if (fontMonoSelect) fontMonoSelect.value = theme['--font-mono'] || "'JetBrains Mono',ui-monospace,monospace";
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

