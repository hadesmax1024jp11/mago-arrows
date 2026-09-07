/* ==========================================================================
   1 / 4　核心：常數、難度模型、字表、存檔
   ========================================================================== */
'use strict';

/* ---------- 解鎖與規則常數 ---------- */
const K = {
  MaxLives: 3,          // 撞牆三次重來（可免費補滿一次）
  MaxHints: 9,
  TutorialLevels: 6,    // 前 6 關馬哥會逐條講規則
  AwardsUnlock: 6,
  DailyUnlock: 12,
  LeaguesPreview: 15,
  LeaguesUnlock: 20
};

/* ---------- 難度模型 ----------
   難度只有一個變數：**盤面上所有箭頭佔用的格數總和**。
   三個門檻切成四段。盤面多大、幾支箭頭、彎幾次、解幾步一律不參與判定。
   好處是「調難度」＝調三個數字，不用重做關卡；代價是難度只能是「規模」。 */
const TIERCUT = [700, 1300, 1850];
const TIERRANGE = [[190, 699], [700, 1299], [1300, 1849], [1850, 2200]];
const TIERVAR = ['--t0', '--t1', '--t2', '--t3'];
const TIERNAME = {
  zh: ['悠閒', '認真', '硬派', '無情'],
  en: ['Gentle', 'Tricky', 'Brutal', 'Merciless']
};
const ONBOARD_LEVELS = 30;      // 手排新手期
const SHAPED_EVERY = 5;         // 每 5 關一個圖形關（減壓閥：分段不變，視覺密度砍半）

/* 30 關一循環的節奏模板：每格是「這一關允許的難度區間」。
   設計意圖是**穩態曲線 + 里程碑尖峰**，不是單調遞增 ——
   玩家永遠感覺難度有起伏，實際負載是平的；最硬的一段只放在 10 的倍數關。 */
const PATTERN30 = [
  [0, 0], [0, 0], [0, 1], [1, 2], [0, 1], [0, 0], [0, 0], [0, 1], [0, 1], [1, 2],
  [0, 0], [0, 0], [0, 1], [0, 2], [0, 0], [0, 0], [0, 1], [0, 0], [0, 1], [2, 3],
  [0, 0], [0, 1], [0, 0], [0, 1], [1, 1], [0, 0], [0, 1], [0, 0], [0, 1], [2, 3]
];

function hash32(n, salt) {
  let h = Math.imul(n ^ (salt || 0), 2654435761) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13;
  return h >>> 0;
}
function tierOf(cellCount) {
  let i = 0;
  while (i < 3 && cellCount >= TIERCUT[i]) i++;
  return i;
}
function pickTier(n) {
  const [lo, hi] = PATTERN30[(n - 1) % 30];
  let b = lo + (hash32(n, 17) >>> 13) % (hi - lo + 1);
  if (b === 3 && n % 10 !== 0) b = 2;      // 最硬的一段只出現在 10 的倍數關
  return b;
}

