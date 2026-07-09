/* ==========================================================
   ジャグラーEX -6号機シミュレーター- script.js
   made by hiro/ヒロ  https://github.com/h1ro223
   ========================================================== */
'use strict';

/* ================= 定数 ================= */
const SYM = { GRAPE: 1, CHERRY: 2, CLOWN: 3, BELL: 4, REPLAY: 5, BAR: 6, SEVEN: 7 };
const SYM_IMG = {
  1: './Reel/Grape.png',
  2: './Reel/Cherry.png',
  3: './Reel/Clown.png',
  4: './Reel/Bell.png',
  5: './Reel/Replay.png',
  6: './Reel/BAR.png',
  7: './Reel/7.png'
};

/* リール配列 (index0 = コマ21(上) → index20 = コマ01(下)) */
const REEL_DATA = [
  [4,7,5,1,5,1,6,2,1,5,1,7,3,1,5,1,2,6,1,5,1], // 左
  [5,7,1,2,5,4,1,2,5,6,1,2,5,4,1,2,5,6,1,2,3], // 中
  [1,7,6,4,5,1,3,4,5,1,3,4,5,1,3,4,5,1,3,4,5]  // 右
];
const KOMA = 21;

/* 有効5ライン: 各リールの行(0=上,1=中,2=下) */
const LINES = [
  [0,0,0], // 上段
  [1,1,1], // 中段
  [2,2,2], // 下段
  [0,1,2], // 右下がり
  [2,1,0]  // 右上がり
];

/* 設定別確率 (index0 = 設定1) 本家6号機アイムジャグラーEX準拠 */
const SETTINGS = [
  { bb: 1/273.1, rb: 1/439.8, grape: 1/6.02 },
  { bb: 1/269.7, rb: 1/399.6, grape: 1/6.02 },
  { bb: 1/269.7, rb: 1/331.0, grape: 1/6.02 },
  { bb: 1/259.0, rb: 1/315.1, grape: 1/6.02 },
  { bb: 1/259.0, rb: 1/255.0, grape: 1/6.02 },
  { bb: 1/255.0, rb: 1/255.0, grape: 1/5.85 }
];
const P_REPLAY = 1/7.298;
const P_CHERRY = 1/38.1;
const P_BELL   = 1/1092.3;
const P_CLOWN  = 1/1092.3;
/* 中段チェリー(単独チェリー/レアチェリー): BB確定・BB確率の内数 設定1-3: 1/2184.53, 4-6: 1/1820.44 */
const rareCherryProb = s => (s <= 3 ? 1/2184.53 : 1/1820.44);
const CHERRY_DUP_RATE = 0.25; // ボーナス当選時のチェリー重複割合(概算)

/* 停止目標図柄 (null=不問) BB=7/7/7, RB=7/7/BAR (本家準拠) */
const TARGETS = {
  GRAPE:  [1, 1, 1],
  BELL:   [4, 4, 4],
  CLOWN:  [3, 3, 3],
  REPLAY: [5, 5, 5],
  CHERRY: [2, null, null],
  RARECHERRY: [2, null, null], // 中段(中段ラインのみ有効)
  BB:     [7, 7, 7],
  RB:     [7, 7, 6]
};

const MAX_SLIP   = 4;      // 最大4コマ引き込み
const REV_MS     = 780;    // 1回転にかかる時間(ms) 約77rpm
const SPEED      = KOMA / REV_MS;  // コマ/ms
const DECEL_KOMA = 1.05;   // 減速に使うコマ数
const WAIT_MS    = 4100;   // ゲーム間ウェイト(4.1秒規定)
const BB_LIMIT   = 280;    // BB: 280枚を超える払い出しで終了
const RB_LIMIT   = 98;     // RB: 98枚を超える払い出しで終了
const PAY_CAP    = 15;     // 1ゲームの払い出し上限
const CREDIT_MAX = 50;
const SAVE_KEY   = 'imjuggler_ex_6_save_v1';

/* ================= 状態 ================= */
const state = {
  setting: 1,          // 設定1〜6
  credit: 0,
  mochi: 0,            // 持ちメダル
  investYen: 0,        // 投資金額
  totalIn: 0,          // 総投入枚数
  totalOut: 0,         // 総払い出し枚数
  bet: 0,
  replayPending: 0,    // リプレイ成立時: 次ゲームのBET数(0=なし)
  bonusFlag: null,     // null | 'BB' | 'RB'
  smallFlag: null,     // null | 'GRAPE' | 'CHERRY' | 'BELL' | 'CLOWN' | 'REPLAY'
  lampLit: false,
  lampPending: false,  // 第3停止ボタンを離した瞬間に点灯待ち
  inBonus: false,
  bonusType: null,
  bonusPaid: 0,
  counts: { bb: 0, rb: 0, total: 0, start: 0 },
  gamePhase: 'idle',   // 'idle' | 'spinning'
  cols: [null, null, null],   // 停止した窓の図柄(列ごと)
  stopsInitiated: 0,
  thirdStopPressed: false,
  lastSpinStart: 0,
  pressOrder: [],      // 停止ボタンを押した順番 (Stop7判定用)
  betLock: false,      // BBFinish再生中はBET/レバー不可
  rareLamp: false,     // 中段チェリー契機ボーナス(レインボー点灯)
  history: [],         // ボーナス履歴グラフ {g, t} 新しい順・最大9件
  pendingHist: null,   // 進行中ボーナスの履歴 {g, t}
  assist: false,
  bgmOn: true,
  seOn: true,
  bgmVol: 0.7,
  seVol: 0.8
};

