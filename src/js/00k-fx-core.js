// ── EFFETS VISUELS : réglage commun ─────────────────────────────────────
// Animations (ouverture, compteurs, célébrations, point qui pulse) : actives par défaut, coupées par le réglage
// « Animations » (Paramètres → Thème, clé globale g_fx_off) ou par la préférence système « réduire les animations ».
// Les effets fixes (lueur de la courbe, fond, verre) suivent tous les thèmes via les variables CSS.
function fxOn() { return DB.getItem('g_fx_off') !== '1'; }
function fxMotion() { return fxOn() && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
