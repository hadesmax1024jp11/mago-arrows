/* ==========================================================================
   2 / 4　關卡生成器 —— 逆向建構法，數學上保證有解
   --------------------------------------------------------------------------
   每放入一條蛇時，都要求「它的出場射線在當下是淨空的」。移除順序 = 放入順序的
   反向：第 i 條放進去時射線乾淨，只有第 i 之後放的東西可能擋住它，反向移除時
   那些都已經離場了。所以每一關都必有解，不需要事後求解驗證。

   隨機源全部走 seeded PRNG，種子由關卡號決定 → **第 N 關對任何人永遠是同一關**，
   關卡地圖才能預先顯示難度，星數與進度才有意義。
   ========================================================================== */

/* ---------- 決定性隨機源 ---------- */
let RS = 1;
const seedRnd = s => { RS = (s >>> 0) || 1; };
function rnd() {                       // mulberry32
  RS = (RS + 0x6D2B79F5) >>> 0;
  let t = RS;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const RI = n => Math.floor(rnd() * n);

const GDIR = ['up', 'right', 'down', 'left'];
const GDV = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };
const GOPP = { up: 'down', down: 'up', left: 'right', right: 'left' };

/* ---------- 六組筆觸：長度範圍 + 右轉 : 直行 : 左轉 ----------
   名字取的是「畫出來的樣子」而不是參數，因為碰撞約束會把行為拉向名字：
   偏直行的會被牆逼著轉（撞牆後沿邊界同向轉，畫出階梯回紋），
   偏轉彎的會撞到自己而退回直行（連續轉彎兩次就自撞）。 */
const BRUSH = {
  R: { name: 'Ruler', zh: '直尺', len: [5, 26], w: [1, 100, 1] },   // 長直線、少彎
  P: { name: 'Plain', zh: '素筆', len: [7, 28], w: [1, 5, 1] },     // 中庸
  L: { name: 'Lane', zh: '小徑', len: [6, 26], w: [1, 9, 1] },     // 少彎長路
  T: { name: 'Tangle', zh: '亂麻', len: [3, 70], w: [1, 2, 1] },     // 短、彎很多
  Z: { name: 'Zigzag', zh: '蛇行', len: [6, 20], w: [100, 5, 100] }, // 鋸齒
  C: { name: 'Coil', zh: '迴圈', len: [3, 64], w: [400, 400, 1] }  // 單向繞圈
};
const BRUSHKEYS = Object.keys(BRUSH);

/* ---------- 八個手繪圖形（16×16 點陣，放大到盤面尺寸） ---------- */
const SHAPES = {
  Heart: ['................', '..###......###..', '.#####....#####.', '.##############.',
    '################', '################', '################', '.##############.',
    '.##############.', '..############..', '...##########...', '....########....',
    '.....######.....', '......####......', '.......##.......', '................'],
  Star: ['.......##.......', '.......##.......', '......####......', '......####......',
    '.....######.....', '################', '.##############.', '..############..',
    '...##########...', '...##########...', '..####....####..', '..###......###..',
    '.###........###.', '.##..........##.', '##............##', '................'],
  Moon: ['.....######.....', '...##########...', '..######..####..', '.######....###..',
    '.######.........', '#######.........', '#######.........', '#######.........',
    '#######.........', '#######.........', '.######.........', '.######....###..',
    '..######..####..', '...##########...', '.....######.....', '................'],
  Ghost: ['.....######.....', '...##########...', '..###......###..', '.###........###.',
    '.##...##..##..##', '.##...##..##..##', '.##...........##', '.##....##.....##',
    '.##...........##', '.##...........##', '.##...........##', '.##...........##',
    '.##...........##', '.##...........##', '.##.##..##..##.#', '................'],
  Bamboo: ['....##....##....', '....##....##....', '..######..####..', '....##....##....',
    '....##....##....', '..######..####..', '....##....##....', '.##.##....##.##.',
    '..#####...##..#.', '....##....##....', '..######..####..', '....##....##....',
    '....##....##....', '..######..####..', '....##....##....', '................'],
  Panda: ['..##........##..', '.####......####.', '.######..######.', '.##############.',
    '################', '##.####..####.##', '##..##....##..##', '################',
    '################', '###.########.###', '.####..##..####.', '.##############.',
    '..############..', '...##########...', '....########....', '................'],
  Cloud: ['................', '......####......', '....##....##....', '...##......##...',
    '..##........##..', '.##..........##.', '##............##', '##............##',
    '##............##', '#..............#', '##............##', '.##..........##.',
    '..############..', '................', '................', '................'],
  Coin: ['.....######.....', '...##########...', '..####....####..', '.###...##...###.',
    '###....##....###', '##.....##.....##', '##..########..##', '##.....##.....##',
    '##.....##.....##', '##..########..##', '##.....##.....##', '###....##....###',
    '.###...##...###.', '..####....####..', '...##########...', '.....######.....']
};
const SHAPENAMES = Object.keys(SHAPES);