/* ================= サウンド (BGM/SE ファイル再生) ================= */
const BGM_FILES = {
  BB: './BGM/BB.mp3', RB: './BGM/RB.mp3', BBFINISH: './BGM/BBFinish.mp3',
  BBHIT1: './BGM/BBhit1.mp3', BBHIT2: './BGM/BBhit2.mp3'
};
const SE_FILES = {
  BET: './SE/Bet.mp3', MAXBET2: './SE/MaxBet2.mp3', MAXBET3: './SE/MaxBet3.mp3',
  LEVER: './SE/Lever.mp3', STOP: './SE/Stop.mp3', STOP7: './SE/Stop7.mp3',
  GRAPE8: './SE/GetGrape8.mp3', GRAPE14: './SE/GetGrape14.mp3',
  GET1: './SE/Get1.mp3', GET1FIN: './SE/Get1Finish.mp3',
  REPLAY: './SE/ReplayBet.mp3', GOGO: './SE/GOGOCHANCE.mp3'
};

const audio = {
  se: {}, bgm: {}, bgmEl: null,
  init() {
    try {
      for (const k in SE_FILES) { const a = new Audio(SE_FILES[k]); a.preload = 'auto'; this.se[k] = a; }
      for (const k in BGM_FILES) { const a = new Audio(BGM_FILES[k]); a.preload = 'auto'; this.bgm[k] = a; }
    } catch (e) { /* Audio非対応環境 */ }
  },
  ensure() {},
  /* SE再生 overlap=true で多重再生可 */
  playSE(key, overlap = false) {
    if (!state.seOn) return null;
    const base = this.se[key];
    if (!base) return null;
    const a = overlap ? base.cloneNode() : base;
    a.volume = state.seVol;
    if (!overlap) a.currentTime = 0;
    a.play().catch(() => {});
    return a;
  },
  /* BGM(ループ)再生 */
  playBGM(key) {
    this.stopBGM();
    if (!state.bgmOn) return;
    const base = this.bgm[key];
    if (!base) return;
    base.loop = true;
    base.volume = state.bgmVol;
    base.currentTime = 0;
    base.play().catch(() => {});
    this.bgmEl = base;
  },
  stopBGM() {
    if (this.bgmEl) { this.bgmEl.pause(); this.bgmEl.loop = false; this.bgmEl = null; }
  },
  /* BGMカテゴリの単発再生 (BBhit/BBFinish) onEnd必ず1回呼ぶ */
  playBGMOnce(key, onEnd) {
    const base = this.bgm[key];
    if (!state.bgmOn || !base) { if (onEnd) onEnd(); return; }
    let done = false;
    const fin = () => { if (!done) { done = true; if (onEnd) onEnd(); } };
    base.loop = false;
    base.volume = state.bgmVol;
    base.currentTime = 0;
    base.onended = fin;
    base.onerror = fin;
    base.play().catch(fin);
  },
  setBgmVolume(v) { if (this.bgmEl) this.bgmEl.volume = v; },
  /* Get1をn回一定間隔でループ→最後にGet1Finish (間隔を空けず一定速度) */
  get1Loop(coins) {
    if (!state.seOn) return;
    const n = Math.max(0, coins - 1);
    const INTERVAL = 110;
    let i = 0;
    const tick = () => {
      if (i < n) { this.playSE('GET1', true); i++; setTimeout(tick, INTERVAL); }
      else { this.playSE('GET1FIN', true); }
    };
    tick();
  }
};

/* ================= DOM ================= */
const $ = id => document.getElementById(id);
const el = {
  dpBB: $('dpBB'), dpRB: $('dpRB'), dpStart: $('dpStart'), dpTotal: $('dpTotal'), dpGosei: $('dpGosei'),
  wMochi: $('wMochi'), wInvest: $('wInvest'), wDiff: $('wDiff'),
  segCredit: $('segCredit'), segBonus: $('segBonus'), segPayout: $('segPayout'),
  msgBar: $('msgBar'), gogoLamp: $('gogoLamp'), gogoImg: $('gogoImg'),
  lever: $('lever'), reelWindow: $('reelWindow'), topBanner: $('topBanner'),
  betLamps: [$('betLamp1'), $('betLamp2'), $('betLamp3')],
  lampStart: $('lampStart'), lampReplay: $('lampReplay'), lampWait: $('lampWait'), lampInsert: $('lampInsert'),
  stopBtns: [$('stop0'), $('stop1'), $('stop2')],
  btnRent: $('btnRent'), btnBet1: $('btnBet1'), btnMaxBet: $('btnMaxBet'),
  btnPayback: $('btnPayback'), btnMenu: $('btnMenu'),
  modalOverlay: $('modalOverlay'), currentSetting: $('currentSetting'),
  chkAssist: $('chkAssist'), chkBgm: $('chkBgm'), chkSe: $('chkSe'),
  volBgm: $('volBgm'), volSe: $('volSe'), bonusGraph: $('bonusGraph')
};

/* ================= ユーティリティ ================= */
const mod = (n, m) => ((n % m) + m) % m;
const modK = n => mod(n, KOMA);

function windowCol(reelIdx, pos) {
  const d = REEL_DATA[reelIdx];
  return [d[modK(pos)], d[modK(pos + 1)], d[modK(pos + 2)]];
}

/* 表示窓の全ライン評価 → 成立役リスト */
function evalWins(cols) {
  const wins = [];
  LINES.forEach((rows, i) => {
    const s = [cols[0][rows[0]], cols[1][rows[1]], cols[2][rows[2]]];
    if (s[0] === SYM.CHERRY) wins.push({ role: 'CHERRY', line: i });
    if (s[0] === s[1] && s[1] === s[2]) {
      if (s[0] === SYM.GRAPE)  wins.push({ role: 'GRAPE',  line: i });
      else if (s[0] === SYM.BELL)   wins.push({ role: 'BELL',   line: i });
      else if (s[0] === SYM.CLOWN)  wins.push({ role: 'CLOWN',  line: i });
      else if (s[0] === SYM.REPLAY) wins.push({ role: 'REPLAY', line: i });
      else if (s[0] === SYM.SEVEN)  wins.push({ role: 'BB',     line: i });
    }
    if (s[0] === SYM.SEVEN && s[1] === SYM.SEVEN && s[2] === SYM.BAR) wins.push({ role: 'RB', line: i });
  });
  return wins;
}

