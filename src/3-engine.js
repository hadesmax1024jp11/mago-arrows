/* ==========================================================================
   3 / 4　引擎：盤面渲染、規則、動畫、平移縮放、馬哥
   ========================================================================== */

const board = $('board'), panel = $('boardPanel'), svg = $('pieces'),
  dots = $('dots'), gridc = $('gridc'), guide = $('guide'), APP = $('app');
const NS = 'http://www.w3.org/2000/svg';
const DV = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };   // 畫面座標（y 往下）
let G = null;

/* 格距：先求「整盤放得進畫面」的大小，再夾在 20～54 之間。
   縮不下去時靠 zoom（下限＝整盤剛好看得完）＋拖曳平移。 */
const MINCELL = 20, MAXCELL = 54, ZMAX = 2.5;
function cellSize() {
  const wrap = $('boardWrap');
  const pad = 20 + 8;
  const availW = wrap.clientWidth - pad, availH = wrap.clientHeight - pad;
  const fit = Math.floor(Math.min(availW / (G ? G.cols : 8), availH / (G ? G.rows : 8)));
  return clamp(fit, MINCELL, MAXCELL);
}
function panelSize() {
  return { w: panel.offsetWidth || (G.cell * G.cols + 20), h: panel.offsetHeight || (G.cell * G.rows + 20) };
}
function zoomRange() {
  const wrap = $('boardWrap'), p = panelSize();
  let fit = Math.min(wrap.clientWidth / p.w, wrap.clientHeight / p.h);
  if (fit > 0.985) fit = 1;
  return { min: Math.min(1, Math.max(.12, fit)), max: ZMAX };
}
function boardBox() {
  const wrap = $('boardWrap'), p = panelSize(), z = (G && G.zoom) || 1;
  const w = p.w * z, h = p.h * z;
  return {
    x: (wrap.clientWidth - w) / 2 + ((G && G.panX) || 0), y: (wrap.clientHeight - h) / 2 + ((G && G.panY) || 0),
    w, h, vw: wrap.clientWidth, vh: wrap.clientHeight
  };
}
function panLimit() {
  const wrap = $('boardWrap'), p = panelSize(), z = G.zoom || 1;
  return {
    x: Math.max(0, (p.w * z - wrap.clientWidth) / 2 + 14),
    y: Math.max(0, (p.h * z - wrap.clientHeight) / 2 + 14)
  };
}
function setZoom(z, ax, ay) {
  if (!G) return;
  const r = zoomRange(), z0 = G.zoom || 1, z1 = clamp(z, r.min, r.max);
  if (Math.abs(z1 - z0) < 1e-4) return;
  const wr = $('boardWrap').getBoundingClientRect();
  const cx = wr.left + wr.width / 2, cy = wr.top + wr.height / 2;
  const sx = (ax == null ? cx : ax), sy = (ay == null ? cy : ay), k = z1 / z0;
  G.zoom = z1;
  setPan((G.panX || 0) * k + (sx - cx) * (1 - k), (G.panY || 0) * k + (sy - cy) * (1 - k));
}
function setPan(x, y) {
  if (!G) return;
  const Lm = panLimit(), z = G.zoom || 1, wrap = $('boardWrap'), p = panelSize();
  G.panX = clamp(x || 0, -Lm.x, Lm.x);
  G.panY = clamp(y || 0, -Lm.y, Lm.y);
  const px = (wrap.clientWidth - p.w * z) / 2 + G.panX, py = (wrap.clientHeight - p.h * z) / 2 + G.panY;
  panel.style.transform = `translate(${px.toFixed(1)}px,${py.toFixed(1)}px) scale(${z.toFixed(3)})`;
  wrap.classList.toggle('pannable', Lm.x > 0 || Lm.y > 0);
}
function centerOn(o) {
  if (!G || !o) return;
  const Lm = panLimit(); if (!Lm.x && !Lm.y) return;
  const k = G.cell, [hx, hy] = o.cells[0], z = G.zoom || 1;
  setPan(-((hx + .5) * k - G.cell * G.cols / 2) * z, -((hy + .5) * k - G.cell * G.rows / 2) * z);
}
function fitBoard(force) {
  if (!G) return;
  const r = zoomRange();
  if (r.min >= 1) { setZoom(1); return; }
  setZoom(force || Math.abs((G.zoom || 1) - r.min) > 0.02 ? r.min : 1);
  setPan(0, 0); redrawSoon();
}
let dotsT = null;
function redrawSoon() { clearTimeout(dotsT); dotsT = setTimeout(() => { if (G) { drawDots(); drawGrid(); } }, 150); }

