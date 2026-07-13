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
const curSpeed   = () => SPEED * state.reelSpeed; // リール回転速度倍率を適用
const DECEL_KOMA = 1.05;   // 減速に使うコマ数
const WAIT_MS    = 4100;   // ゲーム間ウェイト(4.1秒規定)
const BB_LIMIT   = 280;    // BB: 280枚を超える払い出しで終了
const RB_LIMIT   = 98;     // RB: 98枚を超える払い出しで終了
const PAY_CAP    = 15;     // 1ゲームの払い出し上限
const COUNT_MS   = 100;    // メダル数字カウント & Get1.mp3ループ間隔 (調整用)
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
  reelsStopped: 0,     // 物理的に停止し終わったリール数
  lastStopPressAt: 0,  // 最後に停止操作を受け付けた時刻 (0.15秒ガード用)
  bonusCountHold: false, // ボーナス終了後もCOUNTを表示し続けるフラグ
  bonusCountFinal: 0,    // その時の最終COUNT値 (294/112)
  bbWinG: 0,             // BB当選時のG数 (楽曲バージョン判定用)
  bonusVer: 'NORMAL',    // 進行中BBの楽曲バージョン
  thirdStopPressed: false,
  lastSpinStart: 0,
  pressOrder: [],      // 停止ボタンを押した順番 (Stop7判定用)
  betLock: false,      // BBFinish再生中はBET/レバー不可
  payoutLock: false,   // Get系mp3再生中は操作不可(音被り防止)
  rareLamp: false,     // 中段チェリー契機ボーナス(レインボー点灯)
  history: [],         // ボーナス履歴グラフ {g, t} 新しい順・最大9件
  pendingHist: null,   // 進行中ボーナスの履歴 {g, t}
  kaishuYen: 0,        // 回収額(精算で円に変換した合計)
  forceBonus: false,   // 次ゲームでGOGO!確定(1回)
  reelSpeed: 1,        // リール回転速度倍率 (0.25 / 0.5 / 1)
  autoMode: false,     // Auto Mode
  msgBarOn: false,     // メッセージバー表示 (デフォルトOFF)
  payTarget: 0,        // PAY OUT表示の目標値 (カウントアップ演出用)
  gogoSndEnd: 0,       // GOGOCHANCE.mp3の再生終了時刻 (SE被り防止)
  bgmOn: true,
  seOn: true,
  bgmVol: 0.5,
  seVol: 0.35
};

/* ================= サウンド (BGM/SE ファイル再生) ================= */
const BGM_FILES = {
  BB: './BGM/BB.mp3', RB: './BGM/RB.mp3', BBFINISH: './BGM/BBFinish.mp3',
  BBHIT1: './BGM/BBhit1.mp3', BBHIT2: './BGM/BBhit2.mp3',
  /* シークレットver (前回ボーナス終了から1GでBB) */
  BBHITSP: './BGM/BBhitSP.mp3', BBSP: './BGM/BBSP.mp3', BBFINISHSP: './BGM/BBFinishSP.mp3',
  /* 第九ver (2〜5GでBB) */
  BBHITD9: './BGM/BBhitD9.mp3', BBD9: './BGM/BBD9.mp3', BBFINISHD9: './BGM/BBFinishD9.mp3',
  /* 運命ver (100G以内のゾロ目・77除く) hit音なしで即再生 */
  BBUNMEI: './BGM/BBUnmei.mp3', BBFINISHUNMEI: './BGM/BBFinishUnmei.mp3',
  /* 777ver (77GピッタリでBB) */
  BBHITX: './BGM/BBhitX.mp3', BBX: './BGM/BBX.mp3', BBFINISHX: './BGM/BBFinishX.mp3'
};

/* BBボーナス楽曲バージョン定義 (hit: null=BBhit1/2の50%抽選, 'NONE'=hitなし即ループ) */
const BB_VERS = {
  NORMAL: { hit: null,      loop: 'BB',      fin: 'BBFINISH',      grape: 'GRAPE14' },
  SP:     { hit: 'BBHITSP', loop: 'BBSP',    fin: 'BBFINISHSP',    grape: 'GRAPE14SP' },
  D9:     { hit: 'BBHITD9', loop: 'BBD9',    fin: 'BBFINISHD9',    grape: 'GRAPE14' },
  UNMEI:  { hit: 'NONE',    loop: 'BBUNMEI', fin: 'BBFINISHUNMEI', grape: 'GRAPE14' },
  X:      { hit: 'BBHITX',  loop: 'BBX',     fin: 'BBFINISHX',     grape: 'GRAPE14X' }
};

/* BB当選時のG数(前回ボーナス終了から)で楽曲バージョンを決定 */
function pickBBVersion(g) {
  if (g === 1) return 'SP';                          // シークレット
  if (g >= 2 && g <= 5) return 'D9';                 // 第九
  if (g === 77) return 'X';                          // 777(オリジナル)
  if (g >= 11 && g <= 99 && g % 11 === 0) return 'UNMEI'; // 運命(ゾロ目・77は上で除外済み)
  return 'NORMAL';
}
const SE_FILES = {
  BET: './SE/Bet.mp3', MAXBET2: './SE/MaxBet2.mp3', MAXBET3: './SE/MaxBet3.mp3',
  LEVER: './SE/Lever.mp3', STOP: './SE/Stop.mp3', STOP7: './SE/Stop7.mp3',
  GRAPE8: './SE/GetGrape8.mp3', GRAPE14: './SE/GetGrape14.mp3',
  GRAPE14SP: './SE/GetGrape14SP.mp3', GRAPE14X: './SE/GetGrape14X.mp3',
  GET1: './SE/Get1.mp3', GET1FIN: './SE/Get1Finish.mp3',
  REPLAY: './SE/ReplayBet.mp3', GOGO: './SE/GOGOCHANCE.mp3'
};