/* ---------- 字表 ---------- */
const PRAISE = {
  zh: ['漂亮！', '就是這樣！', '好眼力！', '一氣呵成！', '穩！', '太順了！', '收得漂亮！', '看破了！'],
  en: ['Clean!', 'Sharp eye!', 'Nailed it!', 'Smooth!', 'Locked in!', 'Nice read!', 'Beautiful!', 'Flawless!']
};
const MONTHS = {
  zh: ['1 月', '2 月', '3 月', '4 月', '5 月', '6 月', '7 月', '8 月', '9 月', '10 月', '11 月', '12 月'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
    'September', 'October', 'November', 'December']
};
const STR = {
  zh: {
    title: '馬哥箭頭逃脫', play: '開始遊戲', cont: '繼續', level: '關卡', levelN: '第 %n 關',
    levels: '關卡', challenge: '每日一關', awards: '成就', leagues: '週榜', settings: '設定',
    howto: '怎麼玩', home: '回主畫面', close: '關閉', restart: '重來', restartQ: '要重來嗎？',
    restartBody: '所有箭頭回到起點，愛心補滿，重新想一次順序。',
    complete: '過關！', outLives: '愛心用完了', playOn: '補滿愛心繼續',
    refill: '這一關的箭頭留在原地，愛心幫你補滿。', cleared: '清掉箭頭', attempts: '出手次數',
    time: '用時', firstTry: '零失誤', hintTitle: '提示', hintBody: '亮出一支現在走得掉的箭頭',
    hintNone: '提示用完了 — 過關會拿回一個', gridTip: '格線開／關',
    tapMove: '點一下，它就往箭尖的方向衝出去', swipe: '按住空白處拖曳可以移動盤面',
    pinch: '雙指縮放（桌機用滑鼠滾輪）',
    lockedD: '第 %n 關解鎖每日一關', lockedA: '第 %n 關解鎖成就', lockedL: '第 %n 關解鎖週榜',
    lockedLP: '第 %n 關正式計分', locked: '未解鎖', newLevelIn: '下一關 %h 小時 %m 分 %s 秒後開放',
    done: '已完成', todayD: '今天的關卡', topN: '第 %n 名', week: '本週', score: '分數',
    combo: '連擊', arrows: '箭頭', sounds: '音效', vibr: '震動', themes: '主題', lang: '語言',
    guideS: '輔助線', guideD: '按住箭頭時顯示行進路線', safeS: '誤觸保護',
    safeD: '先點選、再點一次才移動', mascotS: '馬哥加油', mascotD: '讓馬哥在棋盤旁邊探頭喊話',
    autoS: '自動收尾', autoD: '只剩三支時自動放它們出去', reset: '清除進度',
    resetQ: '確定要清除全部進度？', yes: '確定', no: '取消', loading: '生成關卡中…',
    shapedTag: '圖形關', mapFoot: '往下滑看更多關卡', promo: '晉級區', hold: '保留區',
    fitWhole: '整盤檢視', zoom1x: '原大小 1×', zoomIn: '放大 1.8×', zoomOut: '回到原大小',
    gridOn: '格線：開', gridOff: '格線：關',
    genfail: '這一關生成失敗了，換一關試試'
  },
  en: {
    title: 'Mago Arrows', play: 'Play', cont: 'Continue', level: 'Level', levelN: 'Level {0}',
    levels: 'Levels', challenge: 'Daily', awards: 'Awards', leagues: 'Weekly', settings: 'Settings',
    howto: 'How to play', home: 'Home', close: 'Close', restart: 'Restart', restartQ: 'Restart?',
    restartBody: 'Every arrow goes back to its starting cell and your hearts are refilled.',
    complete: 'Cleared!', outLives: 'Out of hearts', playOn: 'Refill and continue',
    refill: 'The board stays exactly where it is — your hearts come back full.',
    cleared: 'Arrows cleared', attempts: 'Taps', time: 'Time', firstTry: 'No misses',
    hintTitle: 'Hint', hintBody: 'Lights up one arrow that can leave right now',
    hintNone: 'No hints left — clear a level to earn one', gridTip: 'Grid on / off',
    tapMove: 'Tap an arrow and it shoots out the way its head points',
    swipe: 'Drag any empty spot to move the board', pinch: 'Pinch to zoom (mouse wheel on desktop)',
    lockedD: 'Reach level {0} to unlock the daily level', lockedA: 'Reach level {0} to unlock awards',
    lockedL: 'Reach level {0} to unlock the weekly board',
    lockedLP: 'Scoring starts at level {0}', locked: 'Locked',
    newLevelIn: 'Next level in {0}h {1}m {2}s', done: 'Done', todayD: "Today's level",
    topN: 'Rank {0}', week: 'This week', score: 'Score', combo: 'Combo', arrows: 'Arrows',
    sounds: 'Sound', soundsD: "On iPhone the side mute switch silences web audio",
    vibr: 'Vibration', themes: 'Theme', lang: 'Language',
    guideS: 'Path guide', guideD: 'Show the exit path while holding an arrow',
    safeS: 'Tap protection', safeD: 'Select first, tap again to move',
    mascotS: 'Mago cheers', mascotD: 'Let Mago pop up beside the board',
    autoS: 'Auto finish', autoD: 'Clear the last three arrows automatically',
    reset: 'Reset progress', resetQ: 'Delete all progress?', yes: 'Yes', no: 'Cancel',
    loading: 'Building level…', shapedTag: 'Shaped', mapFoot: 'Scroll for more levels',
    promo: 'PROMOTION', hold: 'HOLD', genfail: 'That level failed to build — try another',
    fitWhole: 'Whole board', zoom1x: 'Actual size 1×', zoomIn: 'Zoomed to 1.8×',
    zoomOut: 'Back to actual size', gridOn: 'Grid on', gridOff: 'Grid off'
  }
};
let L = STR.zh;
const T = (k, ...a) => {
  let s = (L[k] != null ? L[k] : (STR.en[k] || k)) + '';
  a.forEach((v, i) => { s = s.split('{' + i + '}').join(v); });
  return s.split('%n').join(a[0]).split('%h').join(a[0]).split('%m').join(a[1]).split('%s').join(a[2]);
};
const tierName = i => (TIERNAME[typeof S !== 'undefined' ? S.lang : 'zh'] || TIERNAME.zh)[i];

