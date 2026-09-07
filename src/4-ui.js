/* ==========================================================================
   4 / 4　畫面：關卡地圖、每日一關、成就、週榜、結算、設定、輸入
   ========================================================================== */

/* ---------- 開一關 ----------
   前 P.n 關是烘焙好的，解開就能玩；之後的關卡要現場生成（大盤面約 0.5～1 秒），
   所以先把「生成中」畫面畫出來，讓瀏覽器有機會重繪，再進生成器。 */
function startLevel(n, opt) {
  const needGen = (opt && opt.daily) || !slotOf(n).baked;
  if (!needGen) { newLevel(n, opt); return; }
  $('genTxt').textContent = T('loading');
  $('gen').classList.remove('off');
  requestAnimationFrame(() => setTimeout(() => {
    try { newLevel(n, opt); }
    catch (e) { console.error(e); floatHint(T('genfail')); }
    finally { $('gen').classList.add('off'); }
  }, 30));
}

/* ---------- 畫面切換 ---------- */
function go(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === id));
  if (id === 'home') refreshHome();
  if (id === 'map') buildMap();
  if (id === 'daily') buildDaily();
  if (id === 'awards') buildAwards();
  if (id === 'leagues') buildLeagues();
}
function applyTheme() {
  document.documentElement.dataset.theme = S.theme === 'paper' ? '' : S.theme;
  if (G) { drawDots(); drawGrid(); }
}
function applyLang() { L = STR[S.lang] || STR.zh; relabel(); }
function relabel() {
  $('hTitle').textContent = T('title');
  $('btnPlay').textContent = S.cur > 1 ? T('cont') + ' · ' + T('levelN', S.cur) : T('play');
  $('btnHow').textContent = T('howto');
  $('btnSet').textContent = T('settings');
  $('tMapT').textContent = T('levels');
  $('tDailyT').textContent = T('challenge');
  $('tAwardT').textContent = T('awards');
  $('tLeagueT').textContent = T('leagues');
  $('mapTtl').textContent = T('levels');
  $('dailyTtl').textContent = T('challenge');
  $('awTtl').textContent = T('awards');
  $('lgTtl').textContent = T('leagues');
  $('mapFoot').textContent = T('mapFoot');
  $('splashTxt').textContent = S.lang === 'zh' ? '載入中…' : 'LOADING…';
  $('sLvW').firstChild.textContent = T('level');
  $('sScW').firstChild.textContent = T('score');
  $('sCbW').firstChild.textContent = T('combo');
  $('sArW').firstChild.textContent = T('arrows');
  $('btnGrid').title = T('gridTip');
  $('btnHint').title = T('hintTitle');
  $('btnRestart').title = T('restart');
}
function refreshHome() {
  $('stLv').textContent = S.maxLv;
  $('stSc').textContent = nfmt(S.score);
  $('stCb').textContent = S.bestCombo;
  $('stAr').textContent = nfmt(S.arrowsCleared);
  $('btnPlay').textContent = S.cur > 1 ? T('cont') + ' · ' + T('levelN', S.cur) : T('play');
  $('tMapS').textContent = T('levelN', S.cur);
  const dOk = S.maxLv >= K.DailyUnlock;
  $('tDaily').classList.toggle('off', !dOk);
  $('tDailyS').textContent = dOk
    ? (S.daily[dstamp(new Date())] ? T('done') : T('todayD'))
    : T('lockedD', K.DailyUnlock);
  const aOk = S.maxLv >= K.AwardsUnlock;
  $('tAward').classList.toggle('off', !aOk);
  const aw = awardList();
  $('tAwardS').textContent = aOk ? aw.filter(a => a.done).length + ' / ' + aw.length : T('lockedA', K.AwardsUnlock);
  const lOk = S.maxLv >= K.LeaguesUnlock, lPre = S.maxLv >= K.LeaguesPreview;
  $('tLeague').classList.toggle('off', !lPre);
  $('tLeagueS').textContent = lOk ? T('week') + ' ' + nfmt(weekScore()) :
    lPre ? T('lockedLP', K.LeaguesUnlock) : T('lockedL', K.LeaguesPreview);
}

