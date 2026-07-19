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

/* カスタム設定の入力項目定義 (UI生成・既定値表示用) */
const CUSTOM_KEYS = [
  { k: 'bb',     label: 'BB',       def: s => 1 / SETTINGS[s - 1].bb },
  { k: 'rb',     label: 'RB',       def: s => 1 / SETTINGS[s - 1].rb },
  { k: 'grape',  label: 'ブドウ',   def: s => 1 / SETTINGS[s - 1].grape },
  { k: 'replay', label: 'リプレイ', def: () => 1 / P_REPLAY },
  { k: 'cherry', label: 'チェリー', def: () => 1 / P_CHERRY },
  { k: 'bell',   label: 'ベル',     def: () => 1 / P_BELL },
  { k: 'clown',  label: 'ピエロ',   def: () => 1 / P_CLOWN }
];

/* 有効な設定番号 (判別チャレンジ中は隠し設定) */
function effSetting() {
  return (state.challenge && state.challenge.active) ? state.challenge.answerSetting : state.setting;
}

/* このゲームで使う有効確率 (優先順位: 判別チャレンジ > カスタム設定 > 通常設定) */
function getProbs() {
  if (state.challenge && state.challenge.active) {
    const sp = SETTINGS[state.challenge.answerSetting - 1];
    return { bb: sp.bb, rb: sp.rb, grape: sp.grape, replay: P_REPLAY, cherry: P_CHERRY, bell: P_BELL, clown: P_CLOWN };
  }
  if (state.customProb) {
    const c = state.customProb;
    const p = d => { const n = Number(d); return (isFinite(n) && n >= 1) ? 1 / n : 0; }; // 0や不正値=発生しない(無効)
    return { bb: p(c.bb), rb: p(c.rb), grape: p(c.grape), replay: p(c.replay), cherry: p(c.cherry), bell: p(c.bell), clown: p(c.clown) };
  }
  const sp = SETTINGS[state.setting - 1];
  return { bb: sp.bb, rb: sp.rb, grape: sp.grape, replay: P_REPLAY, cherry: P_CHERRY, bell: P_BELL, clown: P_CLOWN };
}

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
/* ▼ リール見た目の調整ポイント (本家採寸ベース。数値を変えるだけで調整可) */
const CELL_GAP_RATIO = 0.12; // 小役と小役の間の隙間 (コマ高さに対する割合)
const PEEK_RATIO     = 0.24; // 上下の隣コマを覗かせる量 (コマ高さに対する割合)
const REV_MS     = 780;    // 1回転にかかる時間(ms) 約77rpm
const SPEED      = KOMA / REV_MS;  // コマ/ms
const curSpeed   = () => SPEED * state.reelSpeed; // リール回転速度倍率を適用
const DECEL_KOMA = 1.05;   // (旧減速演出用・現在は未使用。ガチッと即停止に変更済み)
const WAIT_MS    = 0;   // ゲーム間ウェイト(4.1秒規定 4100)
const PEKA_FIRST = 0.15;   // 先ペカ(レバーON時点灯)の割合。残り85%は後ペカ(第3停止離し)
const BB_LIMIT   = 280;    // BB: 280枚を超える払い出しで終了
const RB_LIMIT   = 98;     // RB: 98枚を超える払い出しで終了
const PAY_CAP    = 15;     // 1ゲームの払い出し上限
const COUNT_MS   = 100;    // メダル数字カウント & Get1.mp3ループ間隔 (調整用)
const CREDIT_MAX = 50;
const SAVE_KEY   = 'imjuggler_ex_6_save_v1';
const MISSION_SAVE_KEY = 'imjuggler_ex_6_missions_v1'; // ミッション進捗(生涯記録・進捗リセットでのみ消去)
/* ================= ミッション (実績システム) ================= */
/* 進捗は生涯記録としてMISSION_SAVE_KEYに保存。
   データリセット/全リセットでは消えず、システム設定の「ミッション・進捗リセット」でのみ初期化 */
const MISSIONS = [
  /* --- 累計系 --- */
  { id: 'm01', cat: '累計', name: 'メダルを累計100枚獲得する',    t: 100,   v: s => s.lifeOut },
  { id: 'm02', cat: '累計', name: 'メダルを累計1,000枚獲得する',  t: 1000,  v: s => s.lifeOut },
  { id: 'm03', cat: '累計', name: 'メダルを累計5,000枚獲得する',  t: 5000,  v: s => s.lifeOut },
  { id: 'm04', cat: '累計', name: 'メダルを累計10,000枚獲得する', t: 10000, v: s => s.lifeOut },
  { id: 'm05', cat: '累計', name: '累計1,000ゲーム回す',          t: 1000,  v: s => s.spins },
  { id: 'm06', cat: '累計', name: '累計5,000ゲーム回す',          t: 5000,  v: s => s.spins },
  { id: 'm07', cat: '累計', name: '累計10,000ゲーム回す',         t: 10000, v: s => s.spins },
  { id: 'm08', cat: '累計', name: 'BBに初めて当選する',           t: 1,     v: s => s.bb },
  { id: 'm09', cat: '累計', name: 'BBに累計10回当選する',         t: 10,    v: s => s.bb },
  { id: 'm10', cat: '累計', name: 'BBに累計50回当選する',         t: 50,    v: s => s.bb },
  { id: 'm11', cat: '累計', name: 'BBに累計100回当選する',        t: 100,   v: s => s.bb },
  { id: 'm12', cat: '累計', name: 'RBに初めて当選する',           t: 1,     v: s => s.rb },
  { id: 'm13', cat: '累計', name: 'RBに累計10回当選する',         t: 10,    v: s => s.rb },
  { id: 'm14', cat: '累計', name: 'RBに累計50回当選する',         t: 50,    v: s => s.rb },
  { id: 'm15', cat: '累計', name: 'RBに累計100回当選する',        t: 100,   v: s => s.rb },
  { id: 'm16', cat: '累計', name: 'ボーナス合算 累計20回達成',    t: 20,    v: s => s.bb + s.rb },
  { id: 'm17', cat: '累計', name: 'ボーナス合算 累計100回達成',   t: 100,   v: s => s.bb + s.rb },
  { id: 'm18', cat: '累計', name: '生涯差枚 +1,000枚を超える',    t: 1000,  v: s => Math.max(0, s.lifeOut - s.lifeIn) },
  { id: 'm19', cat: '累計', name: '投資 累計10,000円を超える',    t: 10000, v: s => s.investYen },
  { id: 'm20', cat: '累計', name: '回収 累計10,000円を超える',    t: 10000, v: s => s.kaishuYen },
  /* --- 連チャン系 (ジャグ連=前回ボーナスから100G以内の当選) --- */
  { id: 'm21', cat: '連チャン', name: 'ジャグ連を初めて達成する', t: 1,  v: s => s.jugren },
  { id: 'm22', cat: '連チャン', name: 'ジャグ連を累計5回達成する',  t: 5,  v: s => s.jugren },
  { id: 'm23', cat: '連チャン', name: 'ジャグ連を累計20回達成する', t: 20, v: s => s.jugren },
  { id: 'm24', cat: '連チャン', name: 'ジャグ連を累計50回達成する', t: 50, v: s => s.jugren },
  { id: 'm25', cat: '連チャン', name: '3連チャンを達成する',      t: 3, v: s => s.renMax },
  { id: 'm26', cat: '連チャン', name: '5連チャンを達成する',      t: 5, v: s => s.renMax },
  { id: 'm27', cat: '連チャン', name: '7連チャンを達成する',      t: 7, v: s => s.renMax },
  { id: 'm28', cat: '連チャン', name: '50G以内のジャグ連を達成する', t: 1, v: s => s.ren50 },
  { id: 'm29', cat: '連チャン', name: '10G以内のジャグ連を達成する(激熱)', t: 1, v: s => s.ren10 },
  { id: 'm30', cat: '連チャン', name: 'BB→BBの連チャンを達成する', t: 1, v: s => s.bbbb },
  { id: 'm31', cat: '連チャン', name: 'RB→RBの連チャンを達成する', t: 1, v: s => s.rbrb },
  { id: 'm32', cat: '連チャン', name: 'データリセットなしでボーナス合計5回引く',  t: 1, v: s => s.ses5 },
  { id: 'm33', cat: '連チャン', name: 'データリセットなしでボーナス合計10回引く', t: 1, v: s => s.ses10 },
  { id: 'm34', cat: '連チャン', name: 'ボーナス後1G目で当選する(単独引き)', t: 1, v: s => s.solo },
  /* --- レア役・バージョン系 --- */
  { id: 'm35', cat: 'レア役', name: '中段チェリー(レインボー)に初当選する', t: 1, v: s => s.rare },
  { id: 'm36', cat: 'レア役', name: '中段チェリーに累計5回当選する', t: 5, v: s => s.rare },
  { id: 'm37', cat: 'レア役', name: 'シークレットver(1G)のBBに当選する', t: 1, v: s => s.verSP },
  { id: 'm38', cat: 'レア役', name: '第九ver(2〜5G)のBBに当選する', t: 1, v: s => s.verD9 },
  { id: 'm39', cat: 'レア役', name: '777ver(ちょうど77G)のBBに当選する', t: 1, v: s => s.verX },
  { id: 'm40', cat: 'レア役', name: '運命ver(ゾロ目G)のBBに当選する', t: 1, v: s => s.verUNMEI },
  { id: 'm41', cat: 'レア役', name: '全5バージョンのBB楽曲を実戦で聴く', t: 5,
    v: s => (s.verNORMAL ? 1 : 0) + (s.verSP ? 1 : 0) + (s.verD9 ? 1 : 0) + (s.verX ? 1 : 0) + (s.verUNMEI ? 1 : 0) },
  { id: 'm42', cat: 'レア役', name: '先ペカ(レバーON点灯)を経験する', t: 1, v: s => s.firstPeka },
  { id: 'm43', cat: 'レア役', name: '後ペカ(第3停止点灯)を経験する', t: 1, v: s => s.latePeka },
  { id: 'm44', cat: 'レア役', name: 'チェリー重複ボーナスを経験する', t: 1, v: s => s.dup },
  { id: 'm45', cat: 'レア役', name: 'ブドウを累計100回引く',   t: 100, v: s => s.grape },
  { id: 'm46', cat: 'レア役', name: 'ベルを累計50回引く',      t: 50,  v: s => s.bell },
  { id: 'm47', cat: 'レア役', name: 'ピエロを累計50回引く',    t: 50,  v: s => s.clown },
  { id: 'm48', cat: 'レア役', name: 'リプレイを累計100回引く', t: 100, v: s => s.replay },
  { id: 'm49', cat: 'レア役', name: 'チェリー重複BBを経験する', t: 1, v: s => s.dupBB },
  { id: 'm50', cat: 'レア役', name: '設定6でBBに当選する',     t: 1, v: s => s.set6bb }
];

