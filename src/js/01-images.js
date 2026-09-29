// ── CAPTURES : plusieurs images par trade ────────────────────────────
// Les captures du formulaire vivent dans currentImgs ; à l'enregistrement elles vont dans t.caps (t.cap = la première,
// gardée pour la compatibilité avec les anciens backups). Chaque image est réduite (1400 px, JPEG) avant stockage.
let currentImgs = [];
const MAX_CAPS = 8;

function handleImgSelect(input) {
  [...(input.files || [])].forEach(f => { if (f.type.startsWith('image/')) readImgFile(f); });
  input.value = '';
}
function handleDrop(e) {
  e.preventDefault();
  document.getElementById('upload-zone').classList.remove('drag');
  [...(e.dataTransfer.files || [])].forEach(f => { if (f.type.startsWith('image/')) readImgFile(f); });
}
// Coller une capture (Ctrl+V) quand le formulaire de trade est visible.
document.addEventListener('paste', e => {
  const card = document.getElementById('trade-form-card');
  if (!card || !card.offsetParent || !e.clipboardData) return;
  const files = [...e.clipboardData.files].filter(f => f.type.startsWith('image/'));
  if (!files.length) return;
  e.preventDefault();
  openFormSectionById('section-notes');
  files.forEach(readImgFile);
  showToast(files.length + ' capture(s) collée(s) ✓', 'success');
});
function readImgFile(file) {
  if (currentImgs.length >= MAX_CAPS) { showToast('Maximum ' + MAX_CAPS + ' captures par trade', 'error'); return; }
  const reader = new FileReader();
  reader.onload = e => compressDataUrl(e.target.result, out => {
    if (!safeImgSrc(out) || currentImgs.length >= MAX_CAPS) return;
    currentImgs.push(out);
    renderUploadThumbs();
  });
  reader.readAsDataURL(file);
}
function renderUploadThumbs() {
  const prev = document.getElementById('upload-preview'), ph = document.getElementById('upload-placeholder');
  if (!prev || !ph) return;
  ph.style.display = currentImgs.length ? 'none' : 'block';
  prev.style.display = currentImgs.length ? 'flex' : 'none';
  mount(prev, html`${currentImgs.map((src, i) => html`<div class="thumb">
      <img src="${safeImgSrc(src)}" alt="Capture ${i + 1}" onclick="event.stopPropagation();openGallery(currentImgs, ${raw(i)}, (j, d) => { currentImgs[j] = d; renderUploadThumbs(); })">
      <button type="button" class="thumb-del" title="Retirer cette capture" aria-label="Retirer la capture ${i + 1}" onclick="event.stopPropagation();removeUploadImg(${raw(i)})">×</button>
    </div>`)}${currentImgs.length < MAX_CAPS ? html`<div class="thumb thumb-add" title="Ajouter une capture">+</div>` : ''}`);
}
function removeUploadImg(i) { currentImgs.splice(i, 1); renderUploadThumbs(); }
function clearImg() { currentImgs = []; const f = document.getElementById('f-img'); if (f) f.value = ''; renderUploadThumbs(); }

// ── VISIONNEUSE + ANNOTATIONS ────────────────────────────────────────
// openGallery(images, index, onSave) : navigation ←/→, zoom (clic), et outil d'annotation (crayon, rectangle, flèche).
// onSave(index, dataUrl) reçoit l'image annotée (sinon l'annotation est désactivée).
let gallery = { images: [], index: 0, onSave: null, zoom: false, annot: null };
function openGallery(images, index, onSave) {
  const list = (images || []).map(safeImgSrc).filter(Boolean);
  if (!list.length) return;
  gallery = { images: list, index: Math.max(0, Math.min(index || 0, list.length - 1)), onSave: onSave || null, zoom: false, annot: null };
  const lb = document.getElementById('lightbox');
  lb.classList.add('open');
  lb.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  renderGallery();
  setTimeout(() => { const b = document.getElementById('lb-close'); if (b) b.focus(); }, 30);
}
function openLightbox(src) { openGallery([src], 0); }
function openLightboxById(id, index) {
  const t = trades.find(x => x.id === id);
  if (!t) return;
  openGallery(tradeImages(t), index || 0, (j, dataUrl) => {
    const imgs = tradeImages(t).slice(); imgs[j] = dataUrl;
    const prev = { cap: t.cap, caps: t.caps };
    t.caps = imgs; t.cap = imgs[0] || '';
    if (!save()) { Object.assign(t, prev); return; }
    showToast('Annotation enregistrée ✓', 'success');
    if (document.getElementById('trade-drawer-overlay').classList.contains('show')) openTradeDetail(t.id);
  });
}
function renderGallery() {
  const g = gallery, img = document.getElementById('lightbox-img'), canvas = document.getElementById('lb-canvas');
  if (!img) return;
  img.src = g.images[g.index];
  img.classList.toggle('zoomed', g.zoom);
  img.style.display = g.annot ? 'none' : '';
  canvas.style.display = g.annot ? 'block' : 'none';
  document.getElementById('lb-counter').textContent = (g.index + 1) + ' / ' + g.images.length;
  document.getElementById('lb-prev').disabled = g.index === 0;
  document.getElementById('lb-next').disabled = g.index === g.images.length - 1;
  document.getElementById('lb-annot-tools').style.display = g.annot ? 'flex' : 'none';
  document.getElementById('lb-annotate').style.display = g.onSave && !g.annot ? '' : 'none';
}
function galleryStep(d) {
  if (gallery.annot) return;
  const n = gallery.index + d;
  if (n < 0 || n >= gallery.images.length) return;
  gallery.index = n; gallery.zoom = false; renderGallery();
}
function toggleGalleryZoom() { if (gallery.annot) return; gallery.zoom = !gallery.zoom; renderGallery(); }
function closeLightbox() {
  const lb = document.getElementById('lightbox');
  if (!lb.classList.contains('open')) return;
  lb.classList.remove('open');
  lb.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  gallery.annot = null;
}