const audio = {
  ctx: null, buffers: {}, seGain: null, bgmGain: null,
  se: {}, bgm: {}, bgmSrc: null, bgmFallbackEl: null,
  init() {
    /* HTMLAudio (file://直開きなどWebAudioが使えない場合のフォールバック) */
    try {
      for (const k in SE_FILES) { const a = new Audio(SE_FILES[k]); a.preload = 'auto'; this.se[k] = a; }
      for (const k in BGM_FILES) { const a = new Audio(BGM_FILES[k]); a.preload = 'auto'; this.bgm[k] = a; }
    } catch (e) { /* Audio非対応 */ }
    /* Web Audio: 低遅延再生 + iOSでも音量調整が効く */
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    this.seGain = this.ctx.createGain();
    this.seGain.connect(this.ctx.destination);
    this.bgmGain = this.ctx.createGain();
    this.bgmGain.connect(this.ctx.destination);
    this.applyVolumes();
    const loadBuf = (key, url) => {
      fetch(url)
        .then(r => { if (!r.ok) throw new Error(); return r.arrayBuffer(); })
        .then(ab => new Promise((res, rej) => {
          const p = this.ctx.decodeAudioData(ab, res, rej);
          if (p && p.then) p.then(res, rej);
        }))
        .then(buf => { this.buffers[key] = buf; })
        .catch(() => { /* 失敗時はHTMLAudioで再生 */ });
    };
    for (const k in SE_FILES) loadBuf(k, SE_FILES[k]);
    for (const k in BGM_FILES) loadBuf(k, BGM_FILES[k]);
  },
  ensure() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    // リロード後のボーナス中BGM復帰(初回操作時)
    if (state.inBonus && state.bgmOn && !this.bgmSrc && !this.bgmFallbackEl) this.playBGM(state.bonusType);
  },
  applyVolumes() {
    if (this.seGain) this.seGain.gain.value = state.seVol;
    if (this.bgmGain) this.bgmGain.gain.value = state.bgmVol;
    if (this.bgmFallbackEl) this.bgmFallbackEl.volume = state.bgmVol;
  },
  /* 音声の長さ(ms)を取得 (未ロード時はfallbackMs) */
  duration(key, fallbackMs = 500) {
    const b = this.buffers[key];
    if (b) return b.duration * 1000;
    const a = this.se[key] || this.bgm[key];
    if (a && isFinite(a.duration) && a.duration > 0) return a.duration * 1000;
    return fallbackMs;
  },
  playSE(key, overlap = true) {
    if (!state.seOn) return;
    const buf = this.buffers[key];
    if (buf && this.ctx) {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.seGain);
      src.start();
      return;
    }
    const base = this.se[key];
    if (!base) return;
    const a = overlap ? base.cloneNode() : base;
    a.volume = state.seVol;
    if (!overlap) a.currentTime = 0;
    a.play().catch(() => {});
  },
  playBGM(key) {
    this.stopBGM();
    if (!state.bgmOn) return;
    const buf = this.buffers[key];
    if (buf && this.ctx) {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(this.bgmGain);
      src.start();
      this.bgmSrc = src;
      return;
    }
    const base = this.bgm[key];
    if (!base) return;
    base.loop = true;
    base.volume = state.bgmVol;
    base.currentTime = 0;
    base.play().catch(() => {});
    this.bgmFallbackEl = base;
  },
  stopBGM() {
    if (this.bgmSrc) { try { this.bgmSrc.stop(); } catch (e) {} this.bgmSrc = null; }
    if (this.bgmFallbackEl) { this.bgmFallbackEl.pause(); this.bgmFallbackEl.loop = false; this.bgmFallbackEl = null; }
  },
  /* BGMカテゴリの単発再生 (BBhit/BBFinish) onEndは必ず1回呼ばれる */
  playBGMOnce(key, onEnd) {
    let done = false;
    const fin = () => { if (!done) { done = true; if (onEnd) onEnd(); } };
    if (!state.bgmOn) { fin(); return; }
    const buf = this.buffers[key];
    if (buf && this.ctx) {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.bgmGain);
      src.onended = fin;
      src.start();
      setTimeout(fin, buf.duration * 1000 + 800); // 保険
      return;
    }
    const base = this.bgm[key];
    if (!base) { fin(); return; }
    base.loop = false;
    base.volume = state.bgmVol;
    base.currentTime = 0;
    base.onended = fin;
    base.onerror = fin;
    base.play().catch(fin);
  },
  setBgmVolume() { this.applyVolumes(); },
  /* Get1をn回一定間隔でループ→最後にGet1Finish (間隔を空けず一定速度) */
  get1Loop(coins) {
    if (!state.seOn) return;
    const n = Math.max(0, coins - 1);
    const INTERVAL = COUNT_MS; // Get1.mp3ループ間隔(数字カウントと同期)
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
  msgBar: $('msgBar'), gogoLamp: $('gogoLamp'), gogoImg: $('gogoImg'), gogoImgOn: $('gogoImgOn'),
  lever: $('lever'), reelWindow: $('reelWindow'), topBanner: $('topBanner'),
  betLamps: [$('betLamp1'), $('betLamp2'), $('betLamp3')],
  lampStart: $('lampStart'), lampReplay: $('lampReplay'), lampWait: $('lampWait'), lampInsert: $('lampInsert'),
  stopBtns: [$('stop0'), $('stop1'), $('stop2')],
  btnRent: $('btnRent'), btnBet1: $('btnBet1'), btnMaxBet: $('btnMaxBet'),
  btnPayback: $('btnPayback'), btnMenu: $('btnMenu'),
  modalOverlay: $('modalOverlay'), currentSetting: $('currentSetting'),
  chkBgm: $('chkBgm'), chkSe: $('chkSe'),
  chkAuto: $('chkAuto'), btnForcePeka: $('btnForcePeka'),
  chkMsgBar: $('chkMsgBar'),
  volBgm: $('volBgm'), volSe: $('volSe'), bonusGraph: $('bonusGraph'),
  wKaishu: $('wKaishu')
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
  let grapePaid = false;
  for (const w of wins) {
    switch (w.role) {
      case 'GRAPE':
        /* ブドウが複数ラインで同時成立しても払い出しは1回分(本家準拠) */
        if (!grapePaid) { total += (bet === 3 ? 8 : 14); grapePaid = true; }
        break;
      case 'BELL':   total += 14; break;
      case 'CLOWN':  total += 10; break;
      case 'CHERRY': total += (bet === 3 ? 1 : 7); break; // 角チェリーは2ライン=2回分(本家準拠)
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

  // 押した位置からの候補(ビタ〜スベリ 最大4コマ)
  let base = Math.floor(curPos);
  if (curPos - base < 0.2) base = base - 1; // 最低限の移動距離を確保
  const candidates = [];
  for (let s = 0; s <= MAX_SLIP; s++) candidates.push({ slip: s, p: modK(base - s) });

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
    // ブドウ: 引き込みが「保証された」形を全て同格に扱う(出目バリエーション用)
    // ※保証のない候補はランダム選択の対象にしない(取りこぼし防止)
    if (flagRole === 'GRAPE') {
      return penalty + (guaranteed > 0 ? 0 : 100);
    }
    // 保証ラインを最優先 → live数 → スベリ少で選択
    return penalty + (guaranteed > 0 ? 0 : 100) + (10 - live);
  };

  let bestScore = Infinity;
  for (const cand of candidates) {
    cand.score = scoreOf(cand);
    if (cand.score < bestScore) bestScore = cand.score;
  }
  const bestList = candidates.filter(c => c.score === bestScore); // スベリ昇順のまま
  /* ブドウは到達可能な成立パターン全てから毎回ランダムに1つ選ぶ(斜め偏り防止) */
  if (flagRole === 'GRAPE' && bestList.length > 1) {
    return bestList[Math.floor(Math.random() * bestList.length)].p;
  }
  return bestList[0].p; // 通常は最小スベリ
}

/* Auto Mode用: 今押せばボーナス図柄を有効ラインに引き込めるか(人間の目押し相当) */
function bonusAimOk(reelIdx, pos) {
  if (!state.bonusFlag || state.smallFlag) return true; // 狙う必要のないゲーム
  const target = TARGETS[state.bonusFlag];
  const p = chooseStopPosition(reelIdx, pos);
  const cols = state.cols.slice();
  cols[reelIdx] = windowCol(reelIdx, p);
  return LINES.some(rows => {
    for (let c = 0; c < 3; c++) {
      const t = target[c];
      if (t == null) continue;
      const cc = cols[c];
      if (!cc) continue; // 未停止リールは後で狙う
      if (cc[rows[c]] !== t) return false;
    }
    return true;
  });
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
      const sym = REEL_DATA[this.idx][i % KOMA];
      img.src = SYM_IMG[sym];
      img.dataset.sym = String(sym);
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
    if (this.mode !== 'spin' || this.v < curSpeed() * 0.95) return false;
    const target = chooseStopPosition(this.idx, this.pos);
    this.target = target;
    /* 押した瞬間に出目は確定するため、ここで記録する。
       これにより次のリールの停止制御が「まだ減速中のリール」の結果も
       正しく考慮できる(素早い連打・Auto時にブドウ等を取りこぼす競合の修正) */
    state.cols[this.idx] = windowCol(this.idx, target);
    this.remain = mod(this.pos - target, KOMA);
    if (this.remain < 0.15) this.remain += KOMA; // 極端に短い場合は1周
    this.mode = 'stopping';
    return true;
  }
  update(dt, now) {
    if (this.mode === 'spin') {
      if (now < this.spinDelay) return;
      // 加速
      const V = curSpeed();
      if (now < this.accelUntil) {
        this.v = Math.min(V, this.v + V * dt / 180);
      } else {
        this.v = V;
      }
      this.pos = mod(this.pos - this.v * dt, KOMA);
    } else if (this.mode === 'stopping') {
      // 残距離に応じて減速 (実機風のヌルッとした止まり方)
      const ratio = Math.min(1, this.remain / DECEL_KOMA);
      const v = curSpeed() * Math.max(0.28, ratio);
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
    // ぼかしは目押しの妨げになるため廃止(常にクッキリ表示)
  }
  resize(cellH) {
    this.cellH = cellH;
    this.render();
  }
}

const reels = [];

/* ================= モバイル負荷対策: シンボル画像の縮小キャッシュ ================= */
/* 1280x470の原寸画像を126セルにそのまま敷き詰めるとスマホのGPU負荷が高くラグの原因に
   なるため、読み込み後に320x180へ縮小したデータURLに差し替える(見た目は変わらない) */
function optimizeSymbolImages() {
  const W = 512, H = 188; // 1280x470と同比率で縮小(512×470/1280=188ピッタリ)
  for (const sym in SYM_IMG) {
    const src = new Image();
    src.onload = () => {
      try {
        const cv = document.createElement('canvas');
        cv.width = W; cv.height = H;
        cv.getContext('2d').drawImage(src, 0, 0, W, H);
        const url = cv.toDataURL('image/jpeg', 0.9); // 白背景・非透過なのでJPEGでOK
        document.querySelectorAll('img[data-sym="' + sym + '"]').forEach(im => { im.src = url; });
      } catch (e) { /* file://直開き等でcanvasが使えない場合は原寸のまま表示 */ }
    };
    src.src = SYM_IMG[sym];
  }
}

/* リールサイズ調整 (画像1280x470 → セルを同比率でピッタリ収める) */
function layoutReels() {
  const reelEl = $('reel0');
  const w = reelEl.getBoundingClientRect().width;
  const cellH = Math.round(w * 470 / 1280); // 画像は1280x470(実機風トリミング済み)
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

/* メッセージバーの表示/非表示 (OFF時は下のパネルが上に詰まる) */
function applyMsgBar() {
  el.msgBar.hidden = !state.msgBarOn;
}

/* --- BET --- */
/* 持ちメダル = 総所持枚数(クレジット含む)。消費時は両方同時に減る */
function tryConsumeCoins(n) {
  if (state.credit < n) {
    const avail = state.mochi - state.credit; // クレジット外の持ちメダル
    const move = Math.min(CREDIT_MAX - state.credit, avail);
    if (move > 0) state.credit += move; // 自動投入
  }
  if (state.credit < n) return false;
  state.credit -= n;
  state.mochi -= n;
  return true;
}

function addBet(n) {
  if (state.gamePhase !== 'idle' || state.replayPending || state.inBonus || state.betLock || state.payoutLock) return;
  const newBet = Math.min(3, state.bet + n);
  const need = newBet - state.bet;
  if (need <= 0) return;
  if (!tryConsumeCoins(need)) { message('メダルが足りません! 貸出ボタンを押してください'); return; }
  state.bet = newBet;
  state.totalIn += need;
  audio.playSE('BET', true); // 重ね再生可
  animateMedals(COUNT_MS); // 1枚ずつ減らして表示
  updateUI();
}

function setMaxBet() {
  if (state.gamePhase !== 'idle' || state.replayPending || state.inBonus || state.betLock || state.payoutLock) return;
  const max = 3;
  const need = max - state.bet;
  if (need <= 0) return;
  if (!tryConsumeCoins(need)) { message('メダルが足りません! 貸出ボタンを押してください'); return; }
  state.bet = max;
  state.totalIn += need;
  audio.playSE('MAXBET3'); // 通常時3枚BET
  animateMedals(COUNT_MS); // 1枚ずつ減らして表示
  updateUI();
}

/* --- レバーON --- */
/* --- レバーON (自動BET時はMaxBet音とLever音の被り防止で遅延) ---
   betDelayMs: 自動BETからレバーまでの間隔 (手動/Space=1秒, Auto Mode=0.5秒) */
function leverOn(betDelayMs = 1000) {
  if (state.gamePhase !== 'idle' || state.betLock || state.payoutLock) return;

  let autoBetDelay = 0;
  if (state.replayPending) {
    state.bet = state.replayPending;
    state.replayPending = 0;
  } else if (state.inBonus) {
    if (state.bet === 0) {
      if (!tryConsumeCoins(2)) { message('メダルが足りません! 貸出ボタンを押してください'); return; }
      state.bet = 2;
      state.totalIn += 2;
      audio.playSE('MAXBET2'); // ボーナス中は2枚BET固定
      animateMedals(COUNT_MS);
      autoBetDelay = betDelayMs;
    }
  } else if (state.bet === 0) {
    // 未BETならMAXBET扱い(便利機能)
    if (!tryConsumeCoins(3)) { message('メダルが足りません! 貸出ボタンを押してください'); return; }
    state.bet = 3;
    state.totalIn += 3;
    audio.playSE('MAXBET3');
    animateMedals(COUNT_MS);
    autoBetDelay = betDelayMs;
  }

  state.gamePhase = 'prelever';
  updateUI();
  if (autoBetDelay > 0) setTimeout(fireLever, autoBetDelay);
  else fireLever();
}

function fireLever() {
  const now = performance.now();
  const waitRemain = state.lastSpinStart + WAIT_MS - now;

  state.gamePhase = 'spinning';
  el.lever.classList.add('pushed');
  setTimeout(() => el.lever.classList.remove('pushed'), 150);
  audio.playSE('LEVER');

  if (waitRemain > 30) {
    el.lampWait.classList.add('on');
    message('ウェイト中...');
    setTimeout(() => { el.lampWait.classList.remove('on'); startGame(); }, waitRemain);
  } else {
    startGame();
  }
  updateUI();
}

function startGame() {
  state.lastSpinStart = performance.now();
  state.cols = [null, null, null];
  state.stopsInitiated = 0;
  state.reelsStopped = 0;
  state.thirdStopPressed = false;
  state.pressOrder = [];
  state.payTarget = 0;
  disp.payout = 0;
  el.lampReplay.classList.remove('on');
  el.lampStart.classList.add('on');
  setTimeout(() => el.lampStart.classList.remove('on'), 400);

  /* --- 抽選 --- */
  if (state.inBonus) {
    state.smallFlag = 'GRAPE'; // ボーナス中は毎ゲームブドウ
  } else {
    const sp = SETTINGS[state.setting - 1];
    let newBonus = false, rareHit = false, dupCherry = false;
    const hadFlag = !!state.bonusFlag; // 楽曲判定用: このゲームで新規当選したか
    /* 設定メニュー「ペカ確定」: 確率無視でボーナスフラグ確定 + 第3停止離しで告知 */
    if (state.forceBonus) {
      state.forceBonus = false;
      if (!state.bonusFlag) {
        const ratio = sp.bb / (sp.bb + sp.rb);
        state.bonusFlag = Math.random() < ratio ? 'BB' : 'RB';
      }
      if (!state.lampLit) state.lampPending = true;
    }
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

    /* BB新規当選時の当選G数を記録 (揃えるまで数ゲーム持ち越しても当選G基準で楽曲を判定) */
    if (!hadFlag && state.bonusFlag === 'BB') {
      state.bbWinG = state.counts.start + 1; // このゲームのG数
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
  if (state.autoMode) scheduleAutoStops();
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
  /* 実機同様、停止操作は0.15秒間隔でしか受け付けない(十字キー等の同時押し防止) */
  const nowT = performance.now();
  if (nowT - state.lastStopPressAt < 150) return;
  const r = reels[i];
  if (!r.requestStop()) return;
  state.lastStopPressAt = nowT;
  state.pressOrder.push(i);
  state.stopsInitiated++;
  if (state.stopsInitiated === 3) state.thirdStopPressed = true;
  audio.playSE('STOP', true); // 重ね再生可
  el.stopBtns[i].disabled = true;
  el.stopBtns[i].classList.remove('active');
  el.stopBtns[i].classList.add('pushed'); // 離すまで押し込み状態を維持
}

function releaseStopVisual() {
  el.stopBtns.forEach(b => b.classList.remove('pushed'));
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
  el.gogoImgOn.hidden = false; // 事前読込済みの点灯画像を即時表示(音と同時)
  el.gogoLamp.classList.add('lit');
  el.gogoLamp.classList.toggle('rainbow', state.rareLamp); // 中段チェリー時はレインボー
  audio.playSE('GOGO');
  state.gogoSndEnd = performance.now() + (state.seOn ? audio.duration('GOGO', 1200) : 0);
}

function unlightLamp() {
  state.lampLit = false;
  state.lampPending = false;
  state.rareLamp = false;
  el.gogoImgOn.hidden = true;
  el.gogoLamp.classList.remove('lit', 'rainbow');
}

/* --- リール停止完了 --- */
function onReelStopped(idx, pos) {
  state.reelsStopped++;
  /* Stop7: 第1ボタン→第2ボタンの順で押し、7-7テンパイした時のみ再生 */
  if (idx === 1 && state.pressOrder[0] === 0 && state.pressOrder[1] === 1 && state.cols[0]) {
    const tenpai = LINES.some(rows =>
      state.cols[0][rows[0]] === SYM.SEVEN && state.cols[1][rows[1]] === SYM.SEVEN);
    if (tenpai) audio.playSE('STOP7');
  }
  if (state.reelsStopped === 3 && state.cols.every(Boolean)) {
    setTimeout(resolveGame, 120);
  }
}

/* --- 結果判定 --- */
function resolveGame() {
  if (state.gamePhase !== 'spinning') return; // 二重実行ガード(多重防御)
  const wins = evalWins(state.cols);
  const bet = state.bet;
  let pay = 0;
  let payoutSndMs = 0;

  /* ボーナス図柄整列チェック */
  const bonusAligned = state.bonusFlag && wins.some(w => w.role === state.bonusFlag);

  if (bonusAligned) {
    startBonus(state.bonusFlag);
  } else {
    pay = payoutFor(wins, bet);
    const hasReplay = wins.some(w => w.role === 'REPLAY');

    if (pay > 0) {
      addPayout(pay);
      state.payTarget = pay;
      el.reelWindow.classList.add('win-flash');
      setTimeout(() => el.reelWindow.classList.remove('win-flash'), 1300);
      /* GOGOCHANCE.mp3再生中(後ペカ直後)は鳴り終わるまで払い出し音を待つ(SE被り防止) */
      const gogoWait = Math.max(0, state.gogoSndEnd - performance.now());
      /* 払い出し音: ブドウ8枚/14枚とベル14枚は専用音、他はGet1ループ→Get1Finish */
      const hasGrape = wins.some(w => w.role === 'GRAPE');
      const hasBell = wins.some(w => w.role === 'BELL');
      let sndMs;
      if (hasGrape || hasBell) {
        let key = pay >= 14 ? 'GRAPE14' : 'GRAPE8';
        /* BB中はボーナス楽曲バージョンのブドウ専用音を使用 (SP/777ver) */
        if (state.inBonus && state.bonusType === 'BB' && hasGrape && pay >= 14) {
          key = (BB_VERS[state.bonusVer] || BB_VERS.NORMAL).grape;
        }
        if (gogoWait > 0) setTimeout(() => audio.playSE(key), gogoWait);
        else audio.playSE(key);
        sndMs = audio.duration(key, 900);
        animateMedals(COUNT_MS, gogoWait); // 1枚ずつ加算表示(COUNT_MS間隔)
      } else {
        if (gogoWait > 0) setTimeout(() => audio.get1Loop(pay), gogoWait);
        else audio.get1Loop(pay); // ピエロ・チェリー等: (枚数-1)回ループ後にGet1Finish
        sndMs = Math.max(0, pay - 1) * COUNT_MS + audio.duration('GET1FIN', 500);
        animateMedals(COUNT_MS, gogoWait); // Get1.mp3のループに同期して加算表示
      }
      /* Get系mp3の再生が終わるまで操作不可(Lever音との被り防止) */
      payoutSndMs = gogoWait + sndMs;
      if (state.seOn && payoutSndMs > 0) {
        state.payoutLock = true;
        setTimeout(() => { state.payoutLock = false; updateUI(); }, payoutSndMs);
      } else {
        payoutSndMs = 0; // SE OFF時はロックなし(カウント演出は上で開始済み)
      }
    }
    if (hasReplay) {
      state.replayPending = bet;
      el.lampReplay.classList.add('on');
      message('REPLAY! もう一度レバーON!');
      const gogoWaitR = Math.max(0, state.gogoSndEnd - performance.now());
      if (gogoWaitR > 0) setTimeout(() => audio.playSE('REPLAY'), gogoWaitR);
      else audio.playSE('REPLAY');
    }

    /* ボーナス中の進行 */
    if (state.inBonus) {
      state.bonusPaid += pay;
      const limit = state.bonusType === 'BB' ? BB_LIMIT : RB_LIMIT;
      if (state.bonusPaid > limit) {
        endBonus(payoutSndMs);
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
  /* Auto Mode: 払い出し音終了(+1秒)後に次ゲームへ */
  if (state.autoMode) autoNextGame(payoutSndMs + 1000);
}

function addPayout(n) {
  state.totalOut += n;
  state.mochi += n; // 持ちメダルは総所持枚数
  state.credit = Math.min(CREDIT_MAX, state.credit + n);
}

/* --- ボーナス --- */
function startBonus(type) {
  state.inBonus = true;
  state.bonusType = type;
  state.bonusPaid = 0;
  state.bonusCountHold = false;
  state.bonusCountFinal = 0;
  disp.bonus = 0;
  state.bonusFlag = null;
  state.smallFlag = null;
  state.pendingHist = { g: state.counts.start, t: type }; // 履歴グラフ用
  if (type === 'BB') state.counts.bb++; else state.counts.rb++;
  unlightLamp();
  el.topBanner.classList.add('bonus-flash');
  message(type === 'BB' ? 'BIG BONUS!! (最大+252枚)' : 'REGULAR BONUS!! (最大+96枚)', true);
  if (type === 'BB') {
    /* 当選G数から楽曲バージョンを決定 */
    state.bonusVer = pickBBVersion(state.bbWinG || 0);
    const v = BB_VERS[state.bonusVer] || BB_VERS.NORMAL;
    if (v.hit === 'NONE') {
      /* 運命ver: hit音なしで即メインBGM再生・ロックもなし(すぐ次ゲーム可) */
      audio.playBGM(v.loop);
    } else {
      /* 777揃い: hit音再生 → 終了後にメインBGMループ。
         hit再生中(BB BGM開始まで)はレバー等を無効化(フライング防止)。
         Auto Modeもこのロック中は自動で進行を待機する */
      const hit = v.hit || (Math.random() < 0.5 ? 'BBHIT1' : 'BBHIT2');
      state.betLock = true;
      audio.playBGMOnce(hit, () => {
        state.betLock = false;
        if (state.inBonus && state.bonusType === 'BB') audio.playBGM(v.loop);
        updateUI();
      });
    }
  } else {
    audio.playBGM('RB'); // RB終了まで即ループ
  }
}

function endBonus(payoutSndMs = 0) {
  const got = state.bonusPaid;
  const type = state.bonusType;
  state.inBonus = false;
  state.bonusType = null;
  state.bonusPaid = 0;
  state.counts.start = 0;
  /* COUNTは294(BB)/112(RB)まで表示しきってから消す(本家準拠) */
  state.bonusCountHold = true;
  state.bonusCountFinal = got;
  /* 履歴グラフ: 左端(進行中)を確定して右へシフト */
  if (state.pendingHist) {
    state.history.unshift(state.pendingHist);
    if (state.history.length > 9) state.history.length = 9;
    state.pendingHist = null;
  }
  el.topBanner.classList.remove('bonus-flash');
  message(`${type === 'BB' ? 'BIG' : 'REGULAR'} BONUS 終了! ${got}枚獲得!`);
  const hideCount = () => {
    state.bonusCountHold = false;
    state.bonusCountFinal = 0;
    disp.bonus = 0;
    renderMedals();
  };
  /* 最終ゲーム分のカウントアップが表示しきるまでの時間 */
  const countUpMs = COUNT_MS * 14 + 100;
  /* BBはBBFinish.mp3が鳴り終わるまでMAXBET/レバー/停止ボタン無効 */
  if (type === 'BB') state.betLock = true;
  /* 最後のGetGrape14.mp3が停止した瞬間にBB.mp3/RB.mp3を停止 */
  setTimeout(() => {
    audio.stopBGM();
    if (type === 'BB') {
      /* BB BGM停止から0.1秒後にバージョン対応のFinishを再生 →
         再生終了+1秒後にCOUNT表示を消す */
      const finKey = (BB_VERS[state.bonusVer] || BB_VERS.NORMAL).fin;
      setTimeout(() => {
        audio.playBGMOnce(finKey, () => {
          state.betLock = false;
          updateUI();
          setTimeout(hideCount, 1000);
        });
      }, 100);
    }
  }, Math.max(0, payoutSndMs));
  /* RBは112になった瞬間から0.5秒後にCOUNT表示を消す */
  if (type === 'RB') setTimeout(hideCount, countUpMs + 500);
}

/* --- 貸出 / 精算 --- */
function rentCoins() {
  if (state.gamePhase !== 'idle' || state.betLock || state.payoutLock) return;
  state.investYen += 1000;
  state.mochi += 50;
  state.credit = Math.min(CREDIT_MAX, state.credit + 50);
  audio.playSE('BET', true);
  syncMedalDisplay(); // 貸出は一気に反映
  message('メダル50枚 貸出しました');
  saveGame();
  updateUI();
}

function payback() {
  if (state.gamePhase !== 'idle' || state.bet > 0 || state.betLock || state.payoutLock) return;
  if (state.mochi <= 0) return;
  const yen = state.mochi * 20; // 1枚 = 20円
  state.kaishuYen += yen;
  state.mochi = 0;
  state.credit = 0;
  audio.playSE('BET', true);
  syncMedalDisplay(); // 精算は一気に反映
  message(`精算しました! ${yen.toLocaleString()}円を回収`);
  saveGame();
  updateUI();
}

/* ================= Auto Mode ================= */
const autoTimers = [];
function autoSchedule(fn, ms) {
  const id = setTimeout(() => {
    const idx = autoTimers.indexOf(id);
    if (idx >= 0) autoTimers.splice(idx, 1);
    if (!state.autoMode) return;
    fn();
  }, ms);
  autoTimers.push(id);
}
function autoClearTimers() {
  autoTimers.forEach(clearTimeout);
  autoTimers.length = 0;
}
/* レバーON後: Lever.mp3終了+1秒で第1停止 → 0.15秒間隔で第2・第3停止 */
function scheduleAutoStops() {
  const base = audio.duration('LEVER', 300) + 500; // Lever.mp3終了から0.5秒後に第1停止へ
  autoSchedule(() => autoPress(0), base);
}
function autoPress(i) {
  if (state.gamePhase !== 'spinning') return;
  const r = reels[i];
  /* リールが定速に達するまで待つ */
  if (r.mode !== 'spin' || r.v < curSpeed() * 0.95) {
    autoSchedule(() => autoPress(i), 60);
    return;
  }
  /* GOGO!CHANCE中は7(RBは右BAR)を引き込める瞬間までポーリングして押す(人間の目押し風) */
  if (!bonusAimOk(i, r.pos)) {
    if (!r.autoAimStart) r.autoAimStart = performance.now();
    if (performance.now() - r.autoAimStart < 5000) {
      autoSchedule(() => autoPress(i), 30);
      return;
    }
    /* 5秒狙えなければ諦めて押す(保険・通常発生しない) */
  }
  r.autoAimStart = 0;
  pressStop(i);
  autoSchedule(() => {
    el.stopBtns[i].classList.remove('pushed');
    if (i === 2) onStopRelease(); // 第3停止ボタンを離す(後ペカ発生タイミング)
  }, 180);
  if (i < 2) autoSchedule(() => autoPress(i + 1), 250); // 次のボタンまで0.25秒
}
/* 次ゲームへ (betLock/payoutLock中はリトライ) */
function autoNextGame(delayMs) {
  autoSchedule(() => {
    if (state.gamePhase !== 'idle' || state.betLock || state.payoutLock || !el.modalOverlay.hidden) {
      autoNextGame(250);
      return;
    }
    leverOn(500); // Auto: MAXBET→0.5秒→レバー (リプレイ時はそのままレバー)
  }, delayMs);
}

/* ================= メダル表示のカウントアップ演出 ================= */
/* 実際の値(state)と表示値(disp)を分離し、1枚ずつ増減して見せる */
const disp = { credit: 0, mochi: 0, payout: 0, bonus: 0 };
let medalTimer = null;

function medalTargets() {
  return {
    credit: state.credit,
    mochi: state.mochi,
    payout: state.payTarget,
    bonus: state.inBonus ? state.bonusPaid : (state.bonusCountHold ? state.bonusCountFinal : 0)
  };
}
function renderMedals() {
  el.segCredit.textContent = String(disp.credit);
  el.wMochi.textContent = String(disp.mochi);
  el.segPayout.textContent = String(disp.payout);
  el.segBonus.textContent = (state.inBonus || state.bonusCountHold) ? String(disp.bonus) : '---';
}
/* 一気に反映 (貸出・精算・リセット・ロード時) */
function syncMedalDisplay() {
  if (medalTimer) { clearInterval(medalTimer); medalTimer = null; }
  Object.assign(disp, medalTargets());
  renderMedals();
}
/* 1枚ずつ増減 (intervalMs間隔 / delayMs後に開始) */
function animateMedals(intervalMs, delayMs = 0) {
  if (medalTimer) { clearInterval(medalTimer); medalTimer = null; }
  const start = () => {
    if (medalTimer) clearInterval(medalTimer);
    medalTimer = setInterval(() => {
      const t = medalTargets();
      let moved = false;
      for (const k in disp) {
        if (disp[k] < t[k]) { disp[k]++; moved = true; }
        else if (disp[k] > t[k]) { disp[k]--; moved = true; }
      }
      renderMedals();
      if (!moved) { clearInterval(medalTimer); medalTimer = null; }
    }, intervalMs);
  };
  if (delayMs > 0) setTimeout(start, delayMs); else start();
}

/* ================= UI更新 ================= */
function updateUI() {
  renderMedals();
  el.wInvest.textContent = state.investYen.toLocaleString();
  el.wKaishu.textContent = state.kaishuYen.toLocaleString();
  const diffYen = state.kaishuYen - state.investYen;
  el.wDiff.textContent = (diffYen >= 0 ? '+' : '') + diffYen.toLocaleString();
  el.wDiff.style.color = diffYen >= 0 ? '#7fd4ff' : '#ff8a8a';

  el.dpBB.textContent = String(state.counts.bb);
  el.dpRB.textContent = String(state.counts.rb);
  el.dpStart.textContent = String(state.counts.start);
  el.dpTotal.textContent = String(state.counts.total);
  const bonusTotal = state.counts.bb + state.counts.rb;
  el.dpGosei.textContent = bonusTotal > 0 ? '1/' + (state.counts.total / bonusTotal).toFixed(1) : '1/---';

  // BETランプ
  const dispBet = state.replayPending || state.bet;
  el.betLamps.forEach((lamp, i) => lamp.classList.toggle('on', dispBet >= i + 1));

  const idle = state.gamePhase === 'idle' && !state.betLock && !state.payoutLock;
  const betLocked = !idle || state.replayPending > 0 || state.inBonus;
  el.btnBet1.disabled = betLocked || state.bet >= 3;
  el.btnMaxBet.disabled = betLocked || state.bet >= 3;
  el.btnRent.disabled = !idle;
  el.btnPayback.disabled = !idle || state.bet > 0 || state.mochi <= 0;
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
      bbWinG: state.bbWinG, bonusVer: state.bonusVer,
      replayPending: state.replayPending,
      history: state.history, pendingHist: state.pendingHist,
      rareLamp: state.rareLamp, kaishuYen: state.kaishuYen,
      reelSpeed: state.reelSpeed, msgBarOn: state.msgBarOn,
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
    /* 旧セーブ移行: 旧仕様は持ちメダルにクレジットを含まないため合算 + 音量を新既定値へ */
    const oldSave = (typeof d.kaishuYen !== 'number');
    if (oldSave) state.mochi += state.credit;
    state.kaishuYen = d.kaishuYen || 0;
    state.investYen = d.investYen || 0;
    state.totalIn = d.totalIn || 0;
    state.totalOut = d.totalOut || 0;
    state.counts = d.counts || { bb: 0, rb: 0, total: 0, start: 0 };
    state.bonusFlag = d.bonusFlag || null;
    state.inBonus = !!d.inBonus;
    state.bonusType = d.bonusType || null;
    state.bonusPaid = d.bonusPaid || 0;
    state.bbWinG = d.bbWinG || 0;
    state.bonusVer = d.bonusVer || 'NORMAL';
    state.replayPending = d.replayPending || 0;
    state.history = Array.isArray(d.history) ? d.history.slice(0, 9) : [];
    state.pendingHist = d.pendingHist || null;
    state.rareLamp = !!d.rareLamp;
    state.reelSpeed = [0.25, 0.5, 1].includes(d.reelSpeed) ? d.reelSpeed : (d.easyMode ? 0.5 : 1); // 旧簡単モードは0.5に移行

    state.msgBarOn = d.msgBarOn === true; // デフォルトOFF
    state.bgmOn = d.bgmOn !== false && d.sound !== false;
    state.seOn = d.seOn !== false && d.sound !== false;
    state.bgmVol = (!oldSave && typeof d.bgmVol === 'number') ? d.bgmVol : 0.5;
    state.seVol = (!oldSave && typeof d.seVol === 'number') ? d.seVol : 0.35;
    if (d.lampLit) lightLamp();
  } catch (e) { /* 破損時は初期状態 */ }
}

function resetData() {
  if (state.gamePhase !== 'idle') { message('リール停止後にリセットできます'); return; }
  state.counts = { bb: 0, rb: 0, total: 0, start: 0 };
  message('データをリセットしました');
  saveGame();
  updateUI();
}

function resetAll() {
  if (state.gamePhase !== 'idle') { message('リール停止後にリセットできます'); return; }
  Object.assign(state, {
    credit: 0, mochi: 0, investYen: 0, totalIn: 0, totalOut: 0,
    bet: 0, replayPending: 0, bonusFlag: null, smallFlag: null,
    inBonus: false, bonusType: null, bonusPaid: 0,
    history: [], pendingHist: null, betLock: false, payoutLock: false,
    bbWinG: 0, bonusVer: 'NORMAL', bonusCountHold: false, bonusCountFinal: 0,
    rareLamp: false, kaishuYen: 0, forceBonus: false,
    counts: { bb: 0, rb: 0, total: 0, start: 0 }
  });
  audio.stopBGM();
  unlightLamp();
  el.topBanner.classList.remove('bonus-flash');
  syncMedalDisplay();
  message('全てリセットしました。メダルを借りてゲームスタート!');
  saveGame();
  updateUI();
}

/* ================= モーダル ================= */
function openModal() {
  // ゲーム中でも開ける (Auto Modeを止められるように)。Auto進行はモーダル表示中一時停止済み
  el.modalOverlay.hidden = false;
  refreshSpeedBtns();

  el.chkMsgBar.checked = state.msgBarOn;
  el.chkAuto.checked = state.autoMode;
  el.chkBgm.checked = state.bgmOn;
  el.chkSe.checked = state.seOn;
  el.volBgm.value = Math.round(state.bgmVol * 100);
  el.volSe.value = Math.round(state.seVol * 100);
  refreshPekaBtn();
  refreshSettingBtns();
}
function refreshPekaBtn() {
  el.btnForcePeka.textContent = state.forceBonus ? '★ ペカ予約中! (タップで解除)' : '次ゲームでGOGO!確定 (1回)';
  el.btnForcePeka.classList.toggle('armed', state.forceBonus);
}
function closeModal() { el.modalOverlay.hidden = true; }
function refreshSettingBtns() {
  document.querySelectorAll('.setting-btn').forEach(btn => {
    btn.classList.toggle('selected', Number(btn.dataset.s) === state.setting);
  });
  el.currentSetting.textContent = `現在:設定${state.setting}`;
}
function refreshSpeedBtns() {
  document.querySelectorAll('.speed-btn').forEach(btn => {
    btn.classList.toggle('selected', Number(btn.dataset.v) === state.reelSpeed);
  });
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

  // ストップボタン (押下=停止・押し込み維持 / 離す=押し込み解除+後ペカ判定)
  el.stopBtns.forEach((btn, i) => {
    btn.addEventListener('pointerdown', e => { e.preventDefault(); audio.ensure(); pressStop(i); });
  });
  window.addEventListener('pointerup', () => { releaseStopVisual(); onStopRelease(); });
  window.addEventListener('pointercancel', releaseStopVisual);

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

  document.querySelectorAll('.speed-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.reelSpeed = Number(btn.dataset.v);
      refreshSpeedBtns();
      saveGame();
    });
  });
  el.chkMsgBar.addEventListener('change', () => { state.msgBarOn = el.chkMsgBar.checked; applyMsgBar(); saveGame(); });
  el.chkAuto.addEventListener('change', () => {
    state.autoMode = el.chkAuto.checked;
    if (state.autoMode) { closeModal(); autoNextGame(600); }
    else autoClearTimers();
  });
  el.btnForcePeka.addEventListener('click', () => {
    state.forceBonus = !state.forceBonus;
    refreshPekaBtn();
    if (state.forceBonus) message('次のゲームでGOGO!CHANCE確定!');
  });
  el.chkBgm.addEventListener('change', () => {
    state.bgmOn = el.chkBgm.checked;
    if (!state.bgmOn) audio.stopBGM();
    else if (state.inBonus) audio.playBGM(state.bonusType === 'BB' ? (BB_VERS[state.bonusVer] || BB_VERS.NORMAL).loop : 'RB'); // ボーナス中ならBGM再開
    saveGame();
  });
  el.chkSe.addEventListener('change', () => { state.seOn = el.chkSe.checked; saveGame(); });
  el.volBgm.addEventListener('input', () => {
    state.bgmVol = el.volBgm.value / 100;
    audio.setBgmVolume(state.bgmVol);
  });
  el.volBgm.addEventListener('change', saveGame);
  el.volSe.addEventListener('input', () => { state.seVol = el.volSe.value / 100; audio.applyVolumes(); });
  el.volSe.addEventListener('change', () => { audio.playSE('BET'); saveGame(); });
  $('btnResetData').addEventListener('click', () => { resetData(); });
  $('btnResetAll').addEventListener('click', () => { resetAll(); closeModal(); });

  // キーボード操作 (PC)
  const keyMap = {
    '1': 0, '2': 1, '3': 2,
    'j': 0, 'k': 1, 'l': 2,
    'arrowleft': 0, 'arrowdown': 1, 'arrowright': 2
  };
  document.addEventListener('keydown', e => {
    if (e.repeat) return;
    if (!el.modalOverlay.hidden) return;
    audio.ensure();
    const k = e.key.toLowerCase();
    if (k === ' ' || k === 'enter') { e.preventDefault(); leverOn(); }
    else if (k in keyMap) { e.preventDefault(); pressStop(keyMap[k]); }
    else if (k === 'm') setMaxBet();
    else if (k === 'b') addBet(1);
  });
  document.addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    if (k in keyMap) {
      el.stopBtns[keyMap[k]].classList.remove('pushed');
      onStopRelease();
    }
  });

  window.addEventListener('resize', layoutReels);
}

/* ================= 初期化 ================= */
function init() {
  audio.init();
  loadGame();
  for (let i = 0; i < 3; i++) reels.push(new Reel(i));
  optimizeSymbolImages(); // スマホのラグ対策
  syncMedalDisplay(); // 表示値をロード値に同期
  applyMsgBar();
  layoutReels();
  buildGraph();
  bindEvents();

  if (state.inBonus) {
    const limit = state.bonusType === 'BB' ? BB_LIMIT : RB_LIMIT;
    message(`${state.bonusType === 'BB' ? 'BIG' : 'REGULAR'} BONUS 中!  ${state.bonusPaid} / ${limit}枚`);
    el.topBanner.classList.add('bonus-flash');
    audio.playBGM(state.bonusType === 'BB' ? (BB_VERS[state.bonusVer] || BB_VERS.NORMAL).loop : 'RB'); // リロード時はBGM再開
  } else if (state.lampLit) {
    message('GOGO!CHANCE!! ボーナス図柄を狙え!', true);
  } else if (state.mochi === 0) {
    message('メダルを借りてゲームスタート!');
  } else {
    message('');
  }
  updateUI();
  requestAnimationFrame(loop);
}

document.addEventListener('DOMContentLoaded', init);