function payoutFor(wins, bet) {
  let total = 0;
  for (const w of wins) {
    switch (w.role) {
      case 'GRAPE':  total += (bet === 3 ? 8 : 14); break;
      case 'BELL':   total += 14; break;
      case 'CLOWN':  total += 10; break;
      case 'CHERRY': total += (bet === 3 ? 1 : 7); break;
    }
  }
  return Math.min(total, PAY_CAP);
}

/* ================= 停止制御 (最大4コマ引き込み + 蹴飛ばし) ================= */

/* 指定リールで「図柄symを行rowに置ける停止位置」の一覧 (チェリー蹴飛ばし考慮) */
function alignSet(reelIdx, sym, row, avoidCherry) {
  const set = [];
  for (let t = 0; t < KOMA; t++) {
    if (REEL_DATA[reelIdx][t] !== sym) continue;
    const p = modK(t - row);
    if (avoidCherry && reelIdx === 0 && windowCol(0, p).includes(SYM.CHERRY)) continue;
    set.push(p);
  }
  return set;
}

/* どのタイミングで押しても4コマ以内に引き込めるか (円環上の最大間隔 <= 5) */
function coversAllPresses(setArr) {
  if (setArr.length === 0) return false;
  const s = [...setArr].sort((a, b) => a - b);
  for (let i = 0; i < s.length; i++) {
    const gap = (i === s.length - 1) ? (s[0] + KOMA - s[i]) : (s[i + 1] - s[i]);
    if (gap > MAX_SLIP + 1) return false;
  }
  return true;
}

function chooseStopPosition(reelIdx, curPos) {
  const stopped = state.cols;
  const nStopped = stopped.filter(Boolean).length;

  // このゲームで狙う役: 小役優先 → なければ保持中ボーナス
  const flagRole = state.smallFlag || state.bonusFlag || null;
  const allowed = new Set();
  if (state.smallFlag) {
    allowed.add(state.smallFlag);
    if (state.smallFlag === 'RARECHERRY') allowed.add('CHERRY'); // 実際の入賞役はチェリー
  } else if (state.bonusFlag) allowed.add(state.bonusFlag);

  const target = flagRole ? TARGETS[flagRole] : null;
  // 目押しアシストON時はボーナス図柄を全域引き込み
  const isBonusAim = !state.smallFlag && !!state.bonusFlag;
  const maxSlip = (state.assist && isBonusAim) ? KOMA - 1 : MAX_SLIP;

  // 押した位置からの候補(ビタ〜スベリ)
  let base = Math.floor(curPos);
  if (curPos - base < 0.2) base = base - 1; // 最低限の移動距離を確保
  const candidates = [];
  for (let s = 0; s <= maxSlip; s++) candidates.push({ slip: s, p: modK(base - s) });

  const scoreOf = (cand) => {
    const col = windowCol(reelIdx, cand.p);
    const cols = stopped.slice();
    cols[reelIdx] = col;

    if (nStopped === 2) {
      /* 第3停止: 完成形を厳密に判定 */
      const wins = evalWins(cols);
      const badWins = wins.filter(w => !allowed.has(w.role));
      const flagHit = flagRole && wins.some(w =>
        flagRole === 'RARECHERRY' ? (w.role === 'CHERRY' && w.line === 1) : w.role === flagRole);
      if (badWins.length > 0) return 1000 + badWins.length * 10; // 蹴飛ばし対象
      if (flagHit) return 0;      // フラグ成立形 → 最優先
      return 10;                  // ハズレ形(クリーン)
    }

    /* 第1・第2停止: 非成立チェリーの蹴飛ばし + フラグ達成可能ライン数を最大化 */
    let penalty = 0;
    if (!allowed.has('CHERRY') && cols[0]) {
      // チェリーは左リールのみで成立が確定するため、左停止時点で必ず回避する
      if (cols[0].includes(SYM.CHERRY)) penalty = 500;
    }
    if (!target) return penalty + 10; // ハズレ時はビタ優先
    const avoidCherry = !allowed.has('CHERRY');
    let live = 0, guaranteed = 0;
    const lineSet = (flagRole === 'RARECHERRY') ? [LINES[1]] : LINES; // 中段チェリーは中段のみ
    lineSet.forEach(rows => {
      let ok = true;
      for (let c = 0; c < 3; c++) {
        const t = target[c];
        if (t == null) continue;
        const cc = cols[c];
        if (!cc) continue; // 未停止リールは後で制御
        if (cc[rows[c]] !== t) { ok = false; break; }
      }
      if (!ok) return;
      live++;
      // 残りのリールが「どのタイミングで押しても」引き込めるラインか
      let sure = true;
      for (let c = 0; c < 3; c++) {
        if (cols[c]) continue;
        const t = target[c];
        if (t == null) continue;
        if (!coversAllPresses(alignSet(c, t, rows[c], avoidCherry))) { sure = false; break; }
      }
      if (sure) guaranteed++;
    });
    // 保証ラインを最優先 → live数 → スベリ少で選択
    return penalty + (guaranteed > 0 ? 0 : 100) + (10 - live);
  };

  let best = null, bestScore = Infinity;
  for (const cand of candidates) {
    const sc = scoreOf(cand);
    if (sc < bestScore || (sc === bestScore && best && cand.slip < best.slip)) {
      bestScore = sc; best = cand;
    }
  }
  return best.p;
}