/* ---------- 點陣格線 ---------- */
function canvasDpr(cv, w, h) {
  const want = Math.min(2, Math.max(1, (G.zoom || 1))) * (w * h > 1.6e6 ? 1 : Math.min(2, devicePixelRatio || 1));
  if (Math.abs((cv.__dpr || 0) - want) > 0.05) { cv.__dpr = want; cv.width = w * want; cv.height = h * want; }
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  const c = cv.getContext('2d');
  c.setTransform(cv.__dpr, 0, 0, cv.__dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  return c;
}
const cssVar = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
function drawDots() {
  const k = G.cell, w = k * G.cols, h = k * G.rows;
  const c = canvasDpr(dots, w, h);
  c.fillStyle = cssVar('--dot') || '#E6E5EC';
  const r = Math.max(1.1, k * .033);
  for (let y = 0; y < G.rows; y++) for (let x = 0; x < G.cols; x++) {
    c.beginPath(); c.arc((x + .5) * k, (y + .5) * k, r, 0, 7); c.fill();
  }
}
function drawGrid() {
  const k = G.cell, w = k * G.cols, h = k * G.rows;
  const c = canvasDpr(gridc, w, h);
  if (!S.grid) return;
  c.strokeStyle = cssVar('--grid') || '#F1F1F8';
  c.lineWidth = 1;
  c.beginPath();
  for (let x = 0; x <= G.cols; x++) { c.moveTo(x * k + .5, 0); c.lineTo(x * k + .5, h); }
  for (let y = 0; y <= G.rows; y++) { c.moveTo(0, y * k + .5); c.lineTo(w, y * k + .5); }
  c.stroke();
}

/* ---------- 幾何：折線「尾 → 頭 → 盤外」，蛇身用 stroke-dash 只露出前段 ---------- */
const STROKE = .17, HEADLEN = .44, HEADHALF = .27;
function geo(o) {
  const k = G.cell, [dx, dy] = DV[o.d];
  const pts = o.cells.slice().reverse().map(([x, y]) => [(x + .5) * k, (y + .5) * k]);
  const [hx, hy] = o.cells[0];
  const steps = (dx > 0 ? G.cols - hx : dx < 0 ? hx + 1 : dy > 0 ? G.rows - hy : hy + 1) + 1;
  const ex = (hx + .5) * k + dx * steps * k, ey = (hy + .5) * k + dy * steps * k;
  const body = 'M' + pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L');
  return { body, full: body + 'L' + ex.toFixed(1) + ' ' + ey.toFixed(1), LB: (o.cells.length - 1) * k, LE: steps * k };
}
function shape(o) {
  const g = geo(o), k = G.cell, w = Math.max(2, k * STROKE);
  o.LB = g.LB; o.LT = g.LB + g.LE;
  o.ln.setAttribute('d', g.full);
  o.ln.setAttribute('stroke-width', w);
  o.ln.setAttribute('stroke-dasharray', `${g.LB} ${o.LT + g.LB}`);
  o.ln.style.strokeDashoffset = '0';
  o.hit.setAttribute('d', g.body);
  o.hit.setAttribute('stroke-width', Math.max(15, Math.min(k * .86, w * 3.6)));
  const a = k * HEADLEN, b = Math.max(w * 1.35, k * HEADHALF);
  o.hd.setAttribute('d', `M0 0L${-a} ${-b}L${-a} ${b}Z`);
  headAt(o, g.LB + k * .30);
}
function headAt(o, dist) {
  const L = o.LT, dd = clamp(dist, .5, L);
  const p = o.ln.getPointAtLength(dd), q = o.ln.getPointAtLength(Math.max(0, dd - 1.5));
  const ang = Math.atan2(p.y - q.y, p.x - q.x) * 180 / Math.PI;
  o.hd.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${ang.toFixed(1)})`);
  o.hd.style.opacity = dist > L - 1 ? 0 : 1;
}
function render() {
  svg.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const o of G.items) {
    const g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'pc');
    const hit = document.createElementNS(NS, 'path'); hit.setAttribute('class', 'hit');
    const ln = document.createElementNS(NS, 'path'); ln.setAttribute('class', 'ln');
    const hd = document.createElementNS(NS, 'path'); hd.setAttribute('class', 'hd');
    g.appendChild(hit); g.appendChild(ln); g.appendChild(hd);
    o.g = g; o.hit = hit; o.ln = ln; o.hd = hd;
    hit.addEventListener('pointerdown', ev => { ev.preventDefault(); PEND = o; });
    frag.appendChild(g);
  }
  svg.appendChild(frag);
  layout();
}
function layout(keepPan) {
  if (!G) return;
  const cell = cellSize();
  G.cell = cell;
  const w = cell * G.cols, h = cell * G.rows;
  board.style.width = w + 'px'; board.style.height = h + 'px';
  svg.setAttribute('width', w); svg.setAttribute('height', h);
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  dots.__dpr = 0; gridc.__dpr = 0;
  drawDots(); drawGrid();
  for (const o of G.items) if (o.g) shape(o);
  if (!keepPan) G.zoom = 1;
  setPan(keepPan ? G.panX : 0, keepPan ? G.panY : 0);
}

/* ---------- 規則 ---------- */
const inB = (x, y) => x >= 0 && y >= 0 && x < G.cols && y < G.rows;
function pathOf(o) {
  const [hx, hy] = o.cells[0], [dx, dy] = DV[o.d];
  let x = hx + dx, y = hy + dy; const cells = [];
  while (inB(x, y)) {
    const h = G.grid.get(x + ',' + y);
    if (h && h !== o) return { ok: false, cells, bx: x, by: y };
    cells.push([x, y]); x += dx; y += dy;
  }
  return { ok: true, cells };
}
const anyMove = () => G.items.filter(o => pathOf(o).ok);

/* ---------- 一關的生命週期 ---------- */
/* 第 n 關長什麼樣（不必真的生成關卡就能回答，關卡地圖用得到） */
function slotOf(n) {
  if (P && n <= P.n) return { baked: true, idx: n - 1, tier: tierOf(P.cells[n - 1]), shaped: P.shp.charCodeAt(n - 1) === 49 };
  return { baked: false, tier: n <= ONBOARD_LEVELS ? 0 : pickTier(n), shaped: n % SHAPED_EVERY === 0 };
}
/* 關卡資料：前 P.n 關是烘焙好的，之後即時生成（同一套決定性生成器） */
function levelSource(n, dailyStamp) {
  if (dailyStamp) return generate(dailySeed(dailyStamp), 4);
  const sl = slotOf(n);
  return sl.baked ? decodeLevel(sl.idx) : generate(n, 4);
}
function newLevel(n, opt) {
  opt = opt || {};
  const lv = levelSource(n, opt.daily);
  const tier = tierOf(lv.cells);
  G = {
    level: n, daily: opt.daily || null,
    cols: lv.cols, rows: lv.rows, grid: new Map(), items: [],
    hearts: K.MaxLives, cleared: 0, total: lv.pieces.length, cellCount: lv.cells,
    combo: 0, busy: false, sel: null, score: 0, cell: 40, over: false,
    mistakes: 0, t0: Date.now(), saidNear: 0, panX: 0, panY: 0, zoom: 1,
    tier, shaped: !!lv.shaped
  };
  let id = 0;
  for (const p of lv.pieces) {
    const o = { id: id++, cells: p.cells, d: p.d };
    G.items.push(o);
    for (const [x, y] of p.cells) G.grid.set(x + ',' + y, o);
  }
  render(); updHud(); hush();
  fitBoard(true);
  tips();
  setTimeout(() => {
    if (G && G.level === n && G.cleared === 0 && G.hearts === K.MaxLives && !M.shown) {
      // 教學期輪流講四句規則，之後才換成一般開場台詞
      if (n <= K.TutorialLevels && !G.daily) say(pick('tut' + ((n - 1) % 4 + 1)) || pick('start', { '%L': n }), { prio: 3, pose: 'side', dur: 4200 });
      else say(pick('start', { '%L': G.daily ? '★' : n }), { prio: 2, pose: 'side', dur: 2800 });
    }
  }, 520);
}

/* 三個操作提示，各只出現一次 */
function tips() {
  const need = panLimit();
  if (!S.tips.tap) { S.tips.tap = 1; save(); toast(T('tapMove'), 2600); return; }
  if ((need.x > 0 || need.y > 0) && !S.tips.swipe) { S.tips.swipe = 1; save(); toast(T('swipe'), 2800); return; }
  if ((need.x > 0 || need.y > 0) && !S.tips.pinch) { S.tips.pinch = 1; save(); toast(T('pinch'), 2800); }
}

const raf = () => new Promise(r => requestAnimationFrame(r));
function slide(o, to, ms, ease) {
  return new Promise(res => {
    let t0 = null;
    const step = now => {
      if (t0 === null) t0 = now;
      const t = clamp((now - t0) / ms, 0, 1);
      const e = ease ? ease(t) : t * t * (3 - 2 * t);
      const k = to * e;
      o.ln.style.strokeDashoffset = (-k) + 'px';
      headAt(o, o.LB + k + G.cell * .30);
      if (t < 1) requestAnimationFrame(step); else res();
    };
    requestAnimationFrame(step);
  });
}

async function onTap(o) {
  if (!G || G.busy || G.over) return;
  clearGuide();
  if (S.safe && G.sel !== o) {
    if (G.sel && G.sel.g) G.sel.g.classList.remove('sel');
    G.sel = o; o.g.classList.add('sel'); SFX.tap();
    if (S.guide) showGuide(o);
    return;
  }
  if (G.sel && G.sel.g) G.sel.g.classList.remove('sel');
  G.sel = null;
  const p = pathOf(o);
  G.busy = true;
  if (p.ok) await escape(o); else await bump(o, p);
  G.busy = false;
  if (G.over) return;
  if (G.items.length === 0) win();
  else if (p.ok && S.autoFin && G.items.length <= 3) autoFinish();
}
async function autoFinish() {
  G.busy = true;
  let first = true;
  while (G.items.length) {
    const o = anyMove()[0];
    if (!o) break;
    centerOn(o);
    await new Promise(r => setTimeout(r, first ? 140 : 240));
    first = false;
    if (!G || G.over) { G.busy = false; return; }
    await escape(o);
  }
  G.busy = false;
  if (!G.over && G.items.length === 0) win();
}
async function escape(o) {
  for (const [x, y] of o.cells) G.grid.delete(x + ',' + y);
  G.combo++; G.cleared++;
  S.arrowsCleared++;
  const gain = (10 + G.level * 2) * Math.min(5, G.combo);
  G.score += gain;
  SFX.pop(G.combo);
  burst(o); floatText(o, '+' + gain);
  if (G.combo >= 3) showCombo();
  if (G.combo > S.bestCombo) S.bestCombo = G.combo;
  updHud();
  if (G.combo === 5 || (G.combo > 5 && G.combo % 7 === 0)) {
    praise(praiseWord());
    say(pick('cheer', { '%C': '× ' + G.combo }), { prio: 2, dur: 2300 });
  } else if (!G.saidNear && G.total >= 8 && G.cleared / G.total >= .82) {
    G.saidNear = 1; say(pick('near'), { prio: 2, pose: 'side', dur: 2400 });
  }
  const dur = clamp(o.LT * 1.5, 230, 520);
  await slide(o, o.LT, dur, t => t * t * (3 - 2 * t));
  o.g.remove();
  G.items = G.items.filter(i => i !== o);
}
async function bump(o, p) {
  G.combo = 0; hideCombo(); G.hearts--; G.mistakes++; S.misses++;
  SFX.bump(); buzz(40); updHud(true);
  if (G.hearts === 1) say(pick('last'), { prio: 3, pose: 'full', dur: 3000 });
  else if (G.hearts > 0) say(pick('bump'), { prio: 2, pose: 'back', dur: 2500 });
  const d = p.cells.length * G.cell;
  o.g.classList.add('bad');
  showBlockX(p.bx, p.by);
  const blocker = G.grid.get(p.bx + ',' + p.by);
  if (blocker && blocker.g) { blocker.g.classList.add('bad'); setTimeout(() => blocker.g.classList.remove('bad'), 420); }
  await slide(o, d, 165);
  await slide(o, 0, 200, t => 1 - Math.pow(1 - t, 2));
  o.g.classList.remove('bad');
  o.ln.style.strokeDashoffset = '0'; headAt(o, o.LB + G.cell * .30);
  if (G.hearts <= 0) lose();
}

/* ---------- 輔助線 / 提示 ---------- */
function showGuide(o) {
  const p = pathOf(o), k = G.cell, [hx, hy] = o.cells[0], [dx, dy] = DV[o.d];
  const cells = p.cells.slice();
  if (p.ok) cells.push([hx + dx * (p.cells.length + 1), hy + dy * (p.cells.length + 1)]);
  cells.forEach(([x, y], i) => {
    const last = p.ok && i === cells.length - 1;
    const e = document.createElement('div'); e.className = 'pathdot';
    const r = Math.max(3, k * (last ? .3 : .16));
    e.style.cssText = `width:${r}px;height:${r}px;left:${(x + .5) * k - r / 2}px;top:${(y + .5) * k - r / 2}px`
      + (last ? ';opacity:.5' : '');
    guide.appendChild(e);
  });
  if (!p.ok) showBlockX(p.bx, p.by, true);
}
const clearGuide = () => { guide.innerHTML = ''; };
function showBlockX(x, y, keep) {
  const k = G.cell, e = document.createElement('div'); e.className = 'blockx';
  e.style.cssText = `left:${x * k}px;top:${y * k}px;width:${k}px;height:${k}px;font-size:${k * .46}px`;
  e.textContent = '✕'; guide.appendChild(e);
  if (!keep) setTimeout(() => e.remove(), 520);
}

/* ---------- 粒子 / 浮字 / 讚美 / 提示條 ---------- */
const fx = $('fx'), fc = fx.getContext('2d');
let parts = [];
function appBox() { const r = APP.getBoundingClientRect(); return r.width ? r : { left: 0, top: 0, width: innerWidth, height: innerHeight }; }
function resizeFx() {
  const r = appBox(), dpr = Math.min(2, devicePixelRatio || 1);
  fx.width = r.width * dpr; fx.height = r.height * dpr;
  fx.style.width = r.width + 'px'; fx.style.height = r.height + 'px';
  fc.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function headPos(o) {
  const r = board.getBoundingClientRect(), a = appBox(), z = (G.zoom || 1), k = G.cell, [x, y] = o.cells[0];
  return { x: r.left - a.left + (x + .5) * k * z, y: r.top - a.top + (y + .5) * k * z };
}
function burst(o) {
  const c = headPos(o), cols = [cssVar('--blue') || '#5676FF', cssVar('--ink') || '#12142E', '#9AA6FF'];
  for (let i = 0; i < 10; i++) parts.push({
    x: c.x, y: c.y, vx: (Math.random() - .5) * 4.2, vy: (Math.random() - .9) * 4.2,
    r: 1.5 + Math.random() * 2.6, life: 1, col: cols[R(cols.length)], rot: Math.random() * 6
  });
}
function floatText(o, txt, col) {
  const c = headPos(o), e = document.createElement('div');
  e.className = 'float'; e.textContent = txt;
  e.style.cssText += `left:${c.x}px;top:${c.y - 13}px;color:${col || 'var(--blue)'};font-size:15px`;
  APP.appendChild(e); setTimeout(() => e.remove(), 900);
}
function floatHint(t) {
  const e = document.createElement('div'); e.className = 'float'; e.textContent = t;
  e.style.cssText += 'left:50%;top:32%;color:var(--ink);font-size:14px';
  APP.appendChild(e); setTimeout(() => e.remove(), 900);
}
let praiseT = null;
function praise(txt) {
  const p = $('praise'); p.textContent = txt; p.classList.remove('on');
  void p.offsetWidth; p.classList.add('on');
  clearTimeout(praiseT); praiseT = setTimeout(() => p.classList.remove('on'), 1200);
}
let toastT = null;
function toast(txt, ms) {
  const t = $('toast'); t.textContent = txt; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms || 2400);
}
(function loop() {
  fc.clearRect(0, 0, fx.width, fx.height);
  parts = parts.filter(p => p.life > 0);
  for (const p of parts) {
    p.x += p.vx; p.y += p.vy; p.vy += .17; p.vx *= .985; p.life -= .022; p.rot += .16;
    fc.save(); fc.globalAlpha = Math.max(0, p.life); fc.translate(p.x, p.y); fc.rotate(p.rot);
    fc.fillStyle = p.col; fc.beginPath(); fc.ellipse(0, 0, p.r * 1.4, p.r * .7, 0, 0, 7); fc.fill(); fc.restore();
  }
  requestAnimationFrame(loop);
})();

/* ---------- HUD ---------- */
function updHud(hit) {
  $('lvChip').textContent = G.daily ? '★ ' + G.daily.slice(5) : T('levelN', G.level);
  const dc = $('diffChip');
  dc.textContent = tierName(G.tier);
  dc.style.background = `var(${TIERVAR[G.tier]})`;
  $('hintN').textContent = S.hints;
  $('btnGrid').classList.toggle('on', !!S.grid);
  const h = $('hearts'); h.innerHTML = '';
  for (let i = 0; i < K.MaxLives; i++) h.insertAdjacentHTML('beforeend', HEART(i >= G.hearts));
  if (hit) { const el = h.children[G.hearts]; if (el) el.classList.add('pulse'); }
  $('prog').style.width = (G.total ? G.cleared / G.total * 100 : 0) + '%';
}
const showCombo = () => { const c = $('combo'); c.textContent = T('combo') + ' × ' + G.combo; c.classList.add('on'); };
const hideCombo = () => $('combo').classList.remove('on');

/* ==========================================================================
   馬哥 —— 整組（本人＋對話框）鎖在棋盤外的空白帶，算不出安全位置就不出現
   ========================================================================== */
const MW = $('mascot'), MI = $('mimg'), MB = $('mbub');
const ASP = { full: 1.30, side: 1.69, back: 1.30, head: 0.68 };
const BH = 36, PAD = 8;
const M = { prio: -1, shown: false, tHide: 0, idle: 0 };
const bubW = t => { let n = 0; for (const c of t) n += /[\x00-\xff]/.test(c) ? .56 : 1; return Math.round(n * 13.2) + 28; };
function findSlot(pose, text) {
  const wr = $('boardWrap').getBoundingClientRect(), pr = panel.getBoundingClientRect();
  const W = wr.width, H = wr.height;
  if (W < 40 || H < 40) return [];
  const px = pr.left - wr.left, py = pr.top - wr.top, pw = pr.width, ph = pr.height;
  const gap = { L: px, R: W - (px + pw), T: py, B: H - (py + ph) }, bw = bubW(text);
  const big = pose === 'head' ? [92, 54] : [116, 58];
  const base = Math.min(big[0], Math.max(big[1], appBox().width * (pose === 'head' ? .13 : .15)));
  const out = [];
  for (const side of ['L', 'R', 'B', 'T']) {
    const g = gap[side];
    for (const k of [1, .86, .72]) {
      const w = Math.round(base * k), h = Math.round(w * ASP[pose]);
      if (side === 'L' || side === 'R') {
        if (Math.max(w, bw) > g - 4) continue;
        if (h + PAD + BH > H) continue;
        const y = clamp(Math.round((H - h) / 2), BH + PAD, Math.max(BH + PAD, H - h));
        const cx = side === 'L' ? 0 : px + pw;
        out.push({
          side, w, h, x: Math.round(cx + (g - w) / 2), y,
          bx: Math.round(cx + (g - bw) / 2), by: y - BH - PAD, bw, tail: 'd', flip: side === 'L'
        });
        break;
      } else {
        if (Math.max(h, BH) > g - 4) continue;
        if (w + PAD + bw > W) continue;
        const y = side === 'T' ? Math.round(py - h - 4) : Math.round(py + ph + 4);
        let x = Math.round(px + pw * .58), bx = x + w + PAD, tail = 'l';
        if (bx + bw > W) { bx = x - PAD - bw; tail = 'r'; }
        if (bx < 0 || x + w > W) { x = Math.round((W - (w + PAD + bw)) / 2); bx = x + w + PAD; tail = 'l'; }
        if (x < 0) x = 0;
        out.push({ side, w, h, x, y, bx, by: Math.round(y + (h - BH) / 2), bw, tail, flip: false });
        break;
      }
    }
  }
  return out;
}
function say(text, opt) {
  opt = opt || {};
  if (!S.mascot || !text) return;
  const pose = opt.pose || 'full', prio = opt.prio == null ? 1 : opt.prio, dur = opt.dur || 2900;
  if (!G || G.over || $('modal').classList.contains('on')) return;
  if (!$('game').classList.contains('on')) return;
  if (M.shown && prio < M.prio) return;
  if (prio === 0 && Date.now() - M.idle < 11000) return;
  const slots = findSlot(pose, text);
  if (!slots.length) return;
  const s = slots[R(slots.length)];
  clearTimeout(M.tHide);
  MW.dataset.side = s.side; MW.dataset.box = [s.x, s.y, s.w, s.h].join(',');
  MW.dataset.bub = [s.bx, s.by, s.bw, BH].join(',');
  MW.style.cssText = `left:${s.x}px;top:${s.y}px;width:${s.w}px;height:${s.h}px`;
  MI.src = SPRITES[pose === 'head' ? 'head' : pose];
  MW.classList.toggle('flip', pose === 'side' && s.flip);
  MB.className = 'mbub t-' + s.tail;
  MB.style.cssText = `left:${s.bx - s.x}px;top:${s.by - s.y}px;width:${s.bw}px;height:${BH}px`;
  MB.textContent = text;
  const push = { L: 'translate(-26px,0)', R: 'translate(26px,0)', T: 'translate(0,-26px)', B: 'translate(0,26px)' }[s.side];
  MW.style.transform = push; MW.classList.add('on');
  requestAnimationFrame(() => { MW.style.transform = 'translate(0,0)'; });
  M.prio = prio; M.shown = true; M.idle = Date.now();
  M.tHide = setTimeout(() => { MW.style.transform = push; MW.classList.remove('on'); M.shown = false; M.prio = -1; }, dur);
}
function hush() { clearTimeout(M.tHide); MW.classList.remove('on'); M.shown = false; M.prio = -1; }
const LINE = {
  zh: {
    tut1: ['點一下箭頭，它就往箭尖的方向衝出去'],
    tut2: ['被擋住就撞牆扣一顆心 — 先看箭尖前面有沒有東西'],
    tut3: ['順序才是關鍵，走掉的箭頭會讓出通道'],
    tut4: ['沿著邊界找：頭貼著邊又朝外的，一定走得掉'],
    start: ['第 %L 關，馬哥陪你', '看清方向再點', '慢慢想，不趕時間', '這關交給你了'],
    cheer: ['連擊 %C，讚啦', '太順了', '就是這個節奏', '手感來了'],
    near: ['快清完了', '剩最後幾隻', '再一點點'],
    bump: ['哎呀，撞到了', '那條路被擋住啦', '馬哥不忍心看'],
    last: ['只剩一顆心，冷靜', '慢慢看，別急'],
    hint: ['這支現在走得掉', '就是它，點下去'],
    idle: ['加油加油', '卡住就按燈泡', '馬哥在旁邊', '發財發財', '先掃邊界一圈', '一定有解，別急']
  },
  en: {
    tut1: ['Tap an arrow and it shoots out the way its head points'],
    tut2: ['Blocked means a bump and one life — check the line ahead first'],
    tut3: ['Order is everything: an arrow that leaves opens a lane'],
    tut4: ['Scan the border: a head on the edge facing out always leaves'],
    start: ['Level %L — Mago is with you', 'Check the direction first', 'Take your time', 'This one is yours'],
    cheer: ['Combo %C, nice!', 'On a roll', 'That is the rhythm', 'You are hot'],
    near: ['Almost clear', 'Just a few left', 'Nearly there'],
    bump: ['Ouch, blocked', 'That lane was busy', 'Mago looked away'],
    last: ['One life left — stay calm', 'Slow down, look again'],
    hint: ['This one can leave now', 'That is the one, tap it'],
    idle: ['Keep going', 'Stuck? Tap the bulb', 'Mago is right here', 'Scan the border first', 'There is always a solution']
  }
};
function pick(k, rep) {
  const set = LINE[S.lang] || LINE.zh;
  const arr = set[k] || (LINE.zh[k]);
  if (!arr) return '';
  let s = arr[R(arr.length)];
  for (const a in rep) s = s.split(a).join(rep[a]);
  return s;
}
setInterval(() => {
  if (!G || G.over || M.shown) return;
  if (!$('game').classList.contains('on')) return;
  say(pick('idle'), { prio: 0, pose: ['full', 'head', 'side'][R(3)], dur: 2600 });
}, 4200);