function shapeMask(name, N) {
  const rows = SHAPES[name] || SHAPES.Heart, S = rows.length;
  let x0 = S, x1 = -1, y0 = S, y1 = -1;
  for (let y = 0; y < S; y++) for (let x = 0; x < rows[y].length; x++) if (rows[y][x] === '#') {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) { x0 = y0 = 0; x1 = y1 = S - 1; }
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, m = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const sy = y0 + Math.min(bh - 1, Math.floor(y * bh / N));
    const sx = x0 + Math.min(bw - 1, Math.floor(x * bw / N));
    m[y * N + x] = rows[sy][sx] === '#' ? 1 : 0;
  }
  for (let pass = 0; pass < 3; pass++)                      // 清掉孤格（放不下兩格的蛇）
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (!m[y * N + x]) continue;
      let nb = 0;
      if (x > 0 && m[y * N + x - 1]) nb++;
      if (x < N - 1 && m[y * N + x + 1]) nb++;
      if (y > 0 && m[(y - 1) * N + x]) nb++;
      if (y < N - 1 && m[(y + 1) * N + x]) nb++;
      if (!nb) m[y * N + x] = 0;
    }
  return m;
}

/* ---------- 這一關要長什麼樣 ---------- */
/* 新手期 30 關：盤面與箭頭數照公式漸增，第 6 關起每 5 關一個圖形關 */
function onboardPlan(n) {
  const t = (n - 1) / 29;                                   // 0 → 1
  const cells = Math.round(18 + Math.pow(t, 1.45) * 620);   // 18 → ~640 格
  if (n >= 6 && n % 5 === 0) {
    const name = SHAPENAMES[(n / 5 - 1) % SHAPENAMES.length];
    const N = shapeFit(name, cells);
    if (N) return { cols: N, rows: N, shape: name, passes: pickBrushes(n, 2) };
  }
  const W = Math.max(4, Math.min(26, Math.round(Math.sqrt(cells / 1.34))));
  const H = Math.max(5, Math.min(36, Math.round(W * 1.34)));
  return { cols: W, rows: H, shape: null, passes: pickBrushes(n, n < 4 ? 1 : 2) };
}
/* 圖形放大到哪個尺寸才裝得下目標格數 */
function shapeFit(name, cells) {
  for (let k = 12; k <= 56; k++) {
    const m = shapeMask(name, k);
    let c = 0; for (let i = 0; i < m.length; i++) c += m[i];
    if (c >= cells) return k;
  }
  return 0;
}
function pickBrushes(n, howMany) {
  const out = [];
  for (let i = 0; i < howMany; i++) out.push(BRUSHKEYS[(hash32(n, 61 + i * 7) >>> 7) % BRUSHKEYS.length]);
  return out;
}
function levelPlan(n) {
  if (n <= ONBOARD_LEVELS) return onboardPlan(n);
  const b = pickTier(n), [lo, hi] = TIERRANGE[b];
  const cells = Math.round(lo + (hi - lo) * (((hash32(n, 29) >>> 11) % 1000) / 1000));
  const passes = pickBrushes(n, 1 + (hash32(n, 43) >>> 9) % 3);
  if (n % SHAPED_EVERY === 0) {
    const name = SHAPENAMES[(hash32(n, 83) >>> 5) % SHAPENAMES.length];
    const N = shapeFit(name, cells);
    if (N) return { cols: N, rows: N, shape: name, passes };      // 圖形關：正方形、只填一半
  }
  const W = Math.max(8, Math.min(42, Math.round(Math.sqrt(cells / 1.36))));
  const H = Math.min(54, Math.round(W * 1.36));
  return { cols: W, rows: H, shape: null, passes };
}