/* ================= リール描画 & アニメーション ================= */
class Reel {
  constructor(idx) {
    this.idx = idx;
    this.el = $('reel' + idx);
    this.strip = this.el.querySelector('.strip');
    this.pos = idx * 7;          // 初期位置をずらす
    this.mode = 'stopped';       // 'stopped' | 'spin' | 'stopping' | 'settle'
    this.v = 0;
    this.remain = 0;
    this.target = 0;
    this.settleT = 0;
    this.cellH = 60;
    this.buildStrip();
  }
  buildStrip() {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < KOMA * 2; i++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      const img = document.createElement('img');
      img.src = SYM_IMG[REEL_DATA[this.idx][i % KOMA]];
      img.alt = '';
      img.draggable = false;
      cell.appendChild(img);
      frag.appendChild(cell);
    }
    this.strip.appendChild(frag);
  }
  startSpin(delay) {
    this.mode = 'spin';
    this.v = 0;
    this.accelUntil = performance.now() + 220 + delay;
    this.spinDelay = performance.now() + delay;
  }
  requestStop() {
    if (this.mode !== 'spin' || this.v < SPEED * 0.95) return false;
    const target = chooseStopPosition(this.idx, this.pos);
    this.target = target;
    this.remain = mod(this.pos - target, KOMA);
    if (this.remain < 0.15) this.remain += KOMA; // 極端に短い場合は1周
    this.mode = 'stopping';
    return true;
  }
  update(dt, now) {
    if (this.mode === 'spin') {
      if (now < this.spinDelay) return;
      // 加速
      if (now < this.accelUntil) {
        this.v = Math.min(SPEED, this.v + SPEED * dt / 180);
      } else {
        this.v = SPEED;
      }
      this.pos = mod(this.pos - this.v * dt, KOMA);
    } else if (this.mode === 'stopping') {
      // 残距離に応じて減速 (実機風のヌルッとした止まり方)
      const ratio = Math.min(1, this.remain / DECEL_KOMA);
      const v = SPEED * Math.max(0.28, ratio);
      const step = Math.min(this.remain, v * dt);
      this.remain -= step;
      this.pos = mod(this.target + this.remain, KOMA);
      if (this.remain <= 0.001) {
        this.pos = this.target;
        this.mode = 'settle';
        this.settleT = 0;
        onReelStopped(this.idx, this.target);
      }
    } else if (this.mode === 'settle') {
      // 停止時の小さなバウンド
      this.settleT += dt;
      if (this.settleT >= 150) { this.mode = 'stopped'; this.settleOffset = 0; }
    }
    this.render();
  }
  render() {
    let p = this.pos;
    if (this.mode === 'settle') {
      const t = this.settleT;
      p = this.target - 0.1 * Math.sin(t / 24) * Math.exp(-t / 55);
      p = mod(p, KOMA);
    }
    this.strip.style.transform = `translate3d(0, ${(-p * this.cellH).toFixed(2)}px, 0)`;
    const fast = (this.mode === 'spin' && this.v > SPEED * 0.55);
    this.strip.classList.toggle('blur', fast);
  }
  resize(cellH) {
    this.cellH = cellH;
    this.render();
  }
}

const reels = [];

/* リールサイズ調整 (画像1280x720 → セルは16:9でピッタリ収める) */
function layoutReels() {
  const reelEl = $('reel0');
  const w = reelEl.getBoundingClientRect().width;
  const cellH = Math.round(w * 9 / 16);
  document.documentElement.style.setProperty('--cellH', cellH + 'px');
  document.documentElement.style.setProperty('--windowH', cellH * 3 + 'px');
  reels.forEach(r => r.resize(cellH));
}

/* メインループ */
let lastT = 0;
function loop(t) {
  const dt = Math.min(50, t - lastT || 16);
  lastT = t;
  for (const r of reels) {
    if (r.mode !== 'stopped') r.update(dt, t);
  }
  requestAnimationFrame(loop);
}

/* ================= ゲームフロー ================= */

function message(text, big = false) {
  el.msgBar.textContent = text;
  el.msgBar.classList.toggle('big', big);
}

/* --- BET --- */
function tryConsumeCoins(n) {
  // クレジット不足なら持ちメダルから自動補充
  while (state.credit < n && state.mochi > 0) {
    const move = Math.min(CREDIT_MAX - state.credit, state.mochi);
    if (move <= 0) break;
    state.credit += move;
    state.mochi -= move;
  }
  if (state.credit < n) return false;
  state.credit -= n;
  return true;
}

function addBet(n) {
  if (state.gamePhase !== 'idle' || state.replayPending || state.inBonus || state.betLock) return;
  const newBet = Math.min(3, state.bet + n);
  const need = newBet - state.bet;
  if (need <= 0) return;
  if (!tryConsumeCoins(need)) { message('メダルが足りません! 貸出ボタンを押してください'); return; }
  state.bet = newBet;
  state.totalIn += need;
  audio.playSE('BET', true); // 重ね再生可
  updateUI();
}

function setMaxBet() {
  if (state.gamePhase !== 'idle' || state.replayPending || state.inBonus || state.betLock) return;
  const max = 3;
  const need = max - state.bet;
  if (need <= 0) return;
  if (!tryConsumeCoins(need)) { message('メダルが足りません! 貸出ボタンを押してください'); return; }
  state.bet = max;
  state.totalIn += need;
  audio.playSE('MAXBET3'); // 通常時3枚BET
  updateUI();
}