function freshMissionStore() {
  return {
    st: {
      lifeIn: 0, lifeOut: 0, spins: 0, bb: 0, rb: 0, investYen: 0, kaishuYen: 0,
      jugren: 0, renMax: 0, ren50: 0, ren10: 0, bbbb: 0, rbrb: 0, ses5: 0, ses10: 0, solo: 0,
      rare: 0, verNORMAL: 0, verSP: 0, verD9: 0, verX: 0, verUNMEI: 0,
      firstPeka: 0, latePeka: 0, dup: 0, dupBB: 0, grape: 0, bell: 0, clown: 0, replay: 0, set6bb: 0
    },
    done: {}
  };
}
function loadMissions() {
  const fresh = freshMissionStore();
  try {
    const d = JSON.parse(localStorage.getItem(MISSION_SAVE_KEY));
    if (d && d.st) Object.keys(fresh.st).forEach(k => { if (isFinite(Number(d.st[k]))) fresh.st[k] = Number(d.st[k]); });
    if (d && d.done && typeof d.done === 'object') fresh.done = d.done;
  } catch (e) {}
  return fresh;
}
let mstore = loadMissions();
function saveMissions() {
  try { localStorage.setItem(MISSION_SAVE_KEY, JSON.stringify(mstore)); } catch (e) {}
}
/* 進捗を加算/更新して達成判定 */
function mAdd(key, n = 1) {
  mstore.st[key] = (mstore.st[key] || 0) + n;
  checkMissions();
}
function mSet(key) {
  if (!mstore.st[key]) { mstore.st[key] = 1; checkMissions(); }
}
function mMax(key, val) {
  if ((mstore.st[key] || 0) < val) { mstore.st[key] = val; checkMissions(); }
}
function checkMissions() {
  const newly = [];
  MISSIONS.forEach(m => {
    if (!mstore.done[m.id] && m.v(mstore.st) >= m.t) {
      mstore.done[m.id] = Date.now();
      newly.push(m);
    }
  });
  saveMissions();
  newly.forEach(m => queueMissionToast(m.name));
}

/* --- ミッションクリア通知 (画面外からフェードイン→自動フェードアウト) --- */
const mtQueue = [];
let mtBusy = false;
function queueMissionToast(name) {
  mtQueue.push(name);
  pumpMissionToast();
}
function pumpMissionToast() {
  if (mtBusy || !mtQueue.length) return;
  mtBusy = true;
  const t = $('missionToast');
  $('mtName').textContent = mtQueue.shift();
  t.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('show')));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => { t.hidden = true; mtBusy = false; pumpMissionToast(); }, 500);
  }, 3500);
}


/* ================= 状態 ================= */
const state = {
  setting: 1,          // 設定1〜6
  customProb: null,    // カスタム設定モード {bb,rb,grape,replay,cherry,bell,clown} 分母値。nullで通常設定
  challenge: null,     // 設定判別チャレンジ {active:true, answerSetting:1-6, prevSetting} nullで未挑戦
  challengeStats: { played: 0, correct: 0 }, // 判別チャレンジ通算成績
  hadBonus: false,     // 前回ボーナスがあるか(ジャグ連判定用・データリセットで解除)
  prevBonusType: null, // 前回のボーナス種別
  renChain: 0,         // 現在の連チャン数
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
  bbHitPlaying: false, // BBhit系mp3再生中 (ensure()のBGM復帰割り込み防止用)
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
  BBHITUNMEI: './BGM/BBhitUnmei.mp3', BBUNMEI: './BGM/BBUnmei.mp3', BBFINISHUNMEI: './BGM/BBFinishUnmei.mp3',
  /* 777ver (77GピッタリでBB) */
  BBHITX: './BGM/BBhitX.mp3', BBX: './BGM/BBX.mp3', BBFINISHX: './BGM/BBFinishX.mp3'
};

/* BBボーナス楽曲バージョン定義 (hit: null=BBhit1/2の50%抽選, 'NONE'=hitなし即ループ) */
/* BGM曲別の音量倍率 (未指定は1.0) */
const BGM_VOL_MULT = { BBD9: 1.2 };