/* ---------- 可解性驗證（盯梢法） ----------
   每條蛇只記「第一個擋住我的是誰」，那個人走掉才重算。
   盤面大到 40×54（幾百條蛇）時比每步重掃全部快一個數量級。 */
function solvableLv(lv) {
  const cols = lv.cols, rows = lv.rows, k = lv.pieces.length, ix = (x, y) => y * cols + x;
  const own = new Int32Array(cols * rows).fill(-1);
  for (let i = 0; i < k; i++) for (const [x, y] of lv.pieces[i].cells) own[ix(x, y)] = i;
  const blocker = i => {
    const p = lv.pieces[i], [dx, dy] = GDV[p.d];
    let x = p.cells[0][0] + dx, y = p.cells[0][1] + dy;
    while (x >= 0 && y >= 0 && x < cols && y < rows) {
      const o = own[ix(x, y)]; if (o !== -1) return o; x += dx; y += dy;
    }
    return -1;
  };
  const watch = [], ready = [], gone = new Uint8Array(k);
  for (let i = 0; i < k; i++) watch.push([]);
  for (let i = 0; i < k; i++) {
    const b = blocker(i);
    if (b === -1) ready.push(i); else watch[b].push(i);
  }
  let out = 0;
  while (ready.length) {
    const i = ready.pop(); if (gone[i]) continue;
    gone[i] = 1; out++;
    for (const [x, y] of lv.pieces[i].cells) own[ix(x, y)] = -1;
    const w = watch[i]; watch[i] = [];
    for (const j of w) {
      if (gone[j]) continue;
      const b = blocker(j);
      if (b === -1) ready.push(j); else watch[b].push(j);
    }
  }
  return out === k;
}
/* 走一遍解法，量「任何時刻可走幾支」—— 邏輯難度就看這個數字 */
function branchProfile(lv) {
  const cols = lv.cols, rows = lv.rows, k = lv.pieces.length, ix = (x, y) => y * cols + x;
  const own = new Int32Array(cols * rows).fill(-1);
  for (let i = 0; i < k; i++) for (const [x, y] of lv.pieces[i].cells) own[ix(x, y)] = i;
  const blocker = i => {
    const p = lv.pieces[i], [dx, dy] = GDV[p.d];
    let x = p.cells[0][0] + dx, y = p.cells[0][1] + dy;
    while (x >= 0 && y >= 0 && x < cols && y < rows) {
      const o = own[ix(x, y)]; if (o !== -1) return o; x += dx; y += dy;
    }
    return -1;
  };
  const watch = [], gone = new Uint8Array(k), ready = [];
  for (let i = 0; i < k; i++) watch.push([]);
  for (let i = 0; i < k; i++) {
    const b = blocker(i);
    if (b === -1) ready.push(i); else watch[b].push(i);
  }
  let first = 0, sum = 0, st = 0, left = k, mn = 1e9;
  while (ready.length) {
    const av = ready.length;
    if (!st) first = av;
    if (left >= 3) mn = Math.min(mn, av);
    sum += av; st++;
    const i = ready.pop(); gone[i] = 1; left--;
    for (const [x, y] of lv.pieces[i].cells) own[ix(x, y)] = -1;
    const w = watch[i]; watch[i] = [];
    for (const j of w) {
      if (gone[j]) continue;
      const b = blocker(j);
      if (b === -1) ready.push(j); else watch[b].push(j);
    }
  }
  return left === 0 ? { first, min: mn === 1e9 ? first : mn, avg: sum / st } : null;
}