/* ---------- 關卡地圖 ---------- */
let mapBuilt = 0;
function buildMap() {
  const wrap = $('mapWrap'), top = Math.max(S.maxLv + 12, 24);
  wrap.querySelectorAll('.node').forEach(n => n.remove());
  const frag = document.createDocumentFragment();
  for (let n = top; n >= 1; n--) {
    const sl = slotOf(n);
    const open = n <= S.maxLv, st = S.stars[n] || 0;
    const el = document.createElement('div');
    el.className = 'node' + (n % 10 === 0 ? ' big' : '');
    const col = `var(${TIERVAR[sl.tier]})`;
    el.innerHTML =
      `<div class="side ${n % 2 ? 'l' : 'r'}">${open || n === S.maxLv ? tierName(sl.tier) : ''}</div>` +
      `<div class="nd${open ? '' : ' locked'}${n === S.cur ? ' cur' : ''}" data-lv="${n}"
        style="${open ? 'background:' + col : ''}">${n}</div>` +
      (sl.shaped ? `<div class="shp">◆</div>` : '') +
      (st ? `<div class="stars">${[1, 2, 3].map(i => `<i class="${i <= st ? '' : 'off'}"></i>`).join('')}</div>` : '');
    frag.appendChild(el);
  }
  wrap.appendChild(frag);
  mapBuilt = top;
  requestAnimationFrame(() => {
    const cur = wrap.querySelector('.nd.cur');
    if (cur) $('mapScroll').scrollTop = cur.getBoundingClientRect().top -
      $('mapScroll').getBoundingClientRect().top + $('mapScroll').scrollTop - $('mapScroll').clientHeight * .55;
  });
}
$('mapWrap').addEventListener('click', e => {
  const nd = e.target.closest('.nd[data-lv]'); if (!nd || nd.classList.contains('locked')) return;
  const n = +nd.dataset.lv;
  actx(); go('game'); startLevel(n);
});
$('mapJump').addEventListener('click', buildMap);