/* --- レバーON --- */
function leverOn() {
  if (state.gamePhase !== 'idle' || state.betLock) return;
  const now = performance.now();
  const waitRemain = state.lastSpinStart + WAIT_MS - now;

  // BET確定処理
  if (state.replayPending) {
    state.bet = state.replayPending;
    state.replayPending = 0;
  } else if (state.inBonus) {
    if (state.bet === 0) {
      if (!tryConsumeCoins(2)) { message('メダルが足りません! 貸出ボタンを押してください'); return; }
      state.bet = 2;
      state.totalIn += 2;
      audio.playSE('MAXBET2'); // ボーナス中は2枚BET固定
    }
  } else if (state.bet === 0) {
    // 未BETならMAXBET扱い(便利機能)
    if (!tryConsumeCoins(3)) { message('メダルが足りません! 貸出ボタンを押してください'); return; }
    state.bet = 3;
    state.totalIn += 3;
    audio.playSE('MAXBET3');
  }

  state.gamePhase = 'spinning';
  el.lever.classList.add('pushed');
  setTimeout(() => el.lever.classList.remove('pushed'), 150);
  audio.playSE('LEVER');

  const begin = () => startGame();
  if (waitRemain > 30) {
    el.lampWait.classList.add('on');
    message('ウェイト中...');
    setTimeout(() => { el.lampWait.classList.remove('on'); begin(); }, waitRemain);
  } else {
    begin();
  }
  updateUI();
}

function startGame() {
  state.lastSpinStart = performance.now();
  state.cols = [null, null, null];
  state.stopsInitiated = 0;
  state.thirdStopPressed = false;
  state.pressOrder = [];
  el.segPayout.textContent = '0';
  el.lampReplay.classList.remove('on');
  el.lampStart.classList.add('on');
  setTimeout(() => el.lampStart.classList.remove('on'), 400);

  /* --- 抽選 --- */
  if (state.inBonus) {
    state.smallFlag = 'GRAPE'; // ボーナス中は毎ゲームブドウ
  } else {
    const sp = SETTINGS[state.setting - 1];
    let newBonus = false, rareHit = false, dupCherry = false;
    if (!state.bonusFlag) {
      const r = Math.random();
      if (r < sp.bb) {
        state.bonusFlag = 'BB'; newBonus = true;
        if (r < rareCherryProb(state.setting)) rareHit = true;       // 中段チェリー(BB内数)
        else if (Math.random() < CHERRY_DUP_RATE) dupCherry = true;  // チェリー重複BB
      } else if (r < sp.bb + sp.rb) {
        state.bonusFlag = 'RB'; newBonus = true;
        if (Math.random() < CHERRY_DUP_RATE) dupCherry = true;       // チェリー重複RB
      }
    }
    // 小役抽選
    if (rareHit) {
      state.smallFlag = 'RARECHERRY';
      state.rareLamp = true;
    } else if (dupCherry) {
      state.smallFlag = 'CHERRY';
    } else {
      const r2 = Math.random();
      let acc = 0;
      state.smallFlag = null;
      if (r2 < (acc += sp.grape)) state.smallFlag = 'GRAPE';
      else if (r2 < (acc += P_REPLAY)) state.smallFlag = 'REPLAY';
      else if (r2 < (acc += P_CHERRY)) state.smallFlag = 'CHERRY';
      else if (r2 < (acc += P_BELL)) state.smallFlag = 'BELL';
      else if (r2 < (acc += P_CLOWN)) state.smallFlag = 'CLOWN';
    }

    /* GOGO!CHANCE 点灯タイミング抽選 */
    if (newBonus && !state.lampLit) {
      if (Math.random() < 0.10) {
        lightLamp(); // 先ペカ(レバーON時) 10%
      } else {
        state.lampPending = true; // 第3停止ボタンを離した瞬間 90%
      }
    }
    state.counts.start++;
    state.counts.total++; // BB/RB中の回転はスタート・総回転数に含めない
  }

  /* リール始動 */
  reels.forEach((r, i) => r.startSpin(i * 70));
  if (state.inBonus) {
    const limit = state.bonusType === 'BB' ? BB_LIMIT : RB_LIMIT;
    message(`${state.bonusType === 'BB' ? 'BIG' : 'REGULAR'} BONUS 中!  ${state.bonusPaid} / ${limit}枚`);
  } else if (state.lampLit) {
    message('GOGO!CHANCE!! ボーナス図柄を狙え!', true);
  } else {
    message('');
  }
  saveGame();
  updateUI();
}

/* --- ストップボタン --- */
function pressStop(i) {
  if (state.gamePhase !== 'spinning') return;
  const r = reels[i];
  if (!r.requestStop()) return;
  state.pressOrder.push(i);
  state.stopsInitiated++;
  if (state.stopsInitiated === 3) state.thirdStopPressed = true;
  audio.playSE('STOP', true); // 重ね再生可
  el.stopBtns[i].disabled = true;
  el.stopBtns[i].classList.remove('active');
}

/* 第3停止ボタンを離した瞬間 → 後ペカ */
function onStopRelease() {
  if (state.thirdStopPressed && state.lampPending) {
    state.lampPending = false;
    lightLamp();
  }
}

function lightLamp() {
  state.lampLit = true;
  state.lampPending = false;
  el.gogoImg.src = './GOGO/GOGOCHANCE_1.png';
  el.gogoLamp.classList.add('lit');
  el.gogoLamp.classList.toggle('rainbow', state.rareLamp); // 中段チェリー時はレインボー
  audio.playSE('GOGO');
}

function unlightLamp() {
  state.lampLit = false;
  state.lampPending = false;
  state.rareLamp = false;
  el.gogoImg.src = './GOGO/GOGOCHANCE_0.png';
  el.gogoLamp.classList.remove('lit', 'rainbow');
}

/* --- リール停止完了 --- */
function onReelStopped(idx, pos) {
  state.cols[idx] = windowCol(idx, pos);
  /* Stop7: 第1ボタン→第2ボタンの順で押し、7-7テンパイした時のみ再生 */
  if (idx === 1 && state.pressOrder[0] === 0 && state.pressOrder[1] === 1 && state.cols[0]) {
    const tenpai = LINES.some(rows =>
      state.cols[0][rows[0]] === SYM.SEVEN && state.cols[1][rows[1]] === SYM.SEVEN);
    if (tenpai) audio.playSE('STOP7');
  }
  if (state.cols.every(Boolean)) {
    setTimeout(resolveGame, 120);
  }
}