const BB_VERS = {
  NORMAL: { hit: null,      loop: 'BB',      fin: 'BBFINISH',      grape: 'GRAPE14' },
  SP:     { hit: 'BBHITSP', loop: 'BBSP',    fin: 'BBFINISHSP',    grape: 'GRAPE14SP' },
  D9:     { hit: 'BBHITD9', loop: 'BBD9',    fin: 'BBFINISHD9',    grape: 'GRAPE14' },
  UNMEI:  { hit: 'BBHITUNMEI', loop: 'BBUNMEI', fin: 'BBFINISHUNMEI', grape: 'GRAPE14' },
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
    // リロード後のボーナス中BGM復帰(初回操作時)。
    // BBhit系mp3の再生中は割り込まない(playBGMOnceはbgmSrcに紐付かないため誤判定するバグの防止)
    if (state.inBonus && state.bgmOn && !state.bbHitPlaying && !this.bgmSrc && !this.bgmFallbackEl) {
      this.playBGM(state.bonusType === 'BB' ? (BB_VERS[state.bonusVer] || BB_VERS.NORMAL).loop : 'RB');
    }
  },
  applyVolumes() {
    if (this.seGain) this.seGain.gain.value = state.seVol;
    if (this.bgmGain) this.bgmGain.gain.value = state.bgmVol;
    if (this.bgmFallbackEl) this.bgmFallbackEl.volume = Math.min(1, state.bgmVol * (this.bgmFallbackMult || 1));
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
    const mult = BGM_VOL_MULT[key] || 1;
    const buf = this.buffers[key];
    if (buf && this.ctx) {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      if (mult !== 1) {
        const g = this.ctx.createGain();
        g.gain.value = mult;
        src.connect(g); g.connect(this.bgmGain);
      } else {
        src.connect(this.bgmGain);
      }
      src.start();
      this.bgmSrc = src;
      return;
    }
    const base = this.bgm[key];
    if (!base) return;
    base.loop = true;
    base.volume = Math.min(1, state.bgmVol * mult);
    base.currentTime = 0;
    base.play().catch(() => {});
    this.bgmFallbackEl = base;
    this.bgmFallbackMult = mult;
  },
  stopBGM() {
    if (this.bgmSrc) { try { this.bgmSrc.stop(); } catch (e) {} this.bgmSrc = null; }
    if (this.bgmFallbackEl) { this.bgmFallbackEl.pause(); this.bgmFallbackEl.loop = false; this.bgmFallbackEl = null; }
    this.bgmFallbackMult = 1;
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
  dpBB: $('dpBB'), dpRB: $('dpRB'), dpStart: $('dpStart'), dpTotal: $('dpTotal'), dpGosei: $('dpGosei'), dpAuto: $('dpAuto'),
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
  btnForcePeka: $('btnForcePeka'),
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
  // ボーナスはGOGO!CHANCE点灯中のみ揃えられる(後ペカ確定ゲームでは引き込まず蹴飛ばす)
  const aimableBonus = state.lampLit ? state.bonusFlag : null;
  const flagRole = state.smallFlag || aimableBonus || null;
  const allowed = new Set();
  if (state.smallFlag) {
    allowed.add(state.smallFlag);
    if (state.smallFlag === 'RARECHERRY') allowed.add('CHERRY'); // 実際の入賞役はチェリー
  } else if (aimableBonus) allowed.add(aimableBonus);

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
  if (!state.bonusFlag || state.smallFlag || !state.lampLit) return true; // 狙う必要のないゲーム(未点灯時は揃えられないので狙わない)
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
  constructor(idx, prefix = 'reel', onStopCb = null) {
    this.idx = idx;
    this.onStopCb = onStopCb; // 停止時処理の差し替え用(将来の拡張向け)
    this.el = $(prefix + idx);
    this.strip = this.el.querySelector('.strip');
    this.pos = idx * 7;          // 初期位置をずらす
    this.mode = 'stopped';       // 'stopped' | 'spin' | 'stopping'
    this.v = 0;
    this.remain = 0;
    this.target = 0;
    this.cellH = 60;             // 1コマの移動ピッチ(コマ高さ+隙間)
    this.offsetY = 0;            // 上に覗かせる分のオフセット(peek)
    this.buildStrip();
  }
  buildStrip() {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < KOMA * 2; i++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      const img = document.createElement('img');
      const sym = REEL_DATA[this.idx][i % KOMA];
      img.src = SYM_OPT[sym] || SYM_IMG[sym];
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
      // 実機風: 減速せず一定速度のまま回り、目標位置に達した瞬間ガチッと即停止
      // (スベリのコマ数=remainはそのまま。バウンド演出は完全撤廃)
      const step = Math.min(this.remain, curSpeed() * dt);
      this.remain -= step;
      this.pos = mod(this.target + this.remain, KOMA);
      if (this.remain <= 0.001) {
        this.pos = this.target;
        this.mode = 'stopped';
        (this.onStopCb || onReelStopped)(this.idx, this.target);
      }
    }
    this.render();
  }
  render() {
    /* pos<1の間は+21コマ(帯は2周分あり同じ絵柄)にずらし、上に覗くコマが帯の外に出て空白になるのを防ぐ */
    const ep = this.pos < 1 ? this.pos + KOMA : this.pos;
    this.strip.style.transform = `translate3d(0, ${(this.offsetY - ep * this.cellH).toFixed(2)}px, 0)`;
    // ぼかしは目押しの妨げになるため廃止(常にクッキリ表示)
  }
  resize(pitch, offsetY) {
    this.cellH = pitch;
    this.offsetY = offsetY;
    this.render();
  }
}

const reels = [];

/* ================= リール絵柄の描画 ================= */
/* 画像(1280x470)の実比率に合わせたセルに「横幅いっぱい・縦中央」で描画する。
   セル比率=画像比率のため上下の余白なしでピッタリ収まる。
   512x188(1280:470と同比率)に縮小してGPU負荷も削減 */
const SYM_OPT = {}; // 最適化済み画像キャッシュ (後から生成するリールにも適用)
function optimizeSymbolImages() {
  const W = 512, H = 188; // 1280:470 と同比率 (512*470/1280=188)
  for (const sym in SYM_IMG) {
    const src = new Image();
    src.onload = () => {
      try {
        const scale = W / src.naturalWidth;
        const h = src.naturalHeight * scale;
        const cv = document.createElement('canvas');
        cv.width = W; cv.height = H;
        const c = cv.getContext('2d');
        c.fillStyle = '#f7f7f7'; // リール背景色に合わせる
        c.fillRect(0, 0, W, H);
        c.drawImage(src, 0, (H - h) / 2, W, h); // 横幅フィット・縦中央
        const url = cv.toDataURL('image/jpeg', 0.9); // 白背景・非透過なのでJPEGでOK
        SYM_OPT[sym] = url;
        document.querySelectorAll('img[data-sym="' + sym + '"]').forEach(im => { im.src = url; });
      } catch (e) { /* file://直開き等でcanvasが使えない場合は原寸のまま表示 */ }
    };
    src.src = SYM_IMG[sym];
  }
}