/* ---------- 每日挑戰 ---------- */
let calMonth = null;
function buildDaily() {
  const now = new Date();
  if (!calMonth) calMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const y = calMonth.getFullYear(), m = calMonth.getMonth();
  const first = new Date(y, m, 1), days = new Date(y, m + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;                 // 週一起算
  let doneN = 0;
  for (let d = 1; d <= days; d++) if (S.daily[dstamp(new Date(y, m, d))]) doneN++;
  const dow = S.lang === 'zh' ? ['一', '二', '三', '四', '五', '六', '日'] : ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  let cells = dow.map(d => `<div class="dow">${d}</div>`).join('');
  for (let i = 0; i < lead; i++) cells += '<div class="day blank"></div>';
  for (let d = 1; d <= days; d++) {
    const dt = new Date(y, m, d), st = dstamp(dt);
    const future = dt > now && st !== dstamp(now);
    const done = !!S.daily[st], today = st === dstamp(now);
    cells += `<div class="day${done ? ' done' : ''}${today ? ' today' : ''}${future ? ' future' : ''}"
      ${future ? '' : `data-d="${st}"`}>${d}</div>`;
  }
  const canPrev = true, canNext = !(y === now.getFullYear() && m === now.getMonth());
  const nextMid = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now;
  const hh = Math.floor(nextMid / 3600000), mm = Math.floor(nextMid % 3600000 / 60000), ss = Math.floor(nextMid % 60000 / 1000);
  $('calBody').innerHTML =
    `<div class="calhead">
      <button class="calnav" id="calPrev" ${canPrev ? '' : 'disabled'}>‹</button>
      <b>${(MONTHS[S.lang] || MONTHS.en)[m]} ${y}</b>
      <button class="calnav" id="calNext" ${canNext ? '' : 'disabled'}>›</button>
    </div>
    <div class="calbar"><div class="n">${doneN}</div><div class="bar"><i style="width:${doneN / days * 100}%"></i></div><div>${days}</div></div>
    <div class="calgrid">${cells}</div>
    <div class="cd">${T('newLevelIn', hh, mm, ss)}</div>
    <div style="margin-top:16px"><button class="btn wide" id="calPlay">${T('play')}</button></div>
    <div class="sub" style="text-align:center;margin-top:10px">${S.lang === 'zh'
      ? '每日一關用日期當種子，全世界同一天同一關，難度固定在「硬派」帶。'
      : 'The daily level is seeded by the date — same board for everyone, always in the Brutal band.'}</div>`;
  $('calPrev').onclick = () => { calMonth = new Date(y, m - 1, 1); buildDaily(); };
  $('calNext').onclick = () => { calMonth = new Date(y, m + 1, 1); buildDaily(); };
  $('calPlay').onclick = () => playDaily(dstamp(now));
  $('calBody').querySelectorAll('.day[data-d]').forEach(el =>
    el.onclick = () => playDaily(el.dataset.d));
}
function playDaily(stamp) {
  actx(); go('game'); startLevel(0, { daily: stamp });
}
/* 倒數每秒只換那一行字，不重畫整個日曆 */
setInterval(() => {
  if (!$('daily').classList.contains('on')) return;
  const cd = $('calBody').querySelector('.cd'); if (!cd) return;
  const now = new Date();
  const left = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now;
  cd.textContent = T('newLevelIn', Math.floor(left / 3600000),
    Math.floor(left % 3600000 / 60000), Math.floor(left % 60000 / 1000));
  if (left < 1500) { calMonth = null; buildDaily(); }
}, 1000);

/* ---------- 成就 ---------- */
function awardList() {
  const stars3 = Object.values(S.stars).filter(v => v >= 3).length;
  const dailyN = Object.keys(S.daily).length;
  const mk = (ic, zh, en, cur, goal) => ({
    ic, name: S.lang === 'zh' ? zh : en, cur: Math.min(cur, goal), goal, done: cur >= goal
  });
  return [
    mk('🎯', '第一次逃脫', 'First escape', S.maxLv - 1, 1),
    mk('🚩', '走完新手期 · 30 關', 'Through the ramp · 30 levels', S.maxLv - 1, 30),
    mk('🏁', '一百關', 'One hundred levels', S.maxLv - 1, 100),
    mk('👑', '三百關 · 烘焙關卡走完', 'Three hundred levels', S.maxLv - 1, 300),
    mk('➡️', '清掉 1,000 支箭頭', 'Clear 1,000 arrows', S.arrowsCleared, 1000),
    mk('🌧️', '清掉 10,000 支箭頭', 'Clear 10,000 arrows', S.arrowsCleared, 10000),
    mk('⚡', '連擊 10', 'Combo of 10', S.bestCombo, 10),
    mk('🔥', '連擊 25', 'Combo of 25', S.bestCombo, 25),
    mk('✨', '零失誤過關 ×10', 'No-miss clears ×10', S.clean, 10),
    mk('⭐', '三星過關 ×20', 'Three stars ×20', stars3, 20),
    mk('💀', '拿下一關「無情」', 'Beat a Merciless level', S.byTier[3] || 0, 1),
    mk('📅', '每日一關 ×7', 'Seven daily levels', dailyN, 7)
  ];
}
function buildAwards() {
  const ok = S.maxLv >= K.AwardsUnlock;
  if (!ok) {
    $('awBody').innerHTML = `<div class="tut" style="margin:14px 0">${T('lockedA', K.AwardsUnlock)}</div>`;
    return;
  }
  $('awBody').innerHTML = awardList().map(a =>
    `<div class="aw${a.done ? ' done' : ''}">
      <div class="ic">${a.done ? '✓' : a.ic}</div>
      <div class="tx"><b>${a.name}</b><span>${a.cur} / ${a.goal}</span>
        <div class="bar"><i style="width:${a.cur / a.goal * 100}%"></i></div></div>
      <div class="n">${Math.floor(a.cur / a.goal * 100)}%</div>
    </div>`).join('');
}

/* ---------- 聯盟賽（每週重置，對手由當週種子決定） ---------- */
function weekTag(d) {
  d = d || new Date();
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
  const w1 = new Date(t.getFullYear(), 0, 4);
  return t.getFullYear() + '-W' + String(1 + Math.round(((t - w1) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7)).padStart(2, '0');
}
function weekScore() {
  const tag = weekTag();
  if (S.weekTag !== tag) { S.weekTag = tag; S.weekScore = 0; save(); }
  return S.weekScore;
}
const LGNAMES = ['Nova', 'Pixel', 'Kite', 'Mochi', 'Rico', 'Juno', 'Bolt', 'Suki', 'Milo', 'Zara',
  'Kobe', 'Wren', 'Otto', 'Nala', 'Finn', 'Iris', 'Remy', 'Tova', 'Ezra', 'Lumi', 'Kai', 'Sage'];
function buildLeagues() {
  const pre = S.maxLv >= K.LeaguesPreview, ok = S.maxLv >= K.LeaguesUnlock;
  if (!pre) { $('lgBody').innerHTML = `<div class="tut">${T('lockedL', K.LeaguesPreview)}</div>`; $('lgSub').textContent = ''; $('lgTop').textContent = '—'; return; }
  const tag = weekTag(), seed = hash32(tag.split('').reduce((a, c) => a + c.charCodeAt(0), 0), 0x1ea9);
  const mine = weekScore();
  const base = Math.max(600, mine * 0.9 + 400);
  const rows = [];
  for (let i = 0; i < 19; i++) {
    const h = hash32(seed + i * 7919, 0x77);
    const nm = LGNAMES[h % LGNAMES.length] + (h >> 8) % 90;
    rows.push({ nm, sc: Math.round(base * (0.35 + (h % 1000) / 1000 * 1.5)), me: false });
  }
  rows.push({ nm: S.lang === 'zh' ? '我' : 'You', sc: mine, me: true });
  rows.sort((a, b) => b.sc - a.sc);
  const myRank = rows.findIndex(r => r.me) + 1;
  $('lgSub').innerHTML = `${tag} · ${T('week')} <b style="color:var(--ink)">${nfmt(mine)}</b>`
    + (ok ? '' : `<br><span style="color:var(--ink3)">${T('lockedLP', K.LeaguesUnlock)}</span>`);
  $('lgTop').textContent = T('topN', myRank);
  $('lgBody').innerHTML =
    `<div class="zone">${T('promo')}</div>` +
    rows.map((r, i) =>
      (i === 5 ? `<div class="zone" style="color:var(--ink3)">${T('hold')}</div>` : '') +
      `<div class="lgrow${r.me ? ' me' : ''}${i < 5 ? ' up' : ''}">
        <div class="r">${i + 1}</div><div class="nm">${r.nm}</div><div class="sc">${nfmt(r.sc)}</div>
      </div>`).join('');
}

/* ---------- 結算 ---------- */
function modal(html) { $('cardBody').innerHTML = html; $('modal').classList.add('on'); }
function closeModal() { $('modal').classList.remove('on'); }
function win() {
  G.over = true; SFX.win(); hush(); hideCombo();
  const secs = Math.round((Date.now() - G.t0) / 1000);
  const stars = G.hearts, first = G.mistakes === 0;
  S.score += G.score; S.playSec += secs;
  if (first) S.clean++;
  praise(praiseWord());
  if (G.daily) {
    if (!S.daily[G.daily]) {
      S.daily[G.daily] = { s: G.score, t: secs };
      const y = new Date(); y.setDate(y.getDate() - 1);
      S.dailyStreak = (S.dailyLast === dstamp(y) ? S.dailyStreak : 0) + 1;
      S.dailyLast = G.daily;
    }
  } else {
    S.stars[G.level] = Math.max(S.stars[G.level] || 0, stars);
    S.byTier[G.tier] = (S.byTier[G.tier] || 0) + 1;
    if (G.level + 1 > S.maxLv) S.maxLv = G.level + 1;
    S.cur = Math.max(S.cur, G.level + 1);
  }
  S.hints = Math.min(K.MaxHints, S.hints + 1);
  if (S.weekTag !== weekTag()) { S.weekTag = weekTag(); S.weekScore = 0; }
  S.weekScore += G.score;
  save();
  for (let i = 0; i < 3; i++) setTimeout(() => {
    const ab = appBox();
    parts.push(...Array.from({ length: 14 }, () => ({
      x: ab.width * (.2 + Math.random() * .6), y: ab.height * .34,
      vx: (Math.random() - .5) * 7, vy: -Math.random() * 7, r: 2 + Math.random() * 3.6, life: 1,
      col: ['#F0B429', '#5676FF', '#12142E', '#40BDEE'][R(4)], rot: Math.random() * 6
    })));
  }, i * 170);
  modal(`<img class="pm" src="${SPRITES.side}" alt="馬哥">
    <h2>${T('complete')}</h2>
    <div class="stars">${STAR(stars >= 1)}${STAR(stars >= 2)}${STAR(stars >= 3)}</div>
    <p><b style="color:var(${TIERVAR[G.tier]})">${tierName(G.tier)}</b>
      <span style="color:var(--ink3)"> · ${G.cellCount} ${S.lang === 'zh' ? '格' : 'cells'}${G.shaped ? ' · ' + T('shapedTag') : ''}</span></p>
    <div class="kv">
      <div><small>${T('cleared')}</small><b>${G.total}</b></div>
      <div><small>${T('attempts')}</small><b>${G.mistakes + 1}</b></div>
      <div><small>${T('time')}</small><b>${fmtTime(secs)}</b></div>
      <div><small>${first ? T('firstTry') : T('score')}</small><b>${first ? '✓' : nfmt(G.score)}</b></div>
    </div>
    <div class="cardbtns">
      ${G.daily ? `<button class="btn" data-a="home">${T('home')}</button>`
      : `<button class="btn" data-a="next">${T('level')} ${G.level + 1}</button>
         <button class="btn ghost sm" data-a="map">${T('levels')}</button>`}
    </div>`);
}
function lose() {
  G.over = true; SFX.lose(); hideCombo(); hush();
  modal(`<img class="pm" src="${SPRITES.back}" alt="馬哥">
    <h2>${T('outLives')}</h2>
    <p>${T('refill')}</p>
    <div class="cardbtns">
      <button class="btn" data-a="playon">${T('playOn')}</button>
      <button class="btn ghost sm" data-a="retry">${T('restart')}</button>
      <button class="btn ghost sm" data-a="home">${T('home')}</button>
    </div>`);
}
function askRestart() {
  if (!G) return;
  modal(`<h2>${T('restartQ')}</h2><p>${T('restartBody')}</p>
    <div class="cardbtns">
      <button class="btn" data-a="retry">${T('restart')}</button>
      <button class="btn ghost sm" data-a="close">${T('no')}</button>
    </div>`);
}
$('modal').addEventListener('click', e => {
  const a = e.target.closest('[data-a]'); if (!a) return;
  const act = a.dataset.a;
  if (act === 'playon') {
    closeModal(); G.hearts = K.MaxLives; G.over = false; updHud();
    say(pick('start', { '%L': G.level }), { prio: 2, pose: 'full', dur: 2200 });
    return;
  }
  closeModal();
  if (act === 'next') startLevel(G.level + 1);
  if (act === 'retry') G.daily ? startLevel(0, { daily: G.daily }) : startLevel(G.level);
  if (act === 'home') { hush(); go('home'); }
  if (act === 'map') { hush(); go('map'); }
  if (act === 'wipe') { localStorage.removeItem('magoArrows'); location.reload(); }
});

/* ---------- 設定 / 說明 ---------- */
const THEMES = [['paper', '宣紙', 'Paper'], ['bamboo', '竹林', 'Bamboo'], ['roast', '焙茶', 'Roast'],
['night', '夜行', 'Night'], ['ink', '墨黑', 'Ink'], ['plum', '梅子', 'Plum']];
function settings() {
  const row = (k, t, d) => `<div class="setrow"><div>${t}${d ? `<div class="sd">${d}</div>` : ''}</div>
    <div class="sw${S[k] ? ' on' : ''}" data-t="${k}"></div></div>`;
  modal(`<h2 style="margin-bottom:10px">${T('settings')}</h2>
    ${row('sfx', T('sounds'), T('soundsD'))}
    ${row('vibr', T('vibr'))}
    <div class="setrow"><div>${T('themes')}</div><div class="seg" id="segTheme">
      ${THEMES.map(([v, zh, en]) => `<button data-v="${v}" class="${S.theme === v ? 'on' : ''}">${S.lang === 'zh' ? zh : en}</button>`).join('')}
    </div></div>
    <div class="setrow"><div>${T('lang')}</div><div class="seg" id="segLang">
      <button data-v="zh" class="${S.lang === 'zh' ? 'on' : ''}">中文</button>
      <button data-v="en" class="${S.lang === 'en' ? 'on' : ''}">English</button>
    </div></div>
    ${row('guide', T('guideS'), T('guideD'))}
    ${row('safe', T('safeS'), T('safeD'))}
    ${row('mascot', T('mascotS'), T('mascotD'))}
    ${row('autoFin', T('autoS'), T('autoD'))}
    <div class="cardbtns" style="margin-top:14px">
      <button class="btn" data-a="close">${T('close')}</button>
      <button class="btn ghost sm" id="btnWipe">${T('reset')}</button>
    </div>`);
  $('cardBody').querySelectorAll('.sw').forEach(sw => sw.addEventListener('click', () => {
    const k = sw.dataset.t; S[k] = !S[k]; sw.classList.toggle('on', S[k]); save();
    if (k === 'sfx' && S.sfx) SFX.tap();
    if (k === 'mascot' && !S.mascot) hush();
  }));
  $('segTheme').addEventListener('click', e => {
    const b = e.target.closest('button[data-v]'); if (!b) return;
    S.theme = b.dataset.v; save(); applyTheme();
    $('segTheme').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  });
  $('segLang').addEventListener('click', e => {
    const b = e.target.closest('button[data-v]'); if (!b) return;
    S.lang = b.dataset.v; save(); applyLang();
    closeModal(); settings();
    if (G) updHud();
  });
  $('btnWipe').addEventListener('click', () => {
    modal(`<h2>${T('resetQ')}</h2><p></p><div class="cardbtns">
      <button class="btn" data-a="wipe">${T('yes')}</button>
      <button class="btn ghost sm" data-a="close">${T('no')}</button></div>`);
  });
}
function howto() {
  const zh = S.lang === 'zh';
  const tiers = (TIERNAME[S.lang] || TIERNAME.zh).join(' / ');
  modal(`<h2 style="margin-bottom:9px">${T('howto')}</h2>
    <div class="tut">${zh ? `
      <b>1.</b> 每條折線都是一支箭頭，<b>箭尖就是它要衝出去的方向</b>。<br>
      <b>2.</b> 點一下，它會沿著<b>自己的軌道</b>整條滑出棋盤。<br>
      <b>3.</b> 唯一條件：箭尖正前方那條直線，到棋盤外之前<b>完全沒有東西</b>。<br>
      <b>4.</b> 被擋住就撞上去，<b>扣一顆愛心</b>；三顆用完可以免費補滿或整關重來。<br>
      <b>5.</b> 所以真正要做的事只有一件：<b>找出正確的清除順序</b>。<br>
      <b>6.</b> 移除箭頭只會<b>釋放</b>格子、永遠不會新增阻擋 → <b>不可能死局</b>，
      失敗只來自愛心，不來自順序。<br>
      <b>7.</b> 盤面比畫面大時：<b>按住空白處拖曳</b>移動、<b>雙指縮放</b>（桌機用滾輪），
      ⤢ 鈕在「整盤 ↔ 1×」之間切換。<br>
      <b>8.</b> 難度只看一個數字：<b>所有箭頭佔用的格數總和</b>。
      ${TIERCUT.join(' / ')} 三個門檻切成 ${tiers} 四段，
      跟盤面多大、箭頭幾支、彎幾次都無關。<br>
      <b>9.</b> 每 5 關安排一個<b>圖形關 ◆</b>：盤面排成 ${SHAPENAMES.length} 種圖形之一
      —— 愛心、熊貓、壽司、城堡、機器人…分段不變但只填一半，是節奏上的減壓閥。<br>
      <b>10.</b> 燈泡是<b>提示</b>，會亮出一支現在走得掉的箭頭並把鏡頭帶過去；
      井字鈕切換格線。<br>
      <span class="mini">關卡是內建生成器產生的，用關卡號當種子 ——
      <b>第 N 關對任何人永遠是同一關</b>，而且生成方式本身就保證有解。
      前 ${P ? P.n : 300} 關已經烘焙在檔案裡，之後的關卡開場前現場生成。
      旁邊那隻是<b>馬哥</b>，他只在棋盤外的空白處探頭，不會擋到盤面。</span>` : `
      <b>1.</b> Every polyline is one arrow — <b>the head points where it wants to leave</b>.<br>
      <b>2.</b> Tap it and the whole snake slides out <b>along its own body path</b>.<br>
      <b>3.</b> The only condition: the straight line ahead of the head must be
      <b>completely empty</b> all the way off the board.<br>
      <b>4.</b> Blocked means a bump and <b>one heart</b>. Out of hearts: refill free or restart.<br>
      <b>5.</b> So there is exactly one thing to figure out: <b>the right clearing order</b>.<br>
      <b>6.</b> Removing an arrow only <b>frees</b> cells, never blocks — so a dead end is
      impossible. You lose hearts, never the solution.<br>
      <b>7.</b> Bigger than the screen? <b>Drag any empty spot</b> to move, <b>pinch to zoom</b>
      (mouse wheel on desktop), ⤢ toggles whole-board view.<br>
      <b>8.</b> Difficulty is a single number: <b>the sum of all arrow lengths</b>.
      Cutoffs ${TIERCUT.join(' / ')} split it into ${tiers} —
      board size, arrow count and bends do not matter.<br>
      <b>9.</b> Every 5th level is a <b>shaped level ◆</b> — the board takes one of
      ${SHAPENAMES.length} shapes (heart, panda, sushi, castle, robot…). Same tier,
      half the visual density: a pressure valve.<br>
      <b>10.</b> The bulb is the <b>hint</b>; the grid button toggles the grid lines.<br>
      <span class="mini">Levels come from the built-in generator, seeded by the level number —
      <b>level N is the same board for everyone</b>, and the way it is built guarantees a
      solution exists. The first ${P ? P.n : 300} levels are baked into the file; later ones are
      generated on the spot. The little guy is <b>Mago</b> — he only pops up in the empty band
      outside the board.</span>`}</div>
    <div class="cardbtns"><button class="btn" data-a="close">${T('close')}</button></div>`);
}

/* ---------- 按鈕 ---------- */
$('btnPlay').addEventListener('click', () => { actx(); go('game'); startLevel(Math.max(1, S.cur)); });
$('btnHow').addEventListener('click', howto);
$('btnSet').addEventListener('click', settings);
$('tMap').addEventListener('click', () => go('map'));
$('tDaily').addEventListener('click', () => {
  if (S.maxLv < K.DailyUnlock) { floatHint(T('lockedD', K.DailyUnlock)); return; }
  calMonth = null; go('daily');
});
$('tAward').addEventListener('click', () => {
  if (S.maxLv < K.AwardsUnlock) { floatHint(T('lockedA', K.AwardsUnlock)); return; }
  go('awards');
});
$('tLeague').addEventListener('click', () => {
  if (S.maxLv < K.LeaguesPreview) { floatHint(T('lockedL', K.LeaguesPreview)); return; }
  go('leagues');
});
document.querySelectorAll('[data-back]').forEach(b =>
  b.addEventListener('click', () => go(b.dataset.back)));
$('btnBack').addEventListener('click', () => { hush(); go(G && G.daily ? 'daily' : 'map'); });
$('btnRestart').addEventListener('click', askRestart);
/* ⤢：盤面比畫面大時在「整盤 ↔ 1×」之間切；本來就看得完時就當放大鏡用。
   一定要給回饋，不然小關卡按下去看起來像壞的。 */
$('btnFit').addEventListener('click', () => {
  if (!G) return;
  SFX.tap();
  const r = zoomRange(), z = G.zoom || 1;
  if (r.min >= 1) {                       // 整盤本來就放得下
    const zoomIn = z <= 1.05;
    setZoom(zoomIn ? 1.8 : 1);
    setPan(0, 0); redrawSoon();
    toast(T(zoomIn ? 'zoomIn' : 'zoomOut'), 1300);
    return;
  }
  const wasFit = Math.abs(z - r.min) < 0.02;
  fitBoard();
  toast(T(wasFit ? 'zoom1x' : 'fitWhole'), 1300);
});
$('btnGrid').addEventListener('click', () => {
  S.grid = !S.grid; save(); SFX.tap();
  $('btnGrid').classList.toggle('on', S.grid);
  if (G) drawGrid();
  toast(T(S.grid ? 'gridOn' : 'gridOff'), 1300);
});
$('btnHint').addEventListener('click', () => {
  if (!G || G.busy || G.over) return;
  if (S.hints <= 0) { floatHint(T('hintNone')); return; }
  const opts = anyMove(); if (!opts.length) return;
  S.hints--; save(); updHud(); SFX.ding();
  const p = opts[R(opts.length)];
  centerOn(p);
  p.g.classList.add('tip'); clearGuide(); showGuide(p);
  say(pick('hint'), { prio: 2, pose: 'head', dur: 2200 });
  setTimeout(() => { p.g.classList.remove('tip'); clearGuide(); }, 2600);
});

/* ---------- 輸入：一指拖曳＝平移，兩指＝縮放，放開沒拖過才算點擊 ---------- */
let PEND = null, DRAG = null, DRAGGED = false, PINCH = null;
const PTRS = new Map();
const DRAGMIN = 8;
const pid = ev => ev.pointerId == null ? 1 : ev.pointerId;
function pinchInfo() {
  const a = [...PTRS.values()];
  if (a.length < 2) return null;
  return { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1, mx: (a[0].x + a[1].x) / 2, my: (a[0].y + a[1].y) / 2 };
}
$('boardWrap').addEventListener('pointerdown', ev => {
  if (!G || G.over) return;
  PTRS.set(pid(ev), { x: ev.clientX || 0, y: ev.clientY || 0 });
  if (PTRS.size === 2) {
    const p = pinchInfo();
    PINCH = { d0: p.d, z0: G.zoom || 1 }; DRAG = null; DRAGGED = false; PEND = null; clearGuide();
    $('boardWrap').classList.remove('panning');
    return;
  }
  if (PTRS.size === 1) { DRAG = { x: ev.clientX || 0, y: ev.clientY || 0, px: G.panX || 0, py: G.panY || 0 }; DRAGGED = false; }
});
addEventListener('pointermove', ev => {
  if (!G) return;
  if (PTRS.has(pid(ev))) PTRS.set(pid(ev), { x: ev.clientX || 0, y: ev.clientY || 0 });
  if (PINCH && PTRS.size >= 2) { const p = pinchInfo(); setZoom(PINCH.z0 * p.d / PINCH.d0, p.mx, p.my); return; }
  if (!DRAG) return;
  const dx = (ev.clientX || 0) - DRAG.x, dy = (ev.clientY || 0) - DRAG.y;
  if (!DRAGGED && Math.abs(dx) + Math.abs(dy) > DRAGMIN) {
    const Lm = panLimit();
    if (!Lm.x && !Lm.y) { DRAG = null; return; }
    DRAGGED = true; PEND = null; clearGuide();
    $('boardWrap').classList.add('panning');
  }
  if (DRAGGED) setPan(DRAG.px + dx, DRAG.py + dy);
});
function endDrag() {
  const o = PEND, was = DRAGGED || PINCH;
  PEND = null; DRAG = null; DRAGGED = false;
  $('boardWrap').classList.remove('panning');
  if (!was && o) onTap(o);
}
/* 雙指放開後把縮放「吸」回整數狀態。
   手機上很容易在點箭頭時不小心多碰一根手指，縮放停在 1.04 這種值，
   看起來就是「盤面莫名被放大一點又回不去」。差一點就直接歸位。 */
function snapZoom() {
  if (!G) return;
  const r = zoomRange(), z = G.zoom || 1;
  if (Math.abs(z - 1) < 0.12) { setZoom(1); setPan(G.panX, G.panY); }
  else if (Math.abs(z - r.min) < 0.12) setZoom(r.min);
}
addEventListener('pointerup', ev => {
  PTRS.delete(pid(ev));
  if (PTRS.size < 2 && PINCH) { PINCH = null; DRAG = null; PEND = null; snapZoom(); redrawSoon(); }
  if (PTRS.size === 0 && (DRAG || PEND || !PINCH)) endDrag();
});
/* 手指離開螢幕或切到背景時，別讓 PINCH 卡住（卡住的話點擊會被當成縮放而被吃掉） */
addEventListener('blur', () => { PTRS.clear(); PINCH = null; DRAG = null; DRAGGED = false; PEND = null; });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { PTRS.clear(); PINCH = null; DRAG = null; DRAGGED = false; PEND = null; }
});
/* iOS Safari 不理 user-scalable=no，要自己擋 gesture 事件與連點兩下，
   否則被放大的是整個頁面（不是盤面），遊戲裡任何按鈕都救不回來。 */