/* --- 結果判定 --- */
function resolveGame() {
  const wins = evalWins(state.cols);
  const bet = state.bet;
  let pay = 0;

  /* ボーナス図柄整列チェック */
  const bonusAligned = state.bonusFlag && wins.some(w => w.role === state.bonusFlag);

  if (bonusAligned) {
    startBonus(state.bonusFlag);
  } else {
    pay = payoutFor(wins, bet);
    const hasReplay = wins.some(w => w.role === 'REPLAY');

    if (pay > 0) {
      addPayout(pay);
      el.segPayout.textContent = String(pay);
      el.reelWindow.classList.add('win-flash');
      setTimeout(() => el.reelWindow.classList.remove('win-flash'), 1300);
      /* 払い出し音: ブドウ8枚/14枚とベル14枚は専用音、他はGet1ループ→Get1Finish */
      const hasGrape = wins.some(w => w.role === 'GRAPE');
      const hasBell = wins.some(w => w.role === 'BELL');
      if (hasGrape || hasBell) {
        audio.playSE(pay >= 14 ? 'GRAPE14' : 'GRAPE8');
      } else {
        audio.get1Loop(pay); // ピエロ・チェリー等: (枚数-1)回ループ後にGet1Finish
      }
    }
    if (hasReplay) {
      state.replayPending = bet;
      el.lampReplay.classList.add('on');
      message('REPLAY! もう一度レバーON!');
      audio.playSE('REPLAY');
    }

    /* ボーナス中の進行 */
    if (state.inBonus) {
      state.bonusPaid += pay;
      const limit = state.bonusType === 'BB' ? BB_LIMIT : RB_LIMIT;
      if (state.bonusPaid > limit) {
        endBonus();
      } else {
        message(`${state.bonusType === 'BB' ? 'BIG' : 'REGULAR'} BONUS 中!  ${state.bonusPaid} / ${limit}枚`);
      }
    } else if (!hasReplay) {
      if (state.lampLit) message('GOGO!CHANCE!! ボーナス図柄を狙え!', true);
      else if (pay > 0) message(`${pay}枚の払い出し!`);
      else message('');
    }
  }

  state.bet = 0;
  state.gamePhase = 'idle';
  saveGame();
  updateUI();
}

function addPayout(n) {
  state.totalOut += n;
  let rest = n;
  const toCredit = Math.min(CREDIT_MAX - state.credit, rest);
  state.credit += toCredit;
  rest -= toCredit;
  state.mochi += rest; // クレジット超過分は下皿(持ちメダル)へ
}

/* --- ボーナス --- */
function startBonus(type) {
  state.inBonus = true;
  state.bonusType = type;
  state.bonusPaid = 0;
  state.bonusFlag = null;
  state.smallFlag = null;
  state.pendingHist = { g: state.counts.start, t: type }; // 履歴グラフ用
  if (type === 'BB') state.counts.bb++; else state.counts.rb++;
  unlightLamp();
  el.topBanner.classList.add('bonus-flash');
  message(type === 'BB' ? 'BIG BONUS!! (最大+252枚)' : 'REGULAR BONUS!! (最大+96枚)', true);
  if (type === 'BB') {
    // 777揃い: BBhit1/2を50%ずつ → 終了後にBB BGMループ
    const hit = Math.random() < 0.5 ? 'BBHIT1' : 'BBHIT2';
    audio.playBGMOnce(hit, () => { if (state.inBonus && state.bonusType === 'BB') audio.playBGM('BB'); });
  } else {
    audio.playBGM('RB'); // RB終了まで即ループ
  }
}

function endBonus() {
  const got = state.bonusPaid;
  const type = state.bonusType;
  state.inBonus = false;
  state.bonusType = null;
  state.bonusPaid = 0;
  state.counts.start = 0;
  /* 履歴グラフ: 左端(進行中)を確定して右へシフト */
  if (state.pendingHist) {
    state.history.unshift(state.pendingHist);
    if (state.history.length > 9) state.history.length = 9;
    state.pendingHist = null;
  }
  el.topBanner.classList.remove('bonus-flash');
  message(`${type === 'BB' ? 'BIG' : 'REGULAR'} BONUS 終了! ${got}枚獲得!`);
  audio.stopBGM(); // BB.mp3 / RB.mp3 を即停止
  if (type === 'BB') {
    // BBFinish再生終了まで次ゲーム不可(BET不可状態)
    state.betLock = true;
    audio.playBGMOnce('BBFINISH', () => { state.betLock = false; updateUI(); });
  }
}

/* --- 貸出 / 精算 --- */
function rentCoins() {
  if (state.gamePhase !== 'idle') return;
  state.investYen += 1000;
  let coins = 50;
  const toCredit = Math.min(CREDIT_MAX - state.credit, coins);
  state.credit += toCredit;
  state.mochi += coins - toCredit;
  audio.playSE('BET', true);
  message('メダル50枚 貸出しました');
  saveGame();
  updateUI();
}

function payback() {
  if (state.gamePhase !== 'idle' || state.bet > 0) return;
  if (state.credit === 0) return;
  state.mochi += state.credit;
  state.credit = 0;
  audio.playSE('BET', true);
  message('クレジットを精算しました');
  saveGame();
  updateUI();
}