// Annotation : l'image est dessinée dans un canvas à sa taille réelle ; les tracés sont gardés en liste (annulables).
function startAnnotation() {
  const canvas = document.getElementById('lb-canvas'), src = gallery.images[gallery.index];
  const im = new Image();
  im.onload = () => {
    canvas.width = im.naturalWidth; canvas.height = im.naturalHeight;
    gallery.annot = { img: im, shapes: [], tool: 'rect', color: cssVar('--red', '#ef5350'), drawing: null };
    redrawAnnotation(); renderGallery(); setAnnotTool('rect');
  };
  im.src = src;
}
function setAnnotTool(tool) {
  if (!gallery.annot) return;
  gallery.annot.tool = tool;
  document.querySelectorAll('[data-annot-tool]').forEach(b => b.classList.toggle('active', b.dataset.annotTool === tool));
}
function setAnnotColor(c) {
  if (!gallery.annot) return;
  gallery.annot.color = c;
  document.querySelectorAll('[data-annot-color]').forEach(b => b.classList.toggle('active', b.dataset.annotColor === c));
}
function undoAnnotation() { if (gallery.annot) { gallery.annot.shapes.pop(); redrawAnnotation(); } }
function cancelAnnotation() { gallery.annot = null; renderGallery(); }
function saveAnnotation() {
  if (!gallery.annot || !gallery.onSave) return;
  const canvas = document.getElementById('lb-canvas');
  const out = canvas.toDataURL('image/jpeg', IMG_QUALITY);
  gallery.images[gallery.index] = out;
  gallery.onSave(gallery.index, out);
  gallery.annot = null; renderGallery();
}
function redrawAnnotation() {
  const a = gallery.annot, canvas = document.getElementById('lb-canvas'); if (!a) return;
  const c = canvas.getContext('2d'), lw = Math.max(3, Math.round(canvas.width / 350));
  c.clearRect(0, 0, canvas.width, canvas.height);
  c.drawImage(a.img, 0, 0);
  a.shapes.concat(a.drawing ? [a.drawing] : []).forEach(s => {
    c.strokeStyle = s.color; c.fillStyle = s.color; c.lineWidth = lw; c.lineCap = 'round'; c.lineJoin = 'round';
    if (s.tool === 'pen') { c.beginPath(); s.pts.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.stroke(); }
    else if (s.tool === 'rect') { c.strokeRect(Math.min(s.x0, s.x1), Math.min(s.y0, s.y1), Math.abs(s.x1 - s.x0), Math.abs(s.y1 - s.y0)); }
    else if (s.tool === 'arrow') {
      const ang = Math.atan2(s.y1 - s.y0, s.x1 - s.x0), h = lw * 5;
      c.beginPath(); c.moveTo(s.x0, s.y0); c.lineTo(s.x1, s.y1); c.stroke();
      c.beginPath(); c.moveTo(s.x1, s.y1); c.lineTo(s.x1 - h * Math.cos(ang - .45), s.y1 - h * Math.sin(ang - .45)); c.lineTo(s.x1 - h * Math.cos(ang + .45), s.y1 - h * Math.sin(ang + .45)); c.closePath(); c.fill();
    }
  });
}
function initAnnotationCanvas() {
  const canvas = document.getElementById('lb-canvas');
  if (!canvas || canvas.dataset.init) return;
  canvas.dataset.init = '1';
  const pos = e => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * canvas.width / r.width, y: (e.clientY - r.top) * canvas.height / r.height }; };
  canvas.addEventListener('pointerdown', e => {
    const a = gallery.annot; if (!a) return;
    e.preventDefault(); canvas.setPointerCapture(e.pointerId);
    const p = pos(e);
    a.drawing = a.tool === 'pen' ? { tool: 'pen', color: a.color, pts: [p] } : { tool: a.tool, color: a.color, x0: p.x, y0: p.y, x1: p.x, y1: p.y };
  });
  canvas.addEventListener('pointermove', e => {
    const a = gallery.annot; if (!a || !a.drawing) return;
    const p = pos(e);
    if (a.drawing.tool === 'pen') a.drawing.pts.push(p); else { a.drawing.x1 = p.x; a.drawing.y1 = p.y; }
    redrawAnnotation();
  });
  const end = () => { const a = gallery.annot; if (!a || !a.drawing) return; a.shapes.push(a.drawing); a.drawing = null; redrawAnnotation(); };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
}
onReady(initAnnotationCanvas);

function saveAccountSize() {
  const val = parseFloat(document.getElementById('account-size').value);
  if (!isNaN(val) && val > 0) {
    accountSize = val;
    DB.setItem((JP + 'account'), val);
    renderAll();
  }
}