/* ---------- 補洞 ----------
   貪心塞到最後一定會剩幾個洞（新蛇至少兩格，且頭部前方要淨空）。
   對每個空格輪流試三種補法，每補一格就重跑可解性驗證，破壞解法就退回換下一種：
     1. 接在某條蛇的尾端（頭與方向不變）
     2. 接在某條蛇的頭前面 —— 那一格變成新的頭，出場方向跟著轉向
     3. 兩個相鄰空格配成一條新的兩格蛇
   加上第 2 種之後，8×8 的一次成功率從 22% 跳到 99%。 */
function holesOf(lv) {
  const s = new Set();
  for (const p of lv.pieces) for (const [x, y] of p.cells) s.add(x + ',' + y);
  const out = [];
  for (let y = 0; y < lv.rows; y++) for (let x = 0; x < lv.cols; x++)
    if (lv.mask[y * lv.cols + x] && !s.has(x + ',' + y)) out.push([x, y]);
  return out;
}
function stuff(lv, maxLen) {
  let holes = holesOf(lv);
  for (let pass = 0; holes.length && pass < 12; pass++) {
    const left = [], hset = new Set(holes.map(h => h[0] + ',' + h[1]));
    let progress = false;
    for (const [x, y] of holes) {
      if (!hset.has(x + ',' + y)) continue;
      const ops = [];
      for (const p of lv.pieces) {
        if (p.cells.length >= maxLen) continue;
        const t = p.cells[p.cells.length - 1], h = p.cells[0];
        if (Math.abs(t[0] - x) + Math.abs(t[1] - y) === 1) ops.push({ tail: p });
        if (Math.abs(h[0] - x) + Math.abs(h[1] - y) === 1) ops.push({ head: p });
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ax = x + dx, ay = y + dy;
        if (!hset.has(ax + ',' + ay)) continue;
        ops.push({ pair: [[x, y], [ax, ay]] }); ops.push({ pair: [[ax, ay], [x, y]] });
      }
      for (let k = ops.length - 1; k > 0; k--) { const r = RI(k + 1); [ops[k], ops[r]] = [ops[r], ops[k]]; }
      // 盡量別造出「頭貼邊界朝外」的蛇：那種蛇開局一定能走，開局解法數就是被它撐起來的
      const off = (hx, hy, d) => {
        const [dx, dy] = GDV[d], nx = hx + dx, ny = hy + dy;
        return nx < 0 || ny < 0 || nx >= lv.cols || ny >= lv.rows;
      };
      const opens = op => {
        if (op.tail) return false;
        if (op.head) {
          const oh = op.head.cells[0];
          const d = GDIR.find(k => GDV[k][0] === x - oh[0] && GDV[k][1] === y - oh[1]);
          return d ? off(x, y, d) : false;
        }
        const [h, b] = op.pair;
        const d = GDIR.find(k => GDV[k][0] === h[0] - b[0] && GDV[k][1] === h[1] - b[1]);
        return d ? off(h[0], h[1], d) : false;
      };
      const mkStraight = op => {
        if (op.pair) return true;
        const p = op.tail || op.head;
        const cs = op.tail ? p.cells.concat([[x, y]]) : [[x, y]].concat(p.cells);
        return cs.every(c => c[0] === cs[0][0]) || cs.every(c => c[1] === cs[0][1]);
      };
      ops.sort((a, b) => (opens(a) ? 2 : 0) + (mkStraight(a) ? 1 : 0)
        - ((opens(b) ? 2 : 0) + (mkStraight(b) ? 1 : 0)));
      let done = false;
      for (const op of ops) {
        if (op.tail) {
          op.tail.cells.push([x, y]);
          if (solvableLv(lv)) { done = true; break; }
          op.tail.cells.pop();
        } else if (op.head) {
          const p = op.head, old = p.d, oh = p.cells[0];
          p.cells.unshift([x, y]);
          p.d = GDIR.find(k => GDV[k][0] === x - oh[0] && GDV[k][1] === y - oh[1]);
          if (solvableLv(lv)) { done = true; break; }
          p.cells.shift(); p.d = old;
        } else {
          const [h, b] = op.pair;
          const d = GDIR.find(k => GDV[k][0] === h[0] - b[0] && GDV[k][1] === h[1] - b[1]);
          lv.pieces.push({ cells: [h.slice(), b.slice()], d });
          if (solvableLv(lv)) {
            done = true;
            hset.delete(h[0] + ',' + h[1]); hset.delete(b[0] + ',' + b[1]);
            break;
          }
          lv.pieces.pop();
        }
      }
      if (done) { hset.delete(x + ',' + y); progress = true; } else left.push([x, y]);
    }
    holes = left.filter(h => hset.has(h[0] + ',' + h[1]));
    if (!progress) break;
  }
  return holes.length;
}