['gesturestart', 'gesturechange', 'gestureend'].forEach(ev =>
  document.addEventListener(ev, e => e.preventDefault(), { passive: false }));
document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
addEventListener('pointercancel', ev => {
  PTRS.delete(pid(ev)); PINCH = null; PEND = null; DRAG = null; DRAGGED = false;
  $('boardWrap').classList.remove('panning');
  snapZoom();
});
$('boardWrap').addEventListener('wheel', ev => {
  if (!G || G.over) return;
  ev.preventDefault();
  setZoom((G.zoom || 1) * Math.exp(-(ev.deltaY || 0) * 0.0016), ev.clientX, ev.clientY);
  redrawSoon();
}, { passive: false });
let holdT = null;
svg.addEventListener('pointerdown', e => {
  if (!S.guide || !G) return;
  const g = e.target.closest('.pc'); if (!g) return;
  const o = G.items.find(i => i.g === g); if (!o) return;
  holdT = setTimeout(() => showGuide(o), 140);
});
['pointerup', 'pointercancel', 'pointerleave'].forEach(ev =>
  svg.addEventListener(ev, () => { clearTimeout(holdT); setTimeout(clearGuide, 60); }));
addEventListener('resize', () => { resizeFx(); if (G) layout(true); });
addEventListener('orientationchange', () => setTimeout(() => { resizeFx(); if (G) layout(true); }, 250));
document.addEventListener('contextmenu', e => e.preventDefault());
addEventListener('keydown', e => {
  if (e.key === 'Escape') { if ($('modal').classList.contains('on')) closeModal(); else if ($('game').classList.contains('on')) go('map'); }
  if (e.key === 'h' && $('game').classList.contains('on')) $('btnHint').click();
  if (e.key === 'r' && $('game').classList.contains('on')) askRestart();
  if (e.key === 'f' && $('game').classList.contains('on')) $('btnFit').click();
});

