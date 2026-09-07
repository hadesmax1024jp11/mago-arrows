/* jsdom 啟動器：把 mago-arrows.html 跑起來，並補上 jsdom 缺的三塊
     1. SVG 幾何（getPointAtLength / getTotalLength）—— 真的解析折線座標
     2. 版面幾何（getBoundingClientRect / clientWidth …）—— 按真實比例補
     3. pointer-events 的 CSSOM 繼承推導 —— 點擊前先確認「玩家真的點得到」
   test-mago.js 與 preview-svg.js 共用。
*/
'use strict';
const fs = require('fs'), path = require('path');
const { DecompressionStream } = require('node:stream/web');
const HTML = path.resolve(__dirname, '..', 'index.html');
const JSDOM_PATH = process.env.JSDOM_PATH || '/tmp/node_modules/jsdom';

function makeDom(w, h) {
  const { JSDOM } = require(JSDOM_PATH);
  const html = fs.readFileSync(HTML, 'utf8');
  return new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://local.test/',
    beforeParse(win) {
      win.innerWidth = w; win.innerHeight = h;
      win.devicePixelRatio = 2;
      win.DecompressionStream = DecompressionStream;
      win.Blob = Blob; win.Response = Response;
      win.atob = s => Buffer.from(s, 'base64').toString('binary');
      win.navigator.vibrate = () => true;
      win.AudioContext = function () {
        this.currentTime = 0; this.sampleRate = 44100;
        this.state = 'suspended';                       // 手機一開始就是這個狀態
        this.resume = () => { this.state = 'running'; return Promise.resolve(); };
        this.createOscillator = () => ({ type: '', frequency: { setValueAtTime() { }, exponentialRampToValueAtTime() { } }, connect: () => ({ connect() { } }), start() { }, stop() { } });
        this.createGain = () => ({ gain: { setValueAtTime() { }, linearRampToValueAtTime() { }, exponentialRampToValueAtTime() { }, value: 0 }, connect: () => ({ connect() { } }) });
        this.createBuffer = (a, n) => ({ getChannelData: () => new Float32Array(n) });
        this.createBufferSource = () => ({ buffer: null, connect: () => ({ connect: () => ({ connect() { } }) }), start() { } });
        this.createBiquadFilter = () => ({ type: '', frequency: { value: 0 }, connect: () => ({ connect: () => ({ connect() { } }) }) });
        this.destination = {};
      };
      win.HTMLCanvasElement.prototype.getContext = function () {
        return {
          setTransform() { }, clearRect() { }, beginPath() { }, arc() { }, fill() { }, stroke() { },
          moveTo() { }, lineTo() { }, save() { }, restore() { }, translate() { }, rotate() { },
          ellipse() { }, fillRect() { }, set fillStyle(v) { }, set strokeStyle(v) { },
          set lineWidth(v) { }, set globalAlpha(v) { }
        };
      };
      const proto = win.SVGElement.prototype;
      const pts = el => (el.getAttribute('d') || '').replace(/^M/, '')
        .split('L').map(s => s.trim().split(/[\s,]+/).map(Number));
      proto.getTotalLength = function () {
        const p = pts(this); let L = 0;
        for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
        return L;
      };
      proto.getPointAtLength = function (t) {
        const p = pts(this);
        if (!p.length || p[0].length < 2) return { x: 0, y: 0 };
        let acc = 0;
        for (let i = 1; i < p.length; i++) {
          const seg = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
          if (acc + seg >= t || i === p.length - 1) {
            const u = seg ? Math.max(0, Math.min(1, (t - acc) / seg)) : 0;
            return { x: p[i - 1][0] + (p[i][0] - p[i - 1][0]) * u, y: p[i - 1][1] + (p[i][1] - p[i - 1][1]) * u };
          }
          acc += seg;
        }
        return { x: p[p.length - 1][0], y: p[p.length - 1][1] };
      };
      const APPW = Math.min(w, 430), APPH = Math.min(h, Math.round(APPW * 2.1667));
      const HUD = 42 + 8 + 32 + 9 + 12, PADX = 11;   // hud 列 + 進度列 + 上下留白
      win.HTMLElement.prototype.getBoundingClientRect = function () {
        const id = this.id, g = win.__G && win.__G();
        const appL = Math.max(0, (w - APPW) / 2), appT = Math.max(0, (h - APPH) / 2);
        if (id === 'app') return { left: appL, top: appT, width: APPW, height: APPH, right: appL + APPW, bottom: appT + APPH };
        if (id === 'boardWrap') {
          const bw = APPW - PADX * 2, bh = APPH - HUD - 20;
          return { left: appL + PADX, top: appT + HUD, width: bw, height: bh, right: appL + PADX + bw, bottom: appT + HUD + bh };
        }
        if (id === 'boardPanel' || id === 'board') {
          if (!g) return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 };
          const z = g.zoom || 1, pw = g.cell * g.cols + 20, ph = g.cell * g.rows + 20;
          const wrapW = APPW - PADX * 2, wrapH = APPH - HUD - 20;
          const x = appL + PADX + (wrapW - pw * z) / 2 + (g.panX || 0);
          const y = appT + HUD + (wrapH - ph * z) / 2 + (g.panY || 0);
          const iw = (id === 'board' ? g.cell * g.cols : pw) * z;
          const ih = (id === 'board' ? g.cell * g.rows : ph) * z;
          const ox = id === 'board' ? 10 * z : 0;
          return { left: x + ox, top: y + ox, width: iw, height: ih, right: x + ox + iw, bottom: y + ox + ih };
        }
        return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 };
      };
      const dim = (name, pick) => Object.defineProperty(win.HTMLElement.prototype, name, {
        get() { return pick.call(this); }, configurable: true
      });
      dim('clientWidth', function () { return Math.round(this.getBoundingClientRect().width); });
      dim('clientHeight', function () { return Math.round(this.getBoundingClientRect().height); });
      dim('offsetWidth', function () {
        if (this.id === 'boardPanel') { const g = win.__G && win.__G(); return g ? g.cell * g.cols + 20 : 0; }
        return Math.round(this.getBoundingClientRect().width);
      });
      dim('offsetHeight', function () {
        if (this.id === 'boardPanel') { const g = win.__G && win.__G(); return g ? g.cell * g.rows + 20 : 0; }
        return Math.round(this.getBoundingClientRect().height);
      });
      function pointerEventsOf(el) {
        let n = el;
        while (n && n.classList) {
          const c = n.classList;
          if (c.contains('hit')) return 'stroke';
          if (['guide', 'dots', 'gridc', 'fx', 'mascot', 'praise', 'toast', 'combo'].includes(n.id)
            || c.contains('pathdot') || c.contains('blockx')) return 'none';
          n = n.parentNode;
        }
        return 'auto';
      }
      win.getComputedStyle = el => ({
        getPropertyValue: p => ({ '--dot': '#E6E5EC', '--grid': '#F1F1F8', '--blue': '#5676FF', '--ink': '#12142E' })[p] || '',
        pointerEvents: pointerEventsOf(el), display: 'block'
      });
    }
  });
}
const wait = ms => new Promise(r => setTimeout(r, ms));
async function boot(w, h) {
  const dom = makeDom(w, h), win = dom.window;
  for (let i = 0; i < 240 && !win.__MAGO; i++) await wait(25);
  if (!win.__MAGO) throw new Error('boot timeout');
  win.__G = () => win.__MAGO.G;
  return { dom, win, $: id => win.document.getElementById(id) };
}
function tap(win, o) {
  const ev = t => new win.PointerEvent(t, { bubbles: true, clientX: 100, clientY: 200, pointerId: 1 });
  if (win.getComputedStyle(o.hit).pointerEvents === 'none') throw new Error('hit path is not clickable');
  o.hit.dispatchEvent(ev('pointerdown'));
  win.dispatchEvent(ev('pointerup'));
}
module.exports = { makeDom, boot, tap, wait, HTML };