/* ---------- 產生一關 ---------- */
function genOnce(n) {
  const pl = levelPlan(n), cols = pl.cols, rows = pl.rows, N = cols * rows;
  const mask = pl.shape ? shapeMask(pl.shape, cols) : new Uint8Array(N).fill(1);
  const grid = new Int16Array(N).fill(-1);
  const idx = (x, y) => y * cols + x;
  const inB = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows;
  const pieces = [];
  const ray = (x, y, d) => {
    const [dx, dy] = GDV[d], out = [];
    let cx = x + dx, cy = y + dy;
    while (inB(cx, cy)) { if (grid[idx(cx, cy)] !== -1) return null; out.push(idx(cx, cy)); cx += dx; cy += dy; }
    return out;
  };
  const bc = new Int16Array(N);          // 在此格放東西會新擋住幾條現有的蛇
  const recalc = () => {
    bc.fill(0);
    for (const p of pieces) {
      const [hx, hy] = p.cells[0], [dx, dy] = GDV[p.d];
      let cx = hx + dx, cy = hy + dy;
      while (inB(cx, cy)) { if (grid[idx(cx, cy)] !== -1) break; bc[idx(cx, cy)]++; cx += dx; cy += dy; }
    }
  };
  let playable = 0; for (let i = 0; i < N; i++) playable += mask[i];
  const SAMPLE = N > 420 ? 420 : 0;      // 大盤面窮舉每一格太慢，抽樣，品質幾乎不受影響
  const brushes = (pl.passes || ['P']).map(k => BRUSH[k] || BRUSH.P);
  const capLen = Math.max(4, Math.round((cols + rows) * 0.7));
  const BIAS = 24;                       // 落點偏好「會擋住最多同伴」的程度，越大越難
  let guard = 40000;
  while (guard-- > 0) {
    let filled = 0; for (const p of pieces) filled += p.cells.length;
    const cur = brushes[Math.min(brushes.length - 1, Math.floor(filled / Math.max(1, playable) * brushes.length))];
    const wgt = cur.w, len = [Math.min(cur.len[0], capLen - 1), Math.min(cur.len[1], capLen)];
    recalc();
    const empt = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++)
      if (mask[idx(x, y)] && grid[idx(x, y)] === -1) empt.push([x, y]);
    if (SAMPLE && empt.length > SAMPLE) {
      for (let i = 0; i < SAMPLE; i++) { const j = i + RI(empt.length - i); const t = empt[i]; empt[i] = empt[j]; empt[j] = t; }
      empt.length = SAMPLE;
    }
    const cands = [];
    for (const [x, y] of empt) for (let k = 0; k < 4; k++) {
      const rr = ray(x, y, GDIR[k]);
      if (!rr) continue;
      // 射線上「將來還可能被佔住」的格子只有遮罩內的那些。
      // 頭貼著邊界朝外（射線長度 0）、或圖形關裡頭朝著遮罩外的空白區，
      // 都是「之後永遠擋不住」→ 開局一定能走，這種落點排到最後面，
      // 開局的解法數才壓得下來（但不能完全不用，盤面填滿時總得有人先走）。
      let useful = 0;
      for (const c of rr) if (mask[c]) useful++;
      cands.push({ x, y, d: GDIR[k], rr, sc: useful ? bc[idx(x, y)] + 1 : 0 });
    }
    if (!cands.length) break;
    let maxSc = 0; for (const q of cands) if (q.sc > maxSc) maxSc = q.sc;
    const pos = new Int32Array(maxSc + 1), ordered = new Array(cands.length);
    for (const q of cands) pos[q.sc]++;
    let acc = 0; for (let s = maxSc; s >= 0; s--) { const n0 = pos[s]; pos[s] = acc; acc += n0; }
    for (const q of cands) ordered[pos[q.sc]++] = q;
    let placed = false;
    for (let att = 0; att < 40 && ordered.length && !placed; att++) {
      const pick = Math.floor(Math.pow(rnd(), BIAS) * ordered.length);
      const c = ordered[pick] || ordered[0];
      ordered.splice(ordered.indexOf(c), 1);
      const onRay = new Set(c.rr);
      const cells = [[c.x, c.y]], used = new Set([idx(c.x, c.y)]);
      const target = Math.max(2, len[0] + RI(Math.max(1, len[1] - len[0] + 1)));
      let cur2 = [c.x, c.y], back = GOPP[c.d];
      while (cells.length < target) {
        const opts = [];
        for (const nd of GDIR) {
          if (nd === GOPP[back]) continue;                     // 不能立刻折回上一格
          const nx = cur2[0] + GDV[nd][0], ny = cur2[1] + GDV[nd][1], id2 = idx(nx, ny);
          if (!inB(nx, ny) || !mask[id2] || grid[id2] !== -1 || used.has(id2) || onRay.has(id2)) continue;
          opts.push([nd, nx, ny, id2]);
        }
        if (!opts.length) break;
        let pickOpt;
        if (cells.length === 1) {
          pickOpt = opts.find(o => o[0] === back);             // 第一節必在頭的正後方
          if (!pickOpt) break;
        } else {
          const ri = GDIR[(GDIR.indexOf(back) + 1) % 4], le = GDIR[(GDIR.indexOf(back) + 3) % 4];
          const bag = [[ri, wgt[0]], [back, wgt[1]], [le, wgt[2]]].filter(b => opts.some(o => o[0] === b[0]));
          const tot = bag.reduce((a, b) => a + b[1], 0);
          let r2 = rnd() * tot, want2 = null;
          for (const b of bag) { r2 -= b[1]; if (r2 <= 0) { want2 = b[0]; break; } }
          pickOpt = opts.find(o => o[0] === want2) || opts[RI(opts.length)];
        }
        cells.push([pickOpt[1], pickOpt[2]]); used.add(pickOpt[3]);
        cur2 = [pickOpt[1], pickOpt[2]]; back = pickOpt[0];
      }
      if (cells.length < 2) continue;                          // 長度 1 的箭頭一律丟掉
      const id = pieces.length;
      for (const [cx, cy] of cells) grid[idx(cx, cy)] = id;
      pieces.push({ cells, d: c.d });
      placed = true;
    }
    if (!placed) break;
  }
  return { cols, rows, mask, pieces, level: n };
}