/* リールサイズ調整 (画像1280x470の実比率+小役間の隙間+上下の覗き) */
function layoutReels() {
  const reelEl = $('reel0');
  const w = reelEl.getBoundingClientRect().width;
  const cellH = Math.round(w * 470 / 1280);          // 小役1コマの高さ(画像実比率)
  const gap   = Math.round(cellH * CELL_GAP_RATIO);  // 小役間の隙間
  const peek  = Math.round(cellH * PEEK_RATIO);      // 上下に覗かせる量
  document.documentElement.style.setProperty('--cellH', cellH + 'px');
  document.documentElement.style.setProperty('--cellGap', gap + 'px');
  document.documentElement.style.setProperty('--windowH', (cellH * 3 + gap * 2 + peek * 2) + 'px');
  reels.forEach(r => r.resize(cellH + gap, peek));
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
  mAdd('lifeIn', need);
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
  mAdd('lifeIn', need);
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
      mAdd('lifeIn', 2);
      audio.playSE('MAXBET2'); // ボーナス中は2枚BET固定
      animateMedals(COUNT_MS);
      autoBetDelay = betDelayMs;
    }
  } else if (state.bet === 0) {
    // 未BETならMAXBET扱い(便利機能)
    if (!tryConsumeCoins(3)) { message('メダルが足りません! 貸出ボタンを押してください'); return; }
    state.bet = 3;
    state.totalIn += 3;
    mAdd('lifeIn', 3);
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
    const sp = getProbs(); // カスタム設定モード適用中はカスタム確率
    let newBonus = false, rareHit = false, dupCherry = false;
    const hadFlag = !!state.bonusFlag; // 楽曲判定用: このゲームで新規当選したか
    /* 設定メニュー「ペカ確定」: 確率無視でボーナスフラグ確定 + 第3停止離しで告知 */
    if (state.forceBonus) {
      state.forceBonus = false;
      if (!state.bonusFlag) {
        const ratio = sp.bb / (sp.bb + sp.rb);
        state.bonusFlag = Math.random() < ratio ? 'BB' : 'RB';
      }
      /* 自然当選と同じ点灯抽選 (先ペカ15% / 後ペカ85%) */
      if (!state.lampLit) {
        if (Math.random() < PEKA_FIRST) { lightLamp(); mSet('firstPeka'); }
        else state.lampPending = true;
      }
    }
    if (!state.bonusFlag) {
      const r = Math.random();
      if (r < sp.bb) {
        state.bonusFlag = 'BB'; newBonus = true;
        if (r < rareCherryProb(effSetting())) rareHit = true;        // 中段チェリー(BB内数)
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
      if (r2 < (acc += sp.grape)) { state.smallFlag = 'GRAPE'; mAdd('grape'); }
      else if (r2 < (acc += sp.replay)) { state.smallFlag = 'REPLAY'; mAdd('replay'); }
      else if (r2 < (acc += sp.cherry)) state.smallFlag = 'CHERRY';
      else if (r2 < (acc += sp.bell)) { state.smallFlag = 'BELL'; mAdd('bell'); }
      else if (r2 < (acc += sp.clown)) { state.smallFlag = 'CLOWN'; mAdd('clown'); }
    }

    /* 新規当選時の処理 (揃えるまで数ゲーム持ち越しても当選G基準) */
    if (!hadFlag && state.bonusFlag) {
      const winG = state.counts.start + 1; // このゲームのG数
      if (state.bonusFlag === 'BB') state.bbWinG = winG; // 楽曲バージョン判定用

      /* --- ミッション: ジャグ連・連チャン系 (当選ゲーム時点で判定) --- */
      const isRen = state.hadBonus && winG <= 100; // ジャグ連=前回ボーナスから100G以内の当選
      if (isRen) {
        mAdd('jugren');
        state.renChain = (state.renChain || 1) + 1;
        if (winG <= 50) mSet('ren50');
        if (winG <= 10) mSet('ren10');
        if (state.prevBonusType === 'BB' && state.bonusFlag === 'BB') mSet('bbbb');
        if (state.prevBonusType === 'RB' && state.bonusFlag === 'RB') mSet('rbrb');
      } else {
        state.renChain = 1;
      }
      mMax('renMax', state.renChain);
      if (state.hadBonus && winG === 1) mSet('solo');
      const eff6 = (state.challenge && state.challenge.active)
        ? state.challenge.answerSetting === 6
        : (!state.customProb && state.setting === 6);
      if (state.bonusFlag === 'BB' && eff6) mSet('set6bb');
      if (dupCherry) { mSet('dup'); if (state.bonusFlag === 'BB') mSet('dupBB'); }
      if (rareHit) mAdd('rare');
    }

    /* GOGO!CHANCE 点灯タイミング抽選 (先ペカ15% / 後ペカ85%) */
    if (newBonus && !state.lampLit) {
      if (Math.random() < PEKA_FIRST) {
        lightLamp(); // 先ペカ(レバーON時) → このゲームから揃えられる
        mSet('firstPeka');
      } else {
        state.lampPending = true; // 後ペカ(第3停止ボタンを離した瞬間) → 次ゲームから揃えられる
      }
    }
    state.counts.start++;
    state.counts.total++; // BB/RB中の回転はスタート・総回転数に含めない
    mAdd('spins');
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
    mSet('latePeka');
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
  refreshPekaBtn(); // モーダルを開いたままでもボタン表示を追従
}

function unlightLamp() {
  state.lampLit = false;
  state.lampPending = false;
  state.rareLamp = false;
  el.gogoImgOn.hidden = true;
  el.gogoLamp.classList.remove('lit', 'rainbow');
  refreshPekaBtn();
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
  mAdd('lifeOut', n);
  state.mochi += n; // 持ちメダルは総所持枚数
  state.credit = Math.min(CREDIT_MAX, state.credit + n);
}

/* --- BB/RB当選中カウンター点滅 (表示0.5秒→非表示0.5秒ループ) --- */
function setBonusBlink(type, on) {
  (type === 'BB' ? el.dpBB : el.dpRB).classList.toggle('bonus-blink', on);
}
function clearBonusBlink() {
  el.dpBB.classList.remove('bonus-blink');
  el.dpRB.classList.remove('bonus-blink');
}

/* --- ボーナス --- */
function startBonus(type) {
  state.inBonus = true;
  state.bonusType = type;
  refreshPekaBtn(); // BB/RB中表示に切替 (bonusType確定後に呼ぶこと)
  refreshSkipBtn();
  state.bonusPaid = 0;
  state.bonusCountHold = false;
  state.bonusCountFinal = 0;
  disp.bonus = 0;
  state.bonusFlag = null;
  state.smallFlag = null;
  state.pendingHist = { g: state.counts.start, t: type }; // 履歴グラフ用
  if (type === 'BB') { state.counts.bb++; mAdd('bb'); } else { state.counts.rb++; mAdd('rb'); }
  const sesB = state.counts.bb + state.counts.rb;
  if (sesB >= 5) mSet('ses5');
  if (sesB >= 10) mSet('ses10');
  unlightLamp();
  el.topBanner.classList.add('bonus-flash');
  message(type === 'BB' ? 'BIG BONUS!! (最大+252枚)' : 'REGULAR BONUS!! (最大+96枚)', true);
  if (type === 'BB') {
    /* 当選G数から楽曲バージョンを決定 */
    state.bonusVer = pickBBVersion(state.bbWinG || 0);
    mSet('ver' + state.bonusVer); // ミッション: 楽曲バージョン実戦コンプ
    const v = BB_VERS[state.bonusVer] || BB_VERS.NORMAL;
    /* 777揃い: hit音再生 → 再生終了後にメインBGM(BB終了までループ)。
       hit再生中もレバー等は操作可能(ロックなし)。
       BB系mp3はhit音の再生終了コールバック内でのみ開始されるため、
       hit停止前にBB系が鳴ることは構造上あり得ない */
    const hit = v.hit || (Math.random() < 0.5 ? 'BBHIT1' : 'BBHIT2');
    setBonusBlink('BB', true); /* hit音再生開始と同時に点滅開始 */
    state.bbHitPlaying = true; /* hit再生中はensure()のBGM復帰を割り込ませない */
    audio.playBGMOnce(hit, () => {
      state.bbHitPlaying = false;
      if (state.inBonus && state.bonusType === 'BB') audio.playBGM(v.loop);
      refreshSkipBtn(); // BB系BGM開始と同時にスキップ有効化
      updateUI();
    });
  } else {
    setBonusBlink('RB', true); /* RB.mp3再生開始と同時に点滅開始 */
    audio.playBGM('RB'); // RB終了まで即ループ
  }
}

function endBonus(payoutSndMs = 0) {
  const got = state.bonusPaid;
  const type = state.bonusType;
  state.inBonus = false;
  state.hadBonus = true;       // ジャグ連判定用(前回ボーナスあり)
  state.prevBonusType = type;  // BB→BB / RB→RB連チャン判定用
  refreshPekaBtn(); // ボーナス終了でボタン復帰
  refreshSkipBtn();
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
    if (type === 'RB') setBonusBlink('RB', false); /* RB BGM停止と同時に点滅停止→常時点灯 */
    if (type === 'BB') {
      /* BB BGM停止から0.1秒後にバージョン対応のFinishを再生 →
         再生終了+1秒後にCOUNT表示を消す */
      const finKey = (BB_VERS[state.bonusVer] || BB_VERS.NORMAL).fin;
      setTimeout(() => {
        audio.playBGMOnce(finKey, () => {
          setBonusBlink('BB', false); /* BBFinish再生終了と同時に点滅停止→常時点灯 */
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
  mAdd('investYen', 1000);
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
  mAdd('kaishuYen', yen);
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
/* Auto ModeのON/OFF一元化 (設定チェックボックス・[A]キー共通) */
function setAutoMode(on) {
  state.autoMode = on;
  syncAutoBtn();
  if (on) {
    closeModal();
    /* 回転中(まだ1つも停止していない)にONにした場合はこのゲームから自動停止 */
    if (state.gamePhase === 'spinning' && state.cols.every(c => c === null)) autoSchedule(() => autoPress(0), 300);
    else autoNextGame(600);
  } else {
    autoClearTimers();
  }
}
function syncAutoBtn() {
  el.dpAuto.classList.toggle('on', state.autoMode);
  el.dpAuto.textContent = state.autoMode ? 'AUTO PLAY中' : 'Auto Mode';
}

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
  syncAutoBtn();
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
      setting: state.setting, customProb: state.customProb, challenge: state.challenge, challengeStats: state.challengeStats,
      hadBonus: state.hadBonus, prevBonusType: state.prevBonusType, renChain: state.renChain, credit: state.credit, mochi: state.mochi,
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
    state.customProb = (d.customProb && typeof d.customProb === 'object') ? d.customProb : null;
    state.challenge = (d.challenge && d.challenge.active && d.challenge.answerSetting >= 1) ? d.challenge : null;
    state.challengeStats = (d.challengeStats && typeof d.challengeStats === 'object')
      ? { played: d.challengeStats.played || 0, correct: d.challengeStats.correct || 0 }
      : { played: 0, correct: 0 };
    state.hadBonus = !!d.hadBonus;
    state.prevBonusType = d.prevBonusType || null;
    state.renChain = d.renChain || 0;
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
  state.history = [];
  state.pendingHist = null;
  state.hadBonus = false;   // 連チャン判定もリセット(リセット直後の誤ジャグ連防止)
  state.prevBonusType = null;
  state.renChain = 0;
  renderGraph();
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
    history: [], pendingHist: null, betLock: false, bbHitPlaying: false, payoutLock: false,
    bbWinG: 0, bonusVer: 'NORMAL', bonusCountHold: false, bonusCountFinal: 0,
    rareLamp: false, kaishuYen: 0, forceBonus: false, customProb: null,
    challenge: null, challengeStats: { played: 0, correct: 0 },
    hadBonus: false, prevBonusType: null, renChain: 0,
    counts: { bb: 0, rb: 0, total: 0, start: 0 }
  });
  audio.stopBGM();
  unlightLamp();
  el.topBanner.classList.remove('bonus-flash');
  clearBonusBlink();
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
  el.chkBgm.checked = state.bgmOn;
  el.chkSe.checked = state.seOn;
  el.volBgm.value = Math.round(state.bgmVol * 100);
  el.volSe.value = Math.round(state.seVol * 100);
  refreshPekaBtn();
  refreshSettingBtns();
}
/* 「現在のボーナスをスキップ」ボタンの有効/無効
   有効化条件: BB=BBhit系mp3が停止しBB系BGMが始まった後 / RB=RB.mp3再生開始と同時(=RB突入直後) */
function refreshSkipBtn() {
  const b = $('btnSkipBonus');
  const en = state.inBonus && !(state.bonusType === 'BB' && state.bbHitPlaying);
  b.disabled = !en;
  b.textContent = state.inBonus
    ? `現在の${state.bonusType}をスキップ (最大枚数を即獲得)`
    : '現在のボーナスをスキップ (ボーナス中のみ)';
}
/* ボーナスを即時消化: 最大払い出し(BB294枚/RB112枚)まで一気に獲得して通常の終了フローへ */
function skipBonus() {
  if (!state.inBonus) return;
  if (state.bonusType === 'BB' && state.bbHitPlaying) return;
  const target = state.bonusType === 'BB' ? BB_LIMIT + 14 : RB_LIMIT + 14; // 294 / 112
  const remain = Math.max(0, target - state.bonusPaid);
  addPayout(remain);          // メダル・累計・ミッション進捗に反映
  state.bonusPaid = target;
  syncMedalDisplay();         // カウントアップ演出なしで即時反映 (COUNTも294/112に)
  endBonus(0);                // 通常の終了フロー (BGM即停止→Finish再生→COUNT消灯)
  refreshSkipBtn();
  saveGame();
  updateUI();
}

function refreshPekaBtn() {
  const b = el.btnForcePeka;
  if (state.challenge && state.challenge.active) {
    /* 判別チャレンジ中は確率をゆがめるため使用不可 */
    b.disabled = true;
    b.textContent = '判別チャレンジ中は使用不可';
    b.classList.remove('armed');
  } else if (state.inBonus) {
    /* BB/RB中は効かないため無効化(予約自体は保持され、ボーナス終了後の1G目で消費される) */
    b.disabled = true;
    b.textContent = state.bonusType === 'BB' ? '現在BB中!' : '現在RB中!';
    b.classList.remove('armed');
  } else if (state.lampLit) {
    /* 点灯中はすでに確定済みのため無効化(無駄押し防止) */
    b.disabled = true;
    b.textContent = '現在GOGO!CHANCE点灯中!';
    b.classList.remove('armed');
  } else {
    b.disabled = false;
    b.textContent = state.forceBonus ? '★ ペカ予約中! (タップで解除)' : '次ゲームでGOGO!確定 (1回)';
    b.classList.toggle('armed', state.forceBonus);
  }
}
function closeModal() {
  el.modalOverlay.hidden = true;
  closeSubOverlays();
}
let stopSoundRoom = null; // bindEventsで実体をセット(サウンドルーム停止用フック)
function closeSubOverlays() {
  $('machineOverlay').hidden = true;
  $('systemOverlay').hidden = true;
  $('customOverlay').hidden = true;
  $('challengeOverlay').hidden = true;
  $('missionOverlay').hidden = true;
  $('resetOverlay').hidden = true;
  $('volOverlay').hidden = true;
  if (stopSoundRoom) stopSoundRoom();
  $('soundOverlay').hidden = true;
  $('confirmOverlay').hidden = true;
}

/* 確認ポップアップ (リセット系の誤操作防止) */
let confirmCb = null;
function askConfirm(msg, cb, infoOnly) {
  $('confirmMsg').textContent = msg;
  confirmCb = cb || null;
  $('btnConfirmNo').hidden = !!infoOnly;      // 情報表示モードは「いいえ」を隠す
  $('btnConfirmYes').textContent = infoOnly ? 'OK' : 'はい';
  $('confirmOverlay').hidden = false;
}
function refreshSettingBtns() {
  const inCh = !!(state.challenge && state.challenge.active);
  document.querySelectorAll('.setting-btn').forEach(btn => {
    btn.classList.toggle('selected', !inCh && !state.customProb && Number(btn.dataset.s) === state.setting);
    btn.disabled = inCh; // 判別チャレンジ中は設定変更不可
  });
  $('btnCustomProb').disabled = inCh;
  el.currentSetting.textContent = inCh ? '現在:???(判別チャレンジ中)'
    : state.customProb ? '現在:カスタム' : `現在:設定${state.setting}`;
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

  /* --- 小役一覧オーバーレイ (メニューモーダルの上に重ねて表示) --- */
  const payOverlay = $('payOverlay');
  $('btnPayList').addEventListener('click', () => { payOverlay.hidden = false; });
  $('btnClosePay').addEventListener('click', () => { payOverlay.hidden = true; });
  payOverlay.addEventListener('click', e => { if (e.target === payOverlay) payOverlay.hidden = true; });
  document.querySelectorAll('.setting-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.setting = Number(btn.dataset.s);
      state.customProb = null; // 設定を選んだらカスタム設定モードは解除
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
  el.dpAuto.addEventListener('click', () => { audio.ensure(); setAutoMode(!state.autoMode); });
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
  /* --- 音量設定ポップアップ (♪ボタン) --- */
  function refreshVolPop() {
    el.chkBgm.checked = state.bgmOn;
    el.chkSe.checked = state.seOn;
    el.volBgm.value = Math.round(state.bgmVol * 100);
    el.volSe.value = Math.round(state.seVol * 100);
  }
  $('btnVolPop').addEventListener('click', () => {
    audio.ensure();
    refreshVolPop();
    $('volOverlay').hidden = false;
  });
  $('btnCloseVol').addEventListener('click', () => { $('volOverlay').hidden = true; });
  $('volOverlay').addEventListener('click', e => { if (e.target === $('volOverlay')) $('volOverlay').hidden = true; });

  /* --- リセットポップアップ --- */
  $('btnCatReset').addEventListener('click', () => { $('resetOverlay').hidden = false; });
  $('btnCloseReset').addEventListener('click', () => { $('resetOverlay').hidden = true; });
  $('resetOverlay').addEventListener('click', e => { if (e.target === $('resetOverlay')) $('resetOverlay').hidden = true; });
  $('btnResetData').addEventListener('click', () => {
    askConfirm('データ(BB/RB回数・回転数・履歴グラフ)をリセットします。\n本当によろしいですか?', () => { resetData(); });
  });
  $('btnResetAll').addEventListener('click', () => {
    /* ミッション進捗は含めない(進捗リセットはシステム設定の専用ボタンのみ) */
    askConfirm('全データ(メダル・投資・設定など)を初期化します。\n本当によろしいですか?', () => {
      resetAll(); closeModal();
    });
  });
  $('btnResetMission').addEventListener('click', () => {
    askConfirm('ミッションの進捗をリセットします。\n本当によろしいですか?', () => {
      mstore = freshMissionStore();
      try { localStorage.removeItem(MISSION_SAVE_KEY); } catch (e) {}
      if (!$('missionOverlay').hidden) refreshMissionList();
      message('ミッション進捗をリセットしました');
    });
  });
  $('btnConfirmYes').addEventListener('click', () => {
    $('confirmOverlay').hidden = true;
    const cb = confirmCb; confirmCb = null;
    if (cb) cb();
  });
  $('btnConfirmNo').addEventListener('click', () => { $('confirmOverlay').hidden = true; confirmCb = null; });
  $('confirmOverlay').addEventListener('click', e => { if (e.target === $('confirmOverlay')) { $('confirmOverlay').hidden = true; confirmCb = null; } });

  /* --- カテゴリポップアップ (ルートメニューの上に重ねる) --- */
  $('btnCatMachine').addEventListener('click', () => {
    refreshSettingBtns(); refreshSpeedBtns(); refreshPekaBtn(); refreshSkipBtn();
      $('machineOverlay').hidden = false;
  });
  $('btnCloseMachine').addEventListener('click', () => { $('machineOverlay').hidden = true; });
  $('machineOverlay').addEventListener('click', e => { if (e.target === $('machineOverlay')) $('machineOverlay').hidden = true; });
  $('btnCatSystem').addEventListener('click', () => {
    el.chkMsgBar.checked = state.msgBarOn;
    el.chkBgm.checked = state.bgmOn;
    el.chkSe.checked = state.seOn;
    el.volBgm.value = Math.round(state.bgmVol * 100);
    el.volSe.value = Math.round(state.seVol * 100);
    $('systemOverlay').hidden = false;
  });
  $('btnCloseSystem').addEventListener('click', () => { $('systemOverlay').hidden = true; });
  $('systemOverlay').addEventListener('click', e => { if (e.target === $('systemOverlay')) $('systemOverlay').hidden = true; });

  /* --- カスタム設定モード --- */
  function buildCustomRows() {
    const wrap = $('customRows');
    wrap.innerHTML = '';
    CUSTOM_KEYS.forEach(({ k, label, def }) => {
      const row = document.createElement('div');
      row.className = 'custom-row';
      const stored = state.customProb && isFinite(Number(state.customProb[k]))
        ? Number(state.customProb[k]) : null;
      const isOff = stored === 0; // 0=無効(発生しない)
      const cur = (stored !== null && stored !== 0) ? stored : def(state.setting);
      row.innerHTML = `<label>${label}</label><span class="frac">1 /</span>` +
        `<input type="number" min="0" step="0.01" id="customIn_${k}" value="${(Math.round(cur * 100) / 100)}"${isOff ? ' disabled' : ''}>` +
        `<label class="c-off"><input type="checkbox" id="customOff_${k}"${isOff ? ' checked' : ''}>無効</label>`;
      wrap.appendChild(row);
      /* 無効☑で入力欄をグレーアウト */
      row.querySelector('#customOff_' + k).addEventListener('change', e => {
        row.querySelector('#customIn_' + k).disabled = e.target.checked;
      });
    });
    /* 状態表示 */
    let stEl = $('customStatus');
    if (!stEl) {
      stEl = document.createElement('p');
      stEl.id = 'customStatus';
      stEl.className = 'custom-status';
      wrap.parentNode.insertBefore(stEl, wrap);
    }
    stEl.textContent = state.customProb ? '● カスタム適用中' : `○ 未適用 (通常:設定${state.setting})`;
  }
  $('btnSkipBonus').addEventListener('click', () => {
    if (!state.inBonus || (state.bonusType === 'BB' && state.bbHitPlaying)) return;
    if (state.gamePhase !== 'idle' || state.payoutLock) { askConfirm('リール停止・払い出し完了後にスキップできます。', null, true); return; }
    const t = state.bonusType === 'BB' ? 'BB (294枚)' : 'RB (112枚)';
    askConfirm(`現在の${t}を最大枚数までスキップして終了します。\nよろしいですか?`, () => { skipBonus(); closeModal(); });
  });
  $('btnCustomProb').addEventListener('click', () => {
    buildCustomRows();
    $('customOverlay').hidden = false;
  });
  $('btnCustomApply').addEventListener('click', () => {
    const c = {};
    let ok = true;
    CUSTOM_KEYS.forEach(({ k }) => {
      if ($('customOff_' + k).checked) { c[k] = 0; return; } // 無効(発生しない)
      const v = Number($('customIn_' + k).value);
      if (!isFinite(v) || v < 0 || (v > 0 && v < 1)) ok = false; // 0=無効もOK
      c[k] = v;
    });
    if (!ok) { askConfirm('0(無効) または 1以上の数値を入力してください。', null, true); return; }
    state.customProb = c;
    refreshSettingBtns();
    buildCustomRows();
    saveGame();
    message('カスタム設定を適用しました');
  });
  $('btnCustomOff').addEventListener('click', () => {
    state.customProb = null;
    refreshSettingBtns();
    buildCustomRows();
    saveGame();
    message(`カスタム設定を解除しました (設定${state.setting})`);
  });
  $('btnCloseCustom').addEventListener('click', () => { $('customOverlay').hidden = true; });
  $('customOverlay').addEventListener('click', e => { if (e.target === $('customOverlay')) $('customOverlay').hidden = true; });

  /* --- 設定判別チャレンジ --- */
  function refreshChallenge() {
    const ch = state.challenge;
    const active = !!(ch && ch.active);
    $('chProgress').hidden = !active;
    $('btnChStart').hidden = active;
    $('chStatus').textContent = active ? '● チャレンジ中! 打って設定を推理しよう' : '○ 未挑戦';
    if (active) {
      const c = state.counts;
      const gosei = (c.bb + c.rb) > 0 ? '1/' + (c.total / (c.bb + c.rb)).toFixed(1) : '1/---';
      $('chStats').textContent = `経過: ${c.total}G / BB: ${c.bb} / RB: ${c.rb} / 合成: ${gosei}`;
    }
    const s = state.challengeStats;
    const rate = s.played > 0 ? Math.round(s.correct / s.played * 100) : 0;
    $('chRecord').textContent = `通算成績: ${s.played}回挑戦 / ${s.correct}回正解 (正解率${rate}%)`;
  }
  function endChallenge() {
    if (state.challenge) state.setting = state.challenge.prevSetting || state.setting;
    state.challenge = null;
    refreshSettingBtns();
    refreshPekaBtn();
    refreshChallenge();
    saveGame();
  }
  $('btnCatChallenge').addEventListener('click', () => {
    refreshChallenge();
    $('challengeOverlay').hidden = false;
  });
  $('btnChStart').addEventListener('click', () => {
    if (state.gamePhase !== 'idle') { askConfirm('リール停止後に開始できます。', null, true); return; }
    askConfirm('チャレンジを開始しますか?\nデータ(回転数・BB/RB回数・履歴)はリセットされます。', () => {
      resetData();
      state.challenge = {
        active: true,
        answerSetting: 1 + Math.floor(Math.random() * 6),
        prevSetting: state.setting
      };
      state.customProb = null; // カスタム設定は解除(チャレンジ確率を優先)
      refreshSettingBtns();
      refreshPekaBtn();
      refreshChallenge();
      saveGame();
      message('設定判別チャレンジ開始! 設定は1〜6のどれかな?');
    });
  });
  document.querySelectorAll('.ch-ans-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!state.challenge || !state.challenge.active) return;
      const guess = Number(btn.dataset.a);
      askConfirm(`「設定${guess}」で回答します。\nよろしいですか?`, () => {
        const ans = state.challenge.answerSetting;
        const hit = guess === ans;
        state.challengeStats.played++;
        if (hit) state.challengeStats.correct++;
        endChallenge();
        askConfirm(
          hit ? `🎉 正解! この台は設定${ans}でした!`
              : `残念... 正解は設定${ans}でした。\n(あなたの回答: 設定${guess})`,
          null, true);
      });
    });
  });
  $('btnChQuit').addEventListener('click', () => {
    askConfirm('チャレンジを中止します(成績には記録されません)。\nよろしいですか?', () => {
      endChallenge();
      message('チャレンジを中止しました');
    });
  });
  $('btnCloseChallenge').addEventListener('click', () => { $('challengeOverlay').hidden = true; });
  $('challengeOverlay').addEventListener('click', e => { if (e.target === $('challengeOverlay')) $('challengeOverlay').hidden = true; });

  /* --- ミッション一覧 --- */
  function refreshMissionList() {
    const wrap = $('msList');
    wrap.innerHTML = '';
    let lastCat = null;
    let doneCount = 0;
    MISSIONS.forEach(m => {
      const done = !!mstore.done[m.id];
      if (done) doneCount++;
      if (m.cat !== lastCat) {
        const h = document.createElement('div');
        h.className = 'ms-cat';
        h.textContent = '― ' + m.cat + '系 ―';
        wrap.appendChild(h);
        lastCat = m.cat;
      }
      const val = Math.min(m.t, Math.max(0, m.v(mstore.st)));
      const pct = Math.round(val / m.t * 100);
      const row = document.createElement('div');
      row.className = 'ms-row' + (done ? ' done' : '');
      row.innerHTML =
        `<div class="ms-name"><span>${m.name}</span>${done ? '<span class="ms-check">✔ クリア</span>' : ''}</div>` +
        `<div class="ms-bar"><div class="ms-fill" style="width:${done ? 100 : pct}%"></div></div>` +
        `<div class="ms-prog">${done ? m.t : val} / ${m.t}</div>`;
      wrap.appendChild(row);
    });
    $('msSummary').textContent = `達成状況: ${doneCount} / ${MISSIONS.length}`;
  }
  $('btnCatMission').addEventListener('click', () => {
    refreshMissionList();
    $('missionOverlay').hidden = false;
  });
  $('btnCloseMission').addEventListener('click', () => { $('missionOverlay').hidden = true; });
  $('missionOverlay').addEventListener('click', e => { if (e.target === $('missionOverlay')) $('missionOverlay').hidden = true; });

  /* --- サウンドルーム (音楽プレイヤー) --- */
  const SR_TRACKS = [
    { g: '通常ver',       key: 'BBHIT1',      name: 'BB当選ファンファーレ 1' },
    { g: '通常ver',       key: 'BBHIT2',      name: 'BB当選ファンファーレ 2' },
    { g: '通常ver',       key: 'BB',          name: 'BB中BGM' },
    { g: '通常ver',       key: 'BBFINISH',    name: 'BB終了' },
    { g: 'シークレットver', key: 'BBHITSP',    name: 'BB当選 (シークレット)' },
    { g: 'シークレットver', key: 'BBSP',       name: 'BB中BGM (シークレット)' },
    { g: 'シークレットver', key: 'BBFINISHSP', name: 'BB終了 (シークレット)' },
    { g: '第九ver',       key: 'BBHITD9',     name: 'BB当選 (第九)' },
    { g: '第九ver',       key: 'BBD9',        name: 'BB中BGM (第九)' },
    { g: '第九ver',       key: 'BBFINISHD9',  name: 'BB終了 (第九)' },
    { g: '777ver',        key: 'BBHITX',      name: 'BB当選 (777)' },
    { g: '777ver',        key: 'BBX',         name: 'BB中BGM (777)' },
    { g: '777ver',        key: 'BBFINISHX',   name: 'BB終了 (777)' },
    { g: '運命ver',       key: 'BBHITUNMEI',  name: 'BB当選 (運命)' },
    { g: '運命ver',       key: 'BBUNMEI',     name: 'BB中BGM (運命)' },
    { g: '運命ver',       key: 'BBFINISHUNMEI', name: 'BB終了 (運命)' },
    { g: 'REGULAR BONUS', key: 'RB',          name: 'RB中BGM' }
  ];
  const srAudio = new Audio();
  let srIdx = -1, srLoop = false, srVol = 0.5;
  const srFmt = s => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  function srApplyVol() { srAudio.volume = Math.min(1, srVol * (srIdx >= 0 ? (BGM_VOL_MULT[SR_TRACKS[srIdx].key] || 1) : 1)); }
  function srRefreshList() {
    document.querySelectorAll('.sr-track').forEach((elm, i) => {
      const playing = i === srIdx && !srAudio.paused;
      elm.classList.toggle('playing', i === srIdx);
      elm.querySelector('.sr-icon').textContent = playing ? '♪' : '▶';
    });
    $('srPlay').textContent = (srIdx >= 0 && !srAudio.paused) ? '⏸' : '▶';
    $('srTitle').textContent = srIdx >= 0 ? SR_TRACKS[srIdx].name : '曲を選んでください';
    $('srSeek').disabled = srIdx < 0;
  }
  function srPlayTrack(i) {
    if (state.inBonus) { askConfirm('ボーナス中は再生できません。\nボーナス終了後にお楽しみください!', null, true); return; }
    audio.stopBGM(); // ゲーム側BGMと被らないように
    srIdx = (i + SR_TRACKS.length) % SR_TRACKS.length;
    srAudio.src = BGM_FILES[SR_TRACKS[srIdx].key];
    srApplyVol();
    srAudio.currentTime = 0;
    srAudio.play().catch(() => {});
    srRefreshList();
  }
  function srStop() {
    srAudio.pause();
    srAudio.removeAttribute('src');
    try { srAudio.load(); } catch (e) {}
    srIdx = -1;
    $('srSeek').value = 0; $('srCur').textContent = '0:00'; $('srDur').textContent = '0:00';
    srRefreshList();
  }
  /* 曲リスト生成 (グループ見出し付き) */
  (function buildSrList() {
    const wrap = $('srList');
    let lastG = null;
    SR_TRACKS.forEach((t, i) => {
      if (t.g !== lastG) {
        const h = document.createElement('div');
        h.className = 'sr-group';
        h.textContent = '― ' + t.g + ' ―';
        wrap.appendChild(h);
        lastG = t.g;
      }
      const b = document.createElement('button');
      b.className = 'sr-track';
      b.innerHTML = `<span class="sr-icon">▶</span><span>${t.name}</span>`;
      b.addEventListener('click', () => {
        if (i === srIdx) { /* 同じ曲は再生/一時停止トグル */
          if (srAudio.paused) srAudio.play().catch(() => {}); else srAudio.pause();
          srRefreshList();
        } else srPlayTrack(i);
      });
      wrap.appendChild(b);
    });
  })();
  $('srPlay').addEventListener('click', () => {
    if (srIdx < 0) { srPlayTrack(0); return; }
    if (srAudio.paused) srAudio.play().catch(() => {}); else srAudio.pause();
    srRefreshList();
  });
  $('srPrev').addEventListener('click', () => { if (srIdx >= 0) srPlayTrack(srIdx - 1); });
  $('srNext').addEventListener('click', () => { if (srIdx >= 0) srPlayTrack(srIdx + 1); });
  $('srLoop').addEventListener('click', () => {
    srLoop = !srLoop;
    $('srLoop').classList.toggle('on', srLoop);
  });
  srAudio.addEventListener('ended', () => {
    if (srIdx < 0) return;
    if (srLoop) { srAudio.currentTime = 0; srAudio.play().catch(() => {}); }
    else srPlayTrack(srIdx + 1); // 音楽プレイヤー風: 次の曲へ自動送り
  });
  srAudio.addEventListener('timeupdate', () => {
    if (!isFinite(srAudio.duration) || srAudio.duration <= 0) return;
    $('srSeek').value = Math.round(srAudio.currentTime / srAudio.duration * 1000);
    $('srCur').textContent = srFmt(srAudio.currentTime);
    $('srDur').textContent = srFmt(srAudio.duration);
  });
  srAudio.addEventListener('play', srRefreshList);
  srAudio.addEventListener('pause', srRefreshList);
  $('srSeek').addEventListener('input', () => {
    if (srIdx < 0 || !isFinite(srAudio.duration)) return;
    srAudio.currentTime = srAudio.duration * Number($('srSeek').value) / 1000;
  });
  $('srVol').addEventListener('input', () => { srVol = Number($('srVol').value) / 100; srApplyVol(); });
  stopSoundRoom = srStop; // メニュー一括クローズ時にも曲を停止
  $('btnCatSound').addEventListener('click', () => {
    audio.ensure();
    srRefreshList();
    $('soundOverlay').hidden = false;
  });
  $('btnCloseSound').addEventListener('click', () => { srStop(); $('soundOverlay').hidden = true; });
  $('soundOverlay').addEventListener('click', e => { if (e.target === $('soundOverlay')) { srStop(); $('soundOverlay').hidden = true; } });

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
    else if (k in keyMap) {
      e.preventDefault();
      /* [1]は回転中=第1ストップ / 非回転中=1BET */
      if (k === '1' && state.gamePhase !== 'spinning') addBet(1);
      else pressStop(keyMap[k]);
    }
    else if (k === 'm' || k === 'shift') setMaxBet();
    else if (k === 'b') addBet(1);
    else if (k === 'insert') rentCoins();
    else if (k === 'a') setAutoMode(!state.autoMode);
  });
  document.addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    if (k in keyMap) {
      el.stopBtns[keyMap[k]].classList.remove('pushed');
      onStopRelease();
    }
  });

  window.addEventListener('resize', layoutReels);

  /* --- スマホ誤操作対策 --- */
  /* ページの上下スクロールを抑止 (メニュー/小役一覧の中はスクロール可。
     画面に収まりきらない小型端末では通常スクロールを許可する保険付き) */
  document.addEventListener('touchmove', e => {
    if (e.target.closest && (e.target.closest('#modal') || e.target.closest('#payModal') || e.target.closest('.sub-modal'))) return;
    if (document.documentElement.scrollHeight > window.innerHeight + 4) return;
    e.preventDefault();
  }, { passive: false });
  /* ダブルタップ拡大防止 (ゲームボタンはpointerdown駆動のため影響なし。モーダル内のclickボタンは除外) */
  let lastTouchEnd = 0;
  document.addEventListener('touchend', e => {
    if (e.target.closest && (e.target.closest('#modalOverlay') || e.target.closest('#payOverlay') || e.target.closest('.sub-overlay'))) { lastTouchEnd = 0; return; }
    const t = Date.now();
    if (t - lastTouchEnd < 350) e.preventDefault();
    lastTouchEnd = t;
  }, { passive: false });
  /* ピンチ拡大防止 (iOS Safari) */
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('dblclick', e => e.preventDefault());
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
    setBonusBlink(state.bonusType, true); // リロード時は点滅も再開
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