/* ---------- 存檔 ---------- */
const DEF = {
  cur: 1, maxLv: 1, score: 0, bestCombo: 0, arrowsCleared: 0, misses: 0, clean: 0,
  hints: 3, stars: {}, daily: {}, byTier: [0, 0, 0, 0], weekScore: 0, weekTag: '', playSec: 0,
  sfx: true, vibr: true, theme: 'paper', lang: 'zh', guide: false, safe: false,
  mascot: true, autoFin: false, grid: false, tips: {}
};
let S = Object.assign({}, DEF);
try { const r = localStorage.getItem('magoArrows'); if (r) S = Object.assign(S, JSON.parse(r)); } catch (e) { }
let saveT = null;
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(() => { try { localStorage.setItem('magoArrows', JSON.stringify(S)); } catch (e) { } }, 120);
}

/* ---------- 小工具 ---------- */
const $ = id => document.getElementById(id);
const R = n => Math.floor(Math.random() * n);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmtTime = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
const nfmt = n => n.toLocaleString('en-US');
const dstamp = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
  + '-' + String(d.getDate()).padStart(2, '0');
const HEART = gone => `<svg class="heart${gone ? ' gone' : ''}" viewBox="0 0 24 24"><path fill="${gone ? 'var(--ink3)' : '#E0604A'}" d="M12 21s-8-5.1-8-11a4.6 4.6 0 018-3 4.6 4.6 0 018 3c0 5.9-8 11-8 11z"/></svg>`;
const STAR = on => `<svg class="${on ? '' : 'off'}" viewBox="0 0 24 24"><path fill="${on ? '#E0A82E' : '#9A9384'}" d="M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.5l-5.9 3.1L7.3 14 2.5 9.5l6.6-.9z"/></svg>`;

/* 每日一關：日期 → 種子（同一天全世界同一關），難度固定在硬派帶 */
function dailySeed(stamp) {
  const p = stamp.split('-').map(Number);
  return 900000 + (hash32(p[0] * 10000 + p[1] * 100 + p[2], 0xDA11) % 90000);
}
/* ---------- 音效 ----------
   手機瀏覽器（尤其 iOS）建立的 AudioContext 一開始是 suspended，
   必須在**使用者手勢裡**呼叫 resume()，而且 iOS 還要先播一個無聲 buffer 才算解鎖。
   所以除了每次取用時 resume，另外掛一次性的 touch/click 監聽當保險。 */
let ac = null, acReady = false;
function actx() {
  if (!ac) {
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { }
  }
  if (ac && ac.state === 'suspended') { try { ac.resume(); } catch (e) { } }
  return ac;
}
function unlockAudio() {
  if (acReady) return;
  const c = actx();
  if (!c) return;
  try {
    const b = c.createBuffer(1, 1, 22050), src = c.createBufferSource();
    src.buffer = b; src.connect(c.destination); src.start(0);
    acReady = true;
  } catch (e) { }
}
// 這支檔案也會被 tools/bake.js 與測試在沒有 DOM 的環境裡載入，所以要防一下
if (typeof addEventListener === 'function')
  ['pointerdown', 'touchend', 'click', 'keydown'].forEach(ev =>
    addEventListener(ev, unlockAudio, { passive: true }));