/* 候選裡挑「平均可走箭頭數最接近 FLAT」的那個 —— 邏輯難度要壓成一條平線：
   箭頭數放大幾十倍，任一時刻可走的仍然只有兩三支，難度來自視覺搜尋而不是推理深度。 */
const FLAT = 2.8;          // 任一時刻可走的箭頭數要壓在這附近
const OPENCAP = 8;         // 開局可走的箭頭數超過這個就開始扣分
function generate(n, tries) {
  seedRnd(hash32(n, 0x9E3779B1));
  let best = null;
  for (let t = 0; t < (tries || 8); t++) {
    const lv = genOnce(n);
    const holes = stuff(lv, 12);
    if (!solvableLv(lv)) continue;
    const b = branchProfile(lv);
    if (!b) continue;
    const sc = holes * 1.5                        // 洞沒補滿最傷（會拖過一片空地）
      + Math.abs(b.avg - FLAT)                    // 邏輯難度要平
      + Math.max(0, b.first - OPENCAP) * 0.12;    // 開局選擇太多就不用找了
    if (!best || sc < best.sc) best = { lv, sc, b };
    if (sc < 0.35) break;
  }
  const lv = best ? best.lv : genOnce(n);
  const cells = lv.pieces.reduce((a, p) => a + p.cells.length, 0);
  return {
    cols: lv.cols, rows: lv.rows, cells,
    pieces: lv.pieces.map(p => ({ cells: p.cells, d: p.d })),
    shaped: !!levelPlan(n).shape
  };
}
