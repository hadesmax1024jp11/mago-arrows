/* ==========================================================================
   驗證 index.html
     node tools/test.js          全部
     node tools/test.js data     只跑資料層（生成器 / 關卡包 / 難度模型）
     node tools/test.js dom      只跑 DOM 與玩法
   需要：npm install jsdom
   ========================================================================== */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const { DecompressionStream } = require('node:stream/web');

const ROOT = path.resolve(__dirname, '..');
const which = (process.argv[2] || 'all').toLowerCase();
let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log('   ok   ' + m + (extra ? '  ' + extra : '')); }
  else { fail++; console.log('   FAIL ' + m + (extra ? '  ' + extra : '')); }
};
const head = t => console.log('\n=== ' + t + ' ' + '='.repeat(Math.max(0, 60 - t.length)));

/* ---------------------------------------------------------------- 資料層 */
function dataCtx() {
  const core = fs.readFileSync(path.join(ROOT, 'src/1-core.js'), 'utf8').replace(/^'use strict';/, '');
  const gen = fs.readFileSync(path.join(ROOT, 'src/2-gen.js'), 'utf8');
  const pack = fs.readFileSync(path.join(ROOT, 'src/pack.b64'), 'utf8').trim();
  const ctx = {
    console, setTimeout, clearTimeout, Math, PACK_B64: pack,
    DecompressionStream, Blob, Response, TextDecoder,
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    localStorage: null, document: {}, navigator: {}, window: {}
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(core + '\n' + gen + `\n;globalThis.__api={
    generate,tierOf,pickTier,levelPlan,solvableLv,branchProfile,loadPack,decodeLevel,
    dailySeed,hash32,PATTERN30,TIERCUT,TIERRANGE,ONBOARD_LEVELS,SHAPED_EVERY,
    get P(){return P}};`, ctx);
  return ctx.__api;
}

async function testData() {
  const A = dataCtx();

  head('生成器：決定性、可解性、鋪滿');
  const a1 = A.generate(137), a2 = A.generate(137);
  ok(JSON.stringify(a1) === JSON.stringify(a2), '同一關生兩次結果完全相同（決定性）');
  const b1 = A.generate(138);
  ok(JSON.stringify(a1) !== JSON.stringify(b1), '不同關卡不會生出同一盤');

  let unsolv = [], badCell = [], dup = [], gap = [], firstZero = 0, avgSum = 0, n = 0;
  const probe = [];
  for (let i = 1; i <= 60; i++) probe.push(i);
  for (let i = 65; i <= 400; i += 5) probe.push(i);
  for (let i = 450; i <= 2000; i += 50) probe.push(i);
  for (const lvn of probe) {
    const lv = A.generate(lvn, 4);
    n++;
    const seen = new Set();
    for (const p of lv.pieces) {
      let prev = null;
      for (const [x, y] of p.cells) {
        const k = x + ',' + y;
        if (seen.has(k)) dup.push(lvn);
        seen.add(k);
        if (x < 0 || y < 0 || x >= lv.cols || y >= lv.rows) badCell.push(lvn);
        if (prev && Math.abs(prev[0] - x) + Math.abs(prev[1] - y) !== 1) gap.push(lvn);
        prev = [x, y];
      }
      if (p.cells.length < 2) badCell.push(lvn);
    }
    if (!A.solvableLv({ cols: lv.cols, rows: lv.rows, pieces: lv.pieces })) unsolv.push(lvn);
    const bp = A.branchProfile({ cols: lv.cols, rows: lv.rows, pieces: lv.pieces });
    if (!bp || bp.first === 0) firstZero++;
    avgSum += bp ? bp.avg : 0;
  }
  ok(unsolv.length === 0, `${n} 關全部可解（貪心走得完）`, unsolv.slice(0, 5).join(','));
  ok(dup.length === 0, '沒有兩支箭頭共用同一格', [...new Set(dup)].slice(0, 5).join(','));
  ok(badCell.length === 0, '沒有出界的格子、也沒有長度 1 的箭頭', [...new Set(badCell)].slice(0, 5).join(','));
  ok(gap.length === 0, '蛇身每一格都與前一格相鄰', [...new Set(gap)].slice(0, 5).join(','));
  ok(firstZero === 0, '沒有一關開局就走不動');
  const avg = avgSum / n;
  ok(avg > 2 && avg < 7, `平均可走箭頭 ${avg.toFixed(2)}（目標帶 2.8，圖形關會偏高）`);

  head('難度模型');
  ok(A.TIERCUT.length === 3 && A.TIERCUT[0] < A.TIERCUT[1] && A.TIERCUT[1] < A.TIERCUT[2],
    `三個門檻遞增 ${A.TIERCUT.join(' / ')}`);
  let rangeBad = 0;
  for (let i = 0; i < 4; i++) {
    const [lo, hi] = A.TIERRANGE[i];
    if (A.tierOf(lo) !== i || A.tierOf(hi) !== i) rangeBad++;
  }
  ok(rangeBad === 0, '四段的上下界都落在自己那一段');
  ok(A.PATTERN30.length === 30, '節奏模板 30 格');
  let nmNot10 = 0, shapedMiss = 0, cnt = [0, 0, 0, 0];
  for (let lvn = 31; lvn <= 3030; lvn++) {
    const t = A.pickTier(lvn);
    cnt[t]++;
    if (t === 3 && lvn % 10 !== 0) nmNot10++;
    if (lvn % A.SHAPED_EVERY === 0 && lvn % 5 !== 0) shapedMiss++;
  }
  const tot = cnt.reduce((a, b) => a + b, 0);
  ok(nmNot10 === 0, '最硬的一段只出現在 10 的倍數關');
  ok(cnt[0] / tot > 0.55 && cnt[0] / tot < 0.75,
    `第 31 關之後的分段比例 ${cnt.map(c => (c / tot * 100).toFixed(0)).join(' / ')} %`);
  ok(A.ONBOARD_LEVELS === 30 && A.SHAPED_EVERY === 5, '新手期 30 關、每 5 關一個圖形關');

  head('關卡包：解碼結果要跟生成器一模一樣');
  await A.loadPack();
  const P = A.P;
  ok(P && P.n >= 100, `包內烘焙了 ${P ? P.n : 0} 關`);
  let mismatch = [], arrows = 0;
  for (let i = 0; i < P.n; i++) {
    const dec = A.decodeLevel(i), gen = A.generate(i + 1, 14);
    arrows += dec.pieces.length;
    if (dec.cols !== gen.cols || dec.rows !== gen.rows || dec.cells !== gen.cells
      || dec.pieces.length !== gen.pieces.length || dec.shaped !== gen.shaped) {
      mismatch.push(i + 1); continue;
    }
    for (let k = 0; k < dec.pieces.length; k++) {
      if (dec.pieces[k].d !== gen.pieces[k].d
        || JSON.stringify(dec.pieces[k].cells) !== JSON.stringify(gen.pieces[k].cells)) {
        mismatch.push(i + 1); break;
      }
    }
  }
  ok(mismatch.length === 0, `${P.n} 關 / ${arrows.toLocaleString()} 支箭頭逐格對得上生成器的輸出`,
    mismatch.slice(0, 5).join(','));
  let packUnsolv = [];
  for (let i = 0; i < P.n; i++) {
    const lv = A.decodeLevel(i);
    if (!A.solvableLv({ cols: lv.cols, rows: lv.rows, pieces: lv.pieces })) packUnsolv.push(i + 1);
  }
  ok(packUnsolv.length === 0, '包裡每一關都可解', packUnsolv.slice(0, 5).join(','));

  head('每日一關');
  const s1 = A.dailySeed('2026-09-07'), s2 = A.dailySeed('2026-09-07');
  ok(s1 === s2 && s1 !== A.dailySeed('2026-09-08'), '同一天同一關、不同天不同關');
  let dailyBad = [];
  for (let d = 1; d <= 20; d++) {
    const st = '2026-09-' + String(d).padStart(2, '0');
    const lv = A.generate(A.dailySeed(st), 4);
    if (!A.solvableLv({ cols: lv.cols, rows: lv.rows, pieces: lv.pieces })) dailyBad.push(st);
  }
  ok(dailyBad.length === 0, '20 天的每日關都可解', dailyBad.join(','));
}

/* ------------------------------------------------------------------- DOM */
const { boot, tap, wait } = require('./test-boot.js');

async function testDom() {
  head('開機與首頁');
  const { win, $ } = await boot(1200, 900);
  const A = win.__MAGO;
  ok(!!A.P && A.P.n >= 100, `關卡包在瀏覽器環境解開（${A.P ? A.P.n : 0} 關）`);
  ok($('splash').classList.contains('off'), '載入畫面關掉了');
  ok($('home').classList.contains('on'), '停在首頁');
  ok($('heroImg').src.startsWith('data:image/webp'), '馬哥主視覺內嵌成功');
  ok($('tDailyS').textContent.includes(String(A.K.DailyUnlock)), '每日一關在解鎖前是鎖住的');
  ok($('tAwardS').textContent.includes(String(A.K.AwardsUnlock)), '成就在解鎖前是鎖住的');
  ok($('tLeagueS').textContent.includes(String(A.K.LeaguesPreview)), '週榜在解鎖前是鎖住的');

  head('進遊戲、渲染、真實點擊');
  $('btnPlay').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await wait(80);
  ok($('game').classList.contains('on'), '切到遊戲畫面');
  let G = A.G;
  ok(G && G.level === 1, '第 1 關');
  ok(G.total >= 2 && G.cols >= 4 && G.rows >= 5, '第 1 關是小盤面、幾支箭頭', `${G.cols}x${G.rows}/${G.total}`);
  const svg = $('pieces');
  ok(svg.querySelectorAll('g.pc').length === G.total, '每支箭頭都畫出來了');
  ok([...svg.querySelectorAll('g.pc')].every(g =>
    g.querySelector('.ln').getAttribute('d') && g.querySelector('.hd').getAttribute('transform')),
    '線條與箭頭尖端都有幾何');
  let dirBad = 0;
  for (const o of G.items) {
    const m = o.hd.getAttribute('transform').match(/rotate\(([-\d.]+)\)/);
    const ang = ((+m[1]) % 360 + 360) % 360;
    const want = { right: 0, down: 90, left: 180, up: 270 }[o.d];
    let diff = Math.abs(ang - want); if (diff > 180) diff = 360 - diff;
    if (diff > 6) dirBad++;
  }
  ok(dirBad === 0, '箭頭尖端朝向與出場方向一致');
  const movable = A.anyMove();
  ok(movable.length > 0, '開局有可走的箭頭', String(movable.length));
  const before = G.items.length;
  tap(win, movable[0]);
  await wait(700);
  ok(A.G.items.length === before - 1, '點一下真的走掉一支');
  ok(A.G.score > 0, '有計分');
  const blocked = A.G.items.filter(o => !A.pathOf(o).ok);
  if (blocked.length) {
    const hb = A.G.hearts;
    tap(win, blocked[0]);
    await wait(700);
    ok(A.G.hearts === hb - 1, '被擋住會扣一顆愛心');
    ok(A.G.mistakes === 1, '出手次數 +1');
  } else ok(true, '（這關開局沒有被擋住的箭頭，跳過撞牆測試）');

  head('道具');
  const h0 = A.S.hints;
  $('btnHint').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await wait(60);
  ok(A.S.hints === h0 - 1, '用提示會扣一個');
  ok(svg.querySelectorAll('g.pc.tip').length === 1, '提示亮出一支箭頭');
  ok($('guide').querySelectorAll('.pathdot').length > 0, '提示同時畫出出場路徑');
  const g0 = A.S.grid;
  $('btnGrid').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await wait(30);
  ok(A.S.grid === !g0 && $('btnGrid').classList.contains('on') === !g0, '格線鈕會切換');
  $('btnGrid').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await wait(1200);

  head('手機：音訊解鎖與按鈕回饋');
  ok(A.ac && A.ac.state === 'running',
    'AudioContext 在使用者手勢後變成 running（手機才聽得到聲音）', A.ac ? A.ac.state : 'no ctx');
  const toastEl = $('toast');
  toastEl.classList.remove('on');
  $('btnFit').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await wait(60);
  ok(toastEl.classList.contains('on') && toastEl.textContent.length > 0,
    '⤢ 一定會給回饋（小關卡不縮放時也會說明）', toastEl.textContent);
  const z1 = A.G.zoom;
  ok(Math.abs(z1 - 1) > 0.05, '⤢ 在整盤放得下的關卡改當放大鏡用', 'zoom=' + z1.toFixed(2));
  $('btnFit').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await wait(60);
  ok(Math.abs(A.G.zoom - 1) < 0.05, '再按一次回到原大小');
  toastEl.classList.remove('on');
  $('btnGrid').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await wait(60);
  ok(toastEl.classList.contains('on') && /開|on/i.test(toastEl.textContent),
    '格線鈕說得出現在是開還是關', toastEl.textContent);
  $('btnGrid').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await wait(1400);

  head('縮放不會卡在奇怪的比例');
  win.eval("setZoom(1.06)"); await wait(30);
  ok(Math.abs(A.G.zoom - 1.06) < 0.02, '先手動把盤面縮放到 1.06', 'zoom=' + A.G.zoom.toFixed(3));
  A.snapZoom(); await wait(30);
  ok(Math.abs(A.G.zoom - 1) < 0.001, '放手後會吸回 1×（手機誤觸兩指的救援）', 'zoom=' + A.G.zoom.toFixed(3));
  win.eval("setZoom(1.8)"); await wait(30);
  A.snapZoom();
  ok(Math.abs(A.G.zoom - 1.8) < 0.02, '真的想放大時不會被吸回去', 'zoom=' + A.G.zoom.toFixed(2));
  win.eval("setZoom(1)"); await wait(30);

  head('整關玩到過關');
  let guard = 0;
  while (A.G && !A.G.over && A.G.items.length && guard++ < 60) {
    const mv = A.anyMove();
    if (!mv.length) break;
    if (A.G.busy) { await wait(80); continue; }
    tap(win, mv[0]);
    await wait(620);
  }
  await wait(300);
  ok(A.G.items.length === 0, '所有箭頭都清掉了');
  ok($('modal').classList.contains('on'), '過關彈窗跳出來');
  ok(A.S.maxLv >= 2, '進度推到第 2 關');
  ok(A.S.stars[1] >= 1, '記下星數');

  head('關卡地圖 / 每日 / 成就 / 週榜');
  A.S.maxLv = 90; A.S.cur = 88;
  $('modal').querySelector('[data-a]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await wait(80);
  win.eval("go('map')"); await wait(100);
  const nodes = $('mapWrap').querySelectorAll('.node');
  ok(nodes.length >= 100, '地圖節點數跟著進度長出來', String(nodes.length));
  const shpN = [...$('mapWrap').querySelectorAll('.node')]
    .filter(x => x.querySelector('.shp')).map(x => +x.querySelector('.nd').dataset.lv);
  ok(shpN.length > 0 && shpN.every(v => v % 5 === 0), '圖形關 ◆ 全部落在 5 的倍數關', shpN.slice(0, 8).join(','));
  ok($('mapWrap').querySelectorAll('.nd.locked').length > 0, '未解鎖的關卡是鎖住的');
  const tiers = [...$('mapWrap').querySelectorAll('.node .side')].map(x => x.textContent).filter(Boolean);
  ok(tiers.some(t => t === '悠閒') && tiers.some(t => t !== '悠閒'), '地圖顯示自有的難度分段名', [...new Set(tiers)].join('/'));
  win.eval("go('daily')"); await wait(80);
  ok($('calBody').querySelectorAll('.day').length >= 28, '每日一關日曆畫出來');
  ok(/下一關|Next level/.test($('calBody').textContent), '有倒數字串');
  win.eval("go('awards')"); await wait(80);
  ok($('awBody').querySelectorAll('.aw').length === 12, '成就 12 項');
  win.eval("go('leagues')"); await wait(80);
  ok($('lgBody').querySelectorAll('.lgrow').length === 20, '週榜 20 人');
  ok($('lgBody').querySelector('.lgrow.me') != null, '有我自己那一列');

  head('即時生成的關卡（第 300 關之後）');
  const beyond = A.P.n + 7;
  win.eval(`go('game'); startLevel(${beyond});`);
  for (let i = 0; i < 200 && (!A.G || A.G.level !== beyond); i++) await wait(50);
  ok(A.G && A.G.level === beyond, `第 ${beyond} 關現場生成成功`);
  ok($('gen').classList.contains('off'), '生成完畢後「生成中」畫面收掉');
  ok(A.G.items.length > 20 && A.anyMove().length > 0, '生成的關卡有箭頭且開局走得動',
    `${A.G.cols}x${A.G.rows}/${A.G.items.length}`);
  ok(A.solvableLv({ cols: A.G.cols, rows: A.G.rows, pieces: A.G.items }), '現場生成的關卡可解');

  head('大盤面：版面、縮放、平移到四個邊');
  win.eval("go('game'); startLevel(150);");
  for (let i = 0; i < 200 && (!A.G || A.G.level !== 150); i++) await wait(50);
  G = A.G;
  let bb = A.boardBox();
  ok(bb.x > -2 && bb.y > -2 && bb.x + bb.w < bb.vw + 2 && bb.y + bb.h < bb.vh + 2,
    '開場整盤看得完（fit-to-screen）', `board ${bb.w.toFixed(0)}x${bb.h.toFixed(0)} in ${bb.vw}x${bb.vh}`);
  win.eval("setZoom(1)"); await wait(30);
  const reach = { l: false, r: false, t: false, b: false };
  win.eval("setPan(-99999,0)"); bb = A.boardBox(); if (bb.x + bb.w <= bb.vw + 16) reach.r = true;
  win.eval("setPan(99999,0)"); bb = A.boardBox(); if (bb.x >= -16) reach.l = true;
  win.eval("setPan(0,-99999)"); bb = A.boardBox(); if (bb.y + bb.h <= bb.vh + 16) reach.b = true;
  win.eval("setPan(0,99999)"); bb = A.boardBox(); if (bb.y >= -16) reach.t = true;
  ok(reach.l && reach.r && reach.t && reach.b, '1× 時四個邊都拖得到');

  head('馬哥：對話框永遠不壓到盤面');
  let checked = 0, hits = 0;
  for (const [w, h] of [[1200, 900], [430, 932], [390, 844], [360, 640]]) {
    const s = await boot(w, h);
    for (const lv of [1, 6, 25, 100, 250]) {
      s.win.eval(`go('game'); startLevel(${lv});`);
      for (let i = 0; i < 100 && (!s.win.__MAGO.G || s.win.__MAGO.G.level !== lv); i++) await wait(30);
      const pr = s.$('boardPanel').getBoundingClientRect();
      const wr = s.$('boardWrap').getBoundingClientRect();
      for (const pose of ['full', 'side', 'back', 'head']) {
        for (const txt of ['第 1 關，馬哥陪你', '只剩一顆心，冷靜',
          'Blocked means a bump and one heart — check the line ahead first', '加油加油']) {
          for (const sl of s.win.__MAGO.findSlot(pose, txt)) {
            checked++;
            for (const [x, y, bw, bh] of [[sl.x, sl.y, sl.w, sl.h], [sl.bx, sl.by, sl.bw, 36]]) {
              const ax = wr.left + x, ay = wr.top + y;
              if (ax < pr.right && ax + bw > pr.left && ay < pr.bottom && ay + bh > pr.top) hits++;
            }
          }
        }
      }
    }
  }
  ok(hits === 0, `馬哥 + 對話框 ${checked} 種擺法全部沒有碰到盤面`, hits ? hits + ' 次交集' : '');

  head('小螢幕版面');
  for (const [w, h] of [[360, 640], [390, 844], [430, 932]]) {
    const s = await boot(w, h);
    let bad = 0;
    for (const lv of [1, 5, 10, 40, 100, 250]) {
      s.win.eval(`go('game'); startLevel(${lv});`);
      for (let i = 0; i < 100 && (!s.win.__MAGO.G || s.win.__MAGO.G.level !== lv); i++) await wait(30);
      const b = s.win.__MAGO.boardBox();
      if (b.w > b.vw + 3 || b.h > b.vh + 3) bad++;
    }
    ok(bad === 0, `${w}×${h}：6 個代表關開場都整盤看得完`);
  }
}

/* -------------------------------------------------------- 乾淨度檢查 */
function testClean() {
  head('乾淨度：repo 裡不能有任何原作內容');
  const bad = [];
  const walk = d => {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      if (f.name === '.git' || f.name === 'node_modules') continue;
      const p = path.join(d, f.name);
      if (f.isDirectory()) walk(p);
      else bad.push(p);
    }
  };
  walk(ROOT);
  // 拆成片段拼回去，免得這個檔案自己被掃到
  const rx = (...p) => new RegExp(p.join(''), 'i');
  const bannedName = [rx('Arrows', '_levels'), rx('levelpack\\.b64'), /遊戲拆解/, rx('teardown'), /\.apk$/i];
  const bannedText = [rx('Less', 'more'), rx('com\\.ecf', 'fri'), rx('data\\.uni', 'ty3d'),
    rx('Puzzle', '\\s*', 'Escape'), rx('原作')];
  const banned = bannedName.concat(bannedText);
  const hitsF = bad.filter(p => bannedName.some(r => r.test(path.basename(p))));
  ok(hitsF.length === 0, '檔名沒有任何原作痕跡', hitsF.join(','));
  const textExt = ['.html', '.js', '.json', '.md', '.py', '.txt', '.yml', '.b64'];
  const hitsC = [];
  for (const p of bad) {
    if (!textExt.includes(path.extname(p))) continue;
    const s = fs.readFileSync(p, 'utf8');
    if (path.basename(p) === 'test.js') continue;         // 掃描器本身
    for (const r of bannedText) if (r.test(s)) hitsC.push(path.relative(ROOT, p) + ' :: ' + r);
  }
  ok(hitsC.length === 0, '檔案內容沒有提到原作的公司／套件名／檔名', hitsC.slice(0, 5).join(' | '));
  const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  ok(![rx('OG', '_Level'), rx('Heart', 'v2'), /07-0\d_\[/, rx('Night', 'mare'), rx('Super', ' Hard')]
    .some(r => r.test(idx)), 'index.html 沒有別人的資產名或難度標籤');
  ok(fs.existsSync(path.join(ROOT, 'LICENSE')) && fs.existsSync(path.join(ROOT, 'README.md')),
    'LICENSE 與 README 都在');
}

/* 走一遍 SVG path，回傳每個節點的絕對座標（支援 M/L/H/V/A 與其小寫版） */
function pathPoints(d) {
  const t = d.match(/[a-zA-Z]|-?\d+(?:\.\d+)?/g) || [];
  let i = 0, x = 0, y = 0, cmd = '';
  const out = [], num = () => +t[i++];
  while (i < t.length) {
    if (/[a-zA-Z]/.test(t[i])) cmd = t[i++];
    if (i > t.length) break;
    switch (cmd) {
      case 'M': case 'L': x = num(); y = num(); break;
      case 'm': case 'l': x += num(); y += num(); break;
      case 'H': x = num(); break;
      case 'h': x += num(); break;
      case 'V': y = num(); break;
      case 'v': y += num(); break;
      case 'A': num(); num(); num(); num(); num(); x = num(); y = num(); break;
      case 'a': num(); num(); num(); num(); num(); x += num(); y += num(); break;
      case 'Z': case 'z': break;
      default: i++; continue;
    }
    out.push([+x.toFixed(2), +y.toFixed(2)]);
  }
  return out;
}

function testCss() {
  head('圖示與手機縮放的靜態檢查');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const svgs = [...html.matchAll(/<button class="iconbtn[^"]*"[^>]*>\s*<svg[^>]*>([\s\S]*?)<\/svg>/g)];
  ok(svgs.length >= 4, `讀到 ${svgs.length} 個 HUD 圖示`);
  const badCoord = [], bigArc = [];
  for (const m of svgs) {
    for (const d of [...m[1].matchAll(/d="([^"]+)"/g)].map(x => x[1])) {
      // 走一遍路徑算出實際落點（相對指令的負數是位移，不能直接當座標看）
      for (const [px, py] of pathPoints(d))
        if (px < -0.6 || px > 24.6 || py < -0.6 || py > 24.6)
          badCoord.push(d.slice(0, 26) + ` :: (${px},${py})`);
      // 弧線半徑超過 9 的話，弧一定凸出 24x24 被切掉（就是重來鈕破圖的原因）
      for (const a of [...d.matchAll(/[aA]\s*(\d+(?:\.\d+)?)[ ,]+(\d+(?:\.\d+)?)/g)])
        if (+a[1] > 9 || +a[2] > 9) bigArc.push(d.slice(0, 30) + ' :: r=' + a[1]);
    }
  }
  ok(badCoord.length === 0, '圖示的座標都在畫布內', badCoord.slice(0, 3).join(' | '));
  ok(bigArc.length === 0, '沒有半徑過大、會被畫布切掉的弧線', bigArc.slice(0, 3).join(' | '));
  ok(/touch-action:manipulation/.test(html), 'body/#app 有 touch-action:manipulation（關掉連點兩下放大頁面）');
  ok(/maximum-scale=1/.test(html), 'viewport 有 maximum-scale=1');
  ok(/gesturestart/.test(html) && /dblclick/.test(html), '有擋掉 iOS 的 gesture 與連點兩下');

  head('格線顏色：每個主題都要看得見');
  const css = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const lum = h => {
    const n = parseInt(h.slice(1), 16);
    return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255));
  };
  const blocks = [...css.matchAll(/(?:^|\})([^{}]*)\{([^}]*--grid:[^}]*)\}/gm)];
  let checked = 0, weak = [];
  for (const b of blocks) {
    const body = b[2];
    const g = (body.match(/--grid:\s*(#[0-9A-Fa-f]{6})/) || [])[1];
    const pn = (body.match(/--panel:\s*(#[0-9A-Fa-f]{6})/) || [])[1];
    if (!g || !pn) continue;
    checked++;
    const d = Math.abs(lum(g) - lum(pn));
    if (d < 8) weak.push(`${b[1].trim().slice(0, 28)} Δ${d.toFixed(1)}`);
  }
  ok(checked >= 6, `讀到 ${checked} 個主題的格線設定`);
  ok(weak.length === 0, '格線與盤面底色的亮度差都 ≥ 8（畫在白盤上看得出來）', weak.join(' | '));
}

(async () => {
  const t0 = Date.now();
  try {
    if (which === 'all' || which === 'data') await testData();
    if (which === 'all' || which === 'dom') await testDom();
    if (which === 'all' || which === 'css') testCss();
    if (which === 'all' || which === 'clean') testClean();
  } catch (e) {
    fail++; console.log('\n!! 測試中斷：' + (e && e.stack || e));
  }
  console.log(`\n${'-'.repeat(66)}\n通過 ${pass}　失敗 ${fail}　（${((Date.now() - t0) / 1000).toFixed(1)}s）`);
  process.exit(fail ? 1 : 0);
})();
