/* ==========================================================================
   烘焙關卡包：把第 1～N 關生成好、壓成 gzip+base64 塞進單一 HTML。
     node tools/bake.js [關數=300] [每關候選數=14]
   輸出：src/pack.b64（順便印出逐關統計與整體品質）
   第 N+1 關之後由遊戲在執行時即時生成（同一套決定性生成器，同一個種子）。
   ========================================================================== */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const COUNT = +(process.argv[2] || 300);
const TRIES = +(process.argv[3] || 14);

/* ---- 載入 core + gen（無 DOM 依賴） ---- */
const core = fs.readFileSync(path.join(ROOT, 'src/1-core.js'), 'utf8').replace(/^'use strict';/, '');
const gen = fs.readFileSync(path.join(ROOT, 'src/2-gen.js'), 'utf8');
const ctx = { console, setTimeout, clearTimeout, Math, localStorage: null, document: {}, navigator: {}, window: {} };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(core + '\n' + gen +
  '\n;globalThis.__api={generate,tierOf,pickTier,branchProfile,levelPlan};', ctx);
const A = ctx.__api;

/* ---- 編碼（與遊戲裡的解碼器成對）----
   hdr: 逐關 varint W,H,箭頭數        xs/ys: 頭部座標 1 byte
   ed : 出場方向 1 byte               ln: 蛇身步數 varint
   af : 第一步的絕對方向 1 byte       tn: 其餘每步的「轉向」2 bits
   同一個欄位放在一起 gzip 才看得到規律；轉向而不是絕對方向，因為多數步是直行。 */
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const DKEY = { 'right': 0, 'down': 1, 'left': 2, 'up': 3 };   // 畫面座標：y 往下
const DI = {}; DIRS.forEach(([x, y], i) => DI[x + ',' + y] = i);

function varint(n, out) { for (; ;) { const b = n & 0x7f; n >>= 7; out.push(b | (n ? 0x80 : 0)); if (!n) return; } }
class BW {
  constructor() { this.b = []; this.acc = 0; this.n = 0; }
  put(v, bits) {
    this.acc = (this.acc << bits) | v; this.n += bits;
    while (this.n >= 8) { this.n -= 8; this.b.push((this.acc >> this.n) & 0xff); }
    this.acc &= (1 << this.n) - 1;
  }
  done() { if (this.n) this.b.push((this.acc << (8 - this.n)) & 0xff); return Buffer.from(this.b); }
}

const hdr = [], xs = [], ys = [], ed = [], ln = [], af = [], tn = new BW();
const cells = [], shp = [];
let nArrows = 0, nTurn = 0;
const stat = { tierHit: 0, avg: 0, first: 0, worstMs: 0, tiers: [0, 0, 0, 0] };
const t00 = Date.now();

for (let n = 1; n <= COUNT; n++) {
  const t0 = Date.now();
  const lv = A.generate(n, TRIES);
  const ms = Date.now() - t0;
  stat.worstMs = Math.max(stat.worstMs, ms);
  varint(lv.cols, hdr); varint(lv.rows, hdr); varint(lv.pieces.length, hdr);
  for (const p of lv.pieces) {
    nArrows++;
    xs.push(p.cells[0][0]); ys.push(p.cells[0][1]); ed.push(DKEY[p.d]);
    const steps = [];
    for (let i = 1; i < p.cells.length; i++)
      steps.push(DI[(p.cells[i][0] - p.cells[i - 1][0]) + ',' + (p.cells[i][1] - p.cells[i - 1][1])]);
    varint(steps.length, ln);
    if (steps.length) {
      af.push(steps[0]);
      let prev = steps[0];
      for (let i = 1; i < steps.length; i++) { tn.put((steps[i] - prev + 4) % 4, 2); nTurn++; prev = steps[i]; }
    }
  }
  cells.push(lv.cells);
  shp.push(lv.shaped ? '1' : '0');
  const tier = A.tierOf(lv.cells);
  stat.tiers[tier]++;
  if (n > 30 && tier === A.pickTier(n)) stat.tierHit++;
  const b = A.branchProfile({ cols: lv.cols, rows: lv.rows, pieces: lv.pieces });
  stat.avg += b ? b.avg : 0; stat.first += b ? b.first : 0;
  if (n % 25 === 0 || n === COUNT)
    console.log(`  L${String(n).padStart(3)}  ${lv.cols}x${lv.rows}  ${String(lv.pieces.length).padStart(3)} arrows  `
      + `${String(lv.cells).padStart(4)} cells  tier ${tier}${lv.shaped ? ' ◆' : '  '}  `
      + `avgFree ${(b ? b.avg : 0).toFixed(2)}  first ${b ? b.first : 0}  ${ms}ms`);
}

const tnb = tn.done();
const header = {
  v: 1, n: COUNT, nArrows,
  lens: { hdr: hdr.length, xs: xs.length, ys: ys.length, ed: ed.length, ln: ln.length, af: af.length, tnBits: nTurn, tn: tnb.length },
  cells, shp: shp.join('')
};
const hj = Buffer.from(JSON.stringify(header));
const len = Buffer.alloc(4); len.writeUInt32LE(hj.length, 0);
const blob = Buffer.concat([len, hj, Buffer.from(hdr), Buffer.from(xs), Buffer.from(ys),
  Buffer.from(ed), Buffer.from(ln), Buffer.from(af), tnb]);
const gz = zlib.gzipSync(blob, { level: 9 });
const b64 = gz.toString('base64');
fs.writeFileSync(path.join(ROOT, 'src/pack.b64'), b64);

console.log('\n' + '-'.repeat(64));
console.log(`關數 ${COUNT}　箭頭 ${nArrows}　轉向符號 ${nTurn}`);
console.log(`分段比例 ${stat.tiers.map(c => (c / COUNT * 100).toFixed(0)).join(' / ')} %`);
console.log(`第 31 關後命中目標分段 ${stat.tierHit}/${Math.max(0, COUNT - 30)}`);
console.log(`平均可走 ${(stat.avg / COUNT).toFixed(2)}　平均開局可走 ${(stat.first / COUNT).toFixed(1)}`);
console.log(`blob ${(blob.length / 1e6).toFixed(2)} MB → gz ${(gz.length / 1e3).toFixed(0)} kB → b64 ${(b64.length / 1e3).toFixed(0)} kB`);
console.log(`最慢單關 ${stat.worstMs} ms　總耗時 ${((Date.now() - t00) / 1000).toFixed(0)} s`);