/* ================= UI更新 ================= */
function updateUI() {
  el.segCredit.textContent = String(state.credit);
  el.segBonus.textContent = state.inBonus ? String(state.bonusPaid) : '---';
  el.wMochi.textContent = String(state.mochi);
  el.wInvest.textContent = state.investYen.toLocaleString();
  const diff = state.totalOut - state.totalIn;
  el.wDiff.textContent = (diff >= 0 ? '+' : '') + diff;
  el.wDiff.style.color = diff >= 0 ? '#7fd4ff' : '#ff8a8a';

  el.dpBB.textContent = String(state.counts.bb);
  el.dpRB.textContent = String(state.counts.rb);
  el.dpStart.textContent = String(state.counts.start);
  el.dpTotal.textContent = String(state.counts.total);
  const bonusTotal = state.counts.bb + state.counts.rb;
  el.dpGosei.textContent = bonusTotal > 0 ? '1/' + (state.counts.total / bonusTotal).toFixed(1) : '1/---';

  // BETランプ
  const dispBet = state.replayPending || state.bet;
  el.betLamps.forEach((lamp, i) => lamp.classList.toggle('on', dispBet >= i + 1));

  const idle = state.gamePhase === 'idle' && !state.betLock;
  const betLocked = !idle || state.replayPending > 0 || state.inBonus;
  el.btnBet1.disabled = betLocked || state.bet >= 3;
  el.btnMaxBet.disabled = betLocked || state.bet >= 3;
  el.btnRent.disabled = !idle;
  el.btnPayback.disabled = !idle || state.bet > 0 || state.credit === 0;
  el.lever.classList.toggle('disabled', !idle);

  // ストップボタン
  el.stopBtns.forEach((btn, i) => {
    const canStop = state.gamePhase === 'spinning' && reels[i] && reels[i].mode === 'spin';
    btn.disabled = !canStop;
    btn.classList.toggle('active', canStop);
  });

  // Insert Medals ランプ
  const needBet = idle && state.bet === 0 && !state.replayPending && !state.inBonus;
  el.lampInsert.classList.toggle('on', needBet);
  el.lampReplay.classList.toggle('on', state.replayPending > 0);
  renderGraph();
}

/* ================= ボーナス履歴グラフ (横10列×縦9段) ================= */
const GRAPH_COLS = 10, GRAPH_ROWS = 9;
let graphCells = []; // [列][段(下から)]
function buildGraph() {
  if (!el.bonusGraph) return;
  el.bonusGraph.innerHTML = '';
  graphCells = [];
  for (let c = 0; c < GRAPH_COLS; c++) {
    const col = document.createElement('div');
    col.className = 'bg-col';
    const cells = [];
    for (let r = 0; r < GRAPH_ROWS; r++) {
      const cell = document.createElement('div');
      cell.className = 'bg-cell';
      col.appendChild(cell); // column-reverseで下から積む
      cells.push(cell);
    }
    el.bonusGraph.appendChild(col);
    graphCells.push(cells);
  }
}

function renderGraph() {
  if (!graphCells.length) return;
  // 左端 = 進行中(現在のG数を緑で積み上げ、当選済みなら最下段に色)、右へ過去9件
  const cols = [ state.pendingHist || { g: state.counts.start, t: null } ];
  for (let i = 0; i < GRAPH_COLS - 1; i++) cols.push(state.history[i] || null);

  for (let c = 0; c < GRAPH_COLS; c++) {
    const data = cols[c];
    const cells = graphCells[c];
    // 緑の数 = floor(G/100)+1 (0〜99G=1個, 700G以上は8個で張り付き)
    const greens = data ? Math.min(GRAPH_ROWS - 1, Math.floor(data.g / 100) + 1) : 0;
    for (let r = 0; r < GRAPH_ROWS; r++) {
      const cell = cells[r];
      cell.className = 'bg-cell';
      if (!data) continue;
      if (r === 0) {
        if (data.t === 'BB') cell.classList.add('b');       // 最下段: BB=赤
        else if (data.t === 'RB') cell.classList.add('r');  // RB=黄
      } else if (r <= greens) {
        cell.classList.add('g');
      }
    }
  }
}

/* ストップボタンの有効化はリール加速完了を追従 */
setInterval(() => {
  if (state.gamePhase === 'spinning') updateUI();
}, 200);

/* ================= セーブ / ロード ================= */
function saveGame() {
  try {
    const data = {
      setting: state.setting, credit: state.credit, mochi: state.mochi,
      investYen: state.investYen, totalIn: state.totalIn, totalOut: state.totalOut,
      counts: state.counts, bonusFlag: state.bonusFlag,
      lampLit: state.lampLit, inBonus: state.inBonus,
      bonusType: state.bonusType, bonusPaid: state.bonusPaid,
      replayPending: state.replayPending,
      history: state.history, pendingHist: state.pendingHist,
      rareLamp: state.rareLamp,
      assist: state.assist,
      bgmOn: state.bgmOn, seOn: state.seOn,
      bgmVol: state.bgmVol, seVol: state.seVol
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) { /* localStorage不可環境では無視 */ }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    state.setting = d.setting || 1;
    state.credit = d.credit || 0;
    state.mochi = d.mochi || 0;
    state.investYen = d.investYen || 0;
    state.totalIn = d.totalIn || 0;
    state.totalOut = d.totalOut || 0;
    state.counts = d.counts || { bb: 0, rb: 0, total: 0, start: 0 };
    state.bonusFlag = d.bonusFlag || null;
    state.inBonus = !!d.inBonus;
    state.bonusType = d.bonusType || null;
    state.bonusPaid = d.bonusPaid || 0;
    state.replayPending = d.replayPending || 0;
    state.history = Array.isArray(d.history) ? d.history.slice(0, 9) : [];
    state.pendingHist = d.pendingHist || null;
    state.rareLamp = !!d.rareLamp;
    state.assist = !!d.assist;
    state.bgmOn = d.bgmOn !== false && d.sound !== false;
    state.seOn = d.seOn !== false && d.sound !== false;
    state.bgmVol = (typeof d.bgmVol === 'number') ? d.bgmVol : 0.7;
    state.seVol = (typeof d.seVol === 'number') ? d.seVol : 0.8;
    if (d.lampLit) lightLamp();
  } catch (e) { /* 破損時は初期状態 */ }
}