/* ---------- 竹葉裝飾（只在框內，不吃點擊） ---------- */
(function leaves() {
  const svg = '<svg viewBox="0 0 40 100" fill="currentColor"><path d="M20 0C6 24 0 52 8 78c4 13 10 19 12 22 2-3 8-9 12-22C40 52 34 24 20 0z"/></svg>';
  [[2, 5, 118, -18], [86, -4, 148, 24], [-5, 60, 168, 12], [80, 66, 138, -30]].forEach(([l, t, z, r]) => {
    const d = document.createElement('div');
    d.className = 'leaf';
    d.style.cssText = `left:${l}%;top:${t}%;width:${z}px;transform:rotate(${r}deg)`;
    d.innerHTML = svg;
    $('app').appendChild(d);
  });
})();

/* ---------- 開機 ---------- */
$('heroImg').src = SPRITES.full;
applyLang(); applyTheme(); resizeFx();
loadPack().then(() => {
  $('splash').classList.add('off');
  go('home');
  if (typeof window !== 'undefined') window.__MAGO = {
    S, K, slotOf, levelSource, generate, decodeLevel, tierOf, pickTier, anyMove, pathOf,
    newLevel, boardBox, findSlot, awardList, weekTag, dailySeed, solvableLv, branchProfile,
    get P() { return P; }, get G() { return G; }, get ac() { return ac; }, unlockAudio,
    snapZoom, setZoom, zoomRange
  };
}).catch(err => {
  $('splash').innerHTML = `<div style="padding:26px;text-align:center;font-size:13px;line-height:1.7">
    <b>關卡包解不開</b><br><span style="color:var(--ink2)">${err && err.message ? err.message : err}</span><br><br>
    這個檔案需要瀏覽器支援 DecompressionStream（Chrome 80+／Edge／Safari 16.4+／Firefox 113+）。</div>`;
  console.error(err);
});
