// ── IMAGE UPLOAD ─────────────────────────────────────────────────────
function handleImgSelect(input) {
  if (!input.files || !input.files[0]) return;
  readImgFile(input.files[0]);
}

function handleDrop(e) {
  e.preventDefault();
  document.getElementById('upload-zone').classList.remove('drag');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) readImgFile(file);
}

function readImgFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    compressDataUrl(e.target.result, out => {
      currentImgBase64 = out;
      document.getElementById('upload-placeholder').style.display = 'none';
      document.getElementById('upload-preview').style.display = 'block';
      document.getElementById('img-preview-el').src = currentImgBase64;
    });
  };
  reader.readAsDataURL(file);
}

function clearImg() {
  currentImgBase64 = '';
  document.getElementById('upload-placeholder').style.display = 'block';
  document.getElementById('upload-preview').style.display = 'none';
  document.getElementById('img-preview-el').src = '';
  document.getElementById('f-img').value = '';
}

// ── LIGHTBOX ─────────────────────────────────────────────────────────
function openLightbox(src) {
  document.getElementById('lightbox-img').src = src;
  document.getElementById('lightbox').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function openLightboxById(id) {
  const trade = trades.find(t => t.id === id);
  const src = trade ? safeImgSrc(trade.cap) : '';
  if (src) openLightbox(src);
}

function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
  document.body.style.overflow = '';
}

function saveAccountSize() {
  const val = parseFloat(document.getElementById('account-size').value);
  if (!isNaN(val) && val > 0) {
    accountSize = val;
    DB.setItem((JP + 'account'), val);
    renderKPIs();
    renderYearProgress();
  }
}