function resetData() {
  state.counts = { bb: 0, rb: 0, total: 0, start: 0 };
  message('データをリセットしました');
  saveGame();
  updateUI();
}

function resetAll() {
  Object.assign(state, {
    credit: 0, mochi: 0, investYen: 0, totalIn: 0, totalOut: 0,
    bet: 0, replayPending: 0, bonusFlag: null, smallFlag: null,
    inBonus: false, bonusType: null, bonusPaid: 0,
    history: [], pendingHist: null, betLock: false, rareLamp: false,
    counts: { bb: 0, rb: 0, total: 0, start: 0 }
  });
  audio.stopBGM();
  unlightLamp();
  el.topBanner.classList.remove('bonus-flash');
  message('全てリセットしました。メダルを借りてゲームスタート!');
  saveGame();
  updateUI();
}

/* ================= モーダル ================= */
function openModal() {
  if (state.gamePhase !== 'idle') return;
  el.modalOverlay.hidden = false;
  el.chkAssist.checked = state.assist;
  el.chkBgm.checked = state.bgmOn;
  el.chkSe.checked = state.seOn;
  el.volBgm.value = Math.round(state.bgmVol * 100);
  el.volSe.value = Math.round(state.seVol * 100);
  refreshSettingBtns();
}
function closeModal() { el.modalOverlay.hidden = true; }
function refreshSettingBtns() {
  document.querySelectorAll('.setting-btn').forEach(btn => {
    btn.classList.toggle('selected', Number(btn.dataset.s) === state.setting);
  });
  el.currentSetting.textContent = `現在:設定${state.setting}`;
}

/* ================= イベント登録 ================= */
function bindEvents() {
  // レバー / BET / サブボタン
  el.lever.addEventListener('pointerdown', () => { audio.ensure(); leverOn(); });
  el.btnBet1.addEventListener('pointerdown', () => { audio.ensure(); addBet(1); });
  el.btnMaxBet.addEventListener('pointerdown', () => { audio.ensure(); setMaxBet(); });
  el.btnRent.addEventListener('pointerdown', () => { audio.ensure(); rentCoins(); });
  el.btnPayback.addEventListener('pointerdown', () => { audio.ensure(); payback(); });
  el.btnMenu.addEventListener('pointerdown', () => { audio.ensure(); openModal(); });

  // ストップボタン (押下=停止 / 離す=後ペカ判定)
  el.stopBtns.forEach((btn, i) => {
    btn.addEventListener('pointerdown', e => { e.preventDefault(); audio.ensure(); pressStop(i); });
  });
  window.addEventListener('pointerup', onStopRelease);

  // モーダル
  $('btnCloseModal').addEventListener('click', closeModal);
  el.modalOverlay.addEventListener('click', e => { if (e.target === el.modalOverlay) closeModal(); });
  document.querySelectorAll('.setting-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.setting = Number(btn.dataset.s);
      refreshSettingBtns();
      saveGame();
    });
  });
  el.chkAssist.addEventListener('change', () => { state.assist = el.chkAssist.checked; saveGame(); });
  el.chkBgm.addEventListener('change', () => {
    state.bgmOn = el.chkBgm.checked;
    if (!state.bgmOn) audio.stopBGM();
    else if (state.inBonus) audio.playBGM(state.bonusType); // ボーナス中ならBGM再開
    saveGame();
  });
  el.chkSe.addEventListener('change', () => { state.seOn = el.chkSe.checked; saveGame(); });
  el.volBgm.addEventListener('input', () => {
    state.bgmVol = el.volBgm.value / 100;
    audio.setBgmVolume(state.bgmVol);
  });
  el.volBgm.addEventListener('change', saveGame);
  el.volSe.addEventListener('input', () => { state.seVol = el.volSe.value / 100; });
  el.volSe.addEventListener('change', () => { audio.playSE('BET'); saveGame(); });
  $('btnResetData').addEventListener('click', () => { resetData(); });
  $('btnResetAll').addEventListener('click', () => { resetAll(); closeModal(); });

  // キーボード操作 (PC)
  const keyMap = { '1': 0, '2': 1, '3': 2, 'j': 0, 'k': 1, 'l': 2 };
  document.addEventListener('keydown', e => {
    if (e.repeat) return;
    if (!el.modalOverlay.hidden) return;
    audio.ensure();
    const k = e.key.toLowerCase();
    if (k === ' ' || k === 'enter') { e.preventDefault(); leverOn(); }
    else if (k in keyMap) pressStop(keyMap[k]);
    else if (k === 'm') setMaxBet();
    else if (k === 'b') addBet(1);
  });
  document.addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    if (k in { '1':1,'2':1,'3':1,'j':1,'k':1,'l':1 }) onStopRelease();
  });

  window.addEventListener('resize', layoutReels);
}

/* ================= 初期化 ================= */
function init() {
  audio.init();
  loadGame();
  for (let i = 0; i < 3; i++) reels.push(new Reel(i));
  layoutReels();
  buildGraph();
  bindEvents();

  if (state.inBonus) {
    const limit = state.bonusType === 'BB' ? BB_LIMIT : RB_LIMIT;
    message(`${state.bonusType === 'BB' ? 'BIG' : 'REGULAR'} BONUS 中!  ${state.bonusPaid} / ${limit}枚`);
    el.topBanner.classList.add('bonus-flash');
    audio.playBGM(state.bonusType); // リロード時はBGM再開(初回操作後に再生開始)
  } else if (state.lampLit) {
    message('GOGO!CHANCE!! ボーナス図柄を狙え!', true);
  } else if (state.credit === 0 && state.mochi === 0) {
    message('メダルを借りてゲームスタート!');
  } else {
    message('');
  }
  updateUI();
  requestAnimationFrame(loop);
}

document.addEventListener('DOMContentLoaded', init);