function tone(f, d, type, vol, slide) {
  if (!S.sfx) return; const c = actx(); if (!c) return;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type || 'sine'; o.frequency.setValueAtTime(f, c.currentTime);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, slide), c.currentTime + d);
  g.gain.setValueAtTime(0, c.currentTime);
  g.gain.linearRampToValueAtTime(vol || .14, c.currentTime + .012);
  g.gain.exponentialRampToValueAtTime(.0008, c.currentTime + d);
  o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + d + .02);
}
function noise(d, vol) {
  if (!S.sfx) return; const c = actx(); if (!c) return;
  const n = c.sampleRate * d, b = c.createBuffer(1, n, c.sampleRate), ch = b.getChannelData(0);
  for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.4);
  const s = c.createBufferSource(); s.buffer = b;
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 720;
  const g = c.createGain(); g.gain.value = vol || .2;
  s.connect(f).connect(g).connect(c.destination); s.start();
}
const SFX = {
  pop(k) { tone(520 + Math.min(k, 9) * 46, .16, 'triangle', .12, 940 + Math.min(k, 9) * 60); },
  bump() { noise(.15, .26); tone(120, .19, 'sawtooth', .11, 56); },
  win() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, .32, 'triangle', .12), i * 92)); },
  lose() { [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, .3, 'sine', .12), i * 128)); },
  tap() { tone(760, .045, 'square', .045); },
  ding() { [880, 1175].forEach((f, i) => setTimeout(() => tone(f, .18, 'triangle', .11), i * 80)); }
};
const buzz = ms => { if (S.vibr && navigator.vibrate) try { navigator.vibrate(ms); } catch (e) { } };

const praiseWord = () => { const a = PRAISE[S.lang] || PRAISE.zh; return a[R(a.length)]; };

/* ==========================================================================
   烘焙關卡包的解碼器（與 tools/bake.js 的編碼器成對）
   前 P.n 關是建置時生成好的，開機解一次；之後的關卡由 2-gen.js 即時生成。
   ========================================================================== */
const PDIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];          // 畫面座標：y 往下
const PDNAME = ['right', 'down', 'left', 'up'];
let P = null;

function b64bytes(s) {
  const bin = atob(s), n = bin.length, out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function gunzip(u8) {
  if (typeof DecompressionStream !== 'function') throw new Error('DecompressionStream unavailable');
  const st = new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(st).arrayBuffer());
}
function varReader(buf) {
  let p = 0;
  return () => {
    let x = 0, sh = 0, b;
    do { b = buf[p++]; x |= (b & 0x7f) << sh; sh += 7; } while (b & 0x80);
    return x;
  };
}
async function loadPack() {
  const bytes = await gunzip(b64bytes(PACK_B64));
  const hlen = bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24);
  const H = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + hlen)));
  let o = 4 + hlen;
  const take = k => bytes.subarray(o, o += k);
  const hdr = take(H.lens.hdr), xs = take(H.lens.xs), ys = take(H.lens.ys),
    ed = take(H.lens.ed), lnB = take(H.lens.ln), af = take(H.lens.af), tn = take(H.lens.tn);
  const n = H.n, W = new Uint8Array(n), Hh = new Uint8Array(n),
    NA = new Uint16Array(n), A0 = new Uint32Array(n + 1);
  const rd = varReader(hdr);
  for (let i = 0; i < n; i++) { W[i] = rd(); Hh[i] = rd(); NA[i] = rd(); A0[i + 1] = A0[i] + NA[i]; }
  const na = A0[n], steps = new Uint8Array(na), tbit = new Uint32Array(na + 1), aidx = new Uint32Array(na + 1);
  const rl = varReader(lnB);
  for (let k = 0; k < na; k++) {
    const st = rl();
    steps[k] = st;
    tbit[k + 1] = tbit[k] + (st > 1 ? (st - 1) * 2 : 0);
    aidx[k + 1] = aidx[k] + (st > 0 ? 1 : 0);
  }
  P = { n, cells: H.cells, shp: H.shp, xs, ys, ed, af, tn, steps, tbit, aidx, W, Hh, NA, A0, na };
  return P;
}
const bit2 = (buf, at) => (buf[at >> 3] >> (6 - (at & 7))) & 3;

function decodeLevel(idx) {
  const a0 = P.A0[idx], na = P.NA[idx], out = [];
  for (let k = a0; k < a0 + na; k++) {
    const st = P.steps[k];
    let x = P.xs[k], y = P.ys[k];
    const cells = [[x, y]];
    if (st > 0) {
      let d = P.af[P.aidx[k]];
      x += PDIRS[d][0]; y += PDIRS[d][1]; cells.push([x, y]);
      let at = P.tbit[k];
      for (let i = 1; i < st; i++) {
        d = (d + bit2(P.tn, at)) & 3; at += 2;
        x += PDIRS[d][0]; y += PDIRS[d][1]; cells.push([x, y]);
      }
    }
    out.push({ cells, d: PDNAME[P.ed[k]] });
  }
  return {
    cols: P.W[idx], rows: P.Hh[idx], cells: P.cells[idx],
    pieces: out, shaped: P.shp.charCodeAt(idx) === 49
  };
}
