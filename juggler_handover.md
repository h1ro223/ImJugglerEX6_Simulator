# アイムジャグラーEX (6号機) シミュレーター 引き継ぎ資料 (v3.4時点)

新しいチャットではこのファイル + index.html / style.css / script.js の3ファイルを添付して開始してください。

## 厳守ルール
- ファイル名固定: index.html / style.css / script.js。参照は `./` 形式。
- **Sonnet選択中はコーディング禁止(質問・提案・コード確認のみ)。「Fableに切り替えた」等の合図でコーディング開始**
- コード修正時は行番号を報告。既存機能を勝手に削らない・コード量を勝手に減らさない。
- git pushしない(ユーザーが自分でアップロードする)。
- 「made by hiro/ヒロ」+ https://github.com/h1ro223 リンクをindex.html内に維持必須。
- クレジット消費を抑えるため無駄な処理をしない(Fable 5はクレジット制)。python一括編集+assert検証+最小限のテスト追加で効率化する。
- 納品: /mnt/user-data/outputs/ に該当ファイル+zip(juggler_update.zip、フォルダ一式)をpresent_files。作業dir: /home/claude/juggler/

## 検証環境
/home/claude/blink_test.js: vm+DOMスタブ+仮想時計のテストハーネス(v3.1で再構築・v3.2で拡張・v3.3で再構築・v3.4で拡張・現在173項目ALL PASS、コンテナリセット時は要再作成)。
- スタブに `documentElement`、`style.setProperty`、canvas `getContext` 等が必要(過去に不足しエラーになった実績あり)。
- `reels`配列はinit()時のみ生成されるため、テスト冒頭で `if (!reels.length) reels.push(new Reel(0), new Reel(1), new Reel(2));` が必要。
- BGMコールを監視する場合は `audio.playBGM` をラップして `__bgmCalls` 配列に記録するスパイを仕込む。
- **script.jsのトップレベル `let`/`const` はvmのglobalに現れない**ため、ソース末尾に `globalThis.__x_名前 = 名前` を並べたエクスポートコードを連結してから `runInContext` する必要がある(v3.1のハーネスはこの方式)。
- 納品前チェック: `node --check script.js` / 全テスト / `$('id')`参照とHTML id整合(customIn_*/customOff_*/srSecretTrack/customStatusは動的生成なので除外) / HTMLタグ整合 / made by hiro残存 / v3.4表記確認。

## ゲーム仕様 (確定済み・v3.0時点)
- リール21コマ×3。左[4,7,5,1,5,1,6,2,1,5,1,7,3,1,5,1,2,6,1,5,1] 中[5,7,1,2,5,4,1,2,5,6,1,2,5,4,1,2,5,6,1,2,3] 右[1,7,6,4,5,1,3,4,5,1,3,4,5,1,3,4,5,1,3,4,5] (1=ブドウ2=チェリー3=ピエロ4=ベル5=リプレイ6=BAR7=7)
- 確率: BB設定1-6=1/273.1〜255.0、RB=1/439.8〜255.0、ブドウ1/6.02(設定6=5.85)、リプレイ1/7.298、チェリー1/38.1、ベル・ピエロ1/1092.3。中段チェリー=BB確定内数・レインボー。
- **チェリー配当**: 3BET=1枚×2ライン=2枚 / 2BET=7枚×2ライン=14枚 / **1BETは停止形で分岐** — 非ボーナス時の**連チェリー**(左チェリー+中リールの真横or斜めにチェリー)は1枚×2ライン=**2枚**、**単チェリー**(重複当選時)は従来通り7枚×2ライン=14枚。`cherryUnitFor(bet, cols)`が1ラインあたりの単価を返し`payoutFor(wins, bet, cherryUnit)`へ渡す。
- 主要定数: `MAX_SLIP=4` `CELL_GAP_RATIO=0.10` `PEEK_RATIO=0.24` `REV_MS=780` `WAIT_MS=4100`(実機規定) `PEKA_FIRST=0.15` `BB_LIMIT=280` `RB_LIMIT=98` `BB_SKIP_PAY=252` `RB_SKIP_PAY=96` `BET_LAMP_MS=50` `BET_CT_MS=100` `PAY_CAP=15` `COUNT_MS=100` `CREDIT_MAX=50`。セーブキー`imjuggler_ex_6_save_v1`/`imjuggler_ex_6_missions_v1`。
- GOGO点灯中のみボーナス整列可(未点灯時は蹴飛ばし)。楽曲ver判定はフラグ当選G基準(bbWinG)。SP(軍艦マーチ)=1G/D9(第九)=2-5G/UNMEI(運命)=ゾロ目(77除く)/X(777)=77ちょうど/他NORMAL。
  **重要**: `pickBBVersion()`は先頭で`state.hadBonus`をチェックし、**前回ボーナスが存在しない間は必ずNORMALを返す**。これがないとBB0/RB0/総回転0の状態で1G目や2〜5G目に当選しただけで軍艦マーチver・第九verが鳴ってしまう(v3.3で修正)。
- **有効設定・確率の優先順位**: 判別チャレンジ中(隠し設定) > カスタム設定モード > 通常設定。`getProbs()`/`effSetting()`で一元管理。
- **カスタム設定モード**: 各役「1/○○」入力+**無効チェックボックス**(チェック or 0入力で確率0=発生しない)。台設定内。
- **設定判別チャレンジ**: 隠し設定ランダム(1-6)・設定変更/カスタム設定/GOGO確定ロック・1-6で回答・通算成績保存。
- **隠しコマンド(PC限定・完全サイレント)**: 待機中にG,O,G,O→通常ペカ確定(先ペカ15%/後ペカ85%はそのまま抽選) / G,O,G,O,7,7,7→レインボー(中段チェリー)確定=BB確定。`secretBuf`に記録、レバー押下時に`consumeSecretCommand()`で判定・消費。
- **現在のボーナスをスキップ**: 台設定内。ボタン名は**BB/RBで出し分けず「現在のボーナスをスキップ (最大枚数を即獲得)」で固定**。**COUNT表示(`state.bonusPaid`、終了メッセージの「○○枚獲得!」も同じ)は通常消化時と同じBB=294枚/RB=112枚まで進める**が、**実際に持ちメダル・累計払い出し(`totalOut`/`mochi`)に加算するのは実質手取りのBB=252枚(`BB_SKIP_PAY`)/RB=96枚(`RB_SKIP_PAY`)のみ**という二重構造。実質手取りは払い出し上限(294/112)から消化に必要なゲーム数×2BET分(21G×2=42 / 8G×2=16)を差し引いた値で、通常消化した場合と収支が一致する。既に実質手取りを超えて消化済みの場合は`Math.max`で現在値を維持し実際の獲得枚数が減らない(COUNT表示は常に294/112まで到達)。**777ver(Xver)はスキップ不可**(演出優先)。
- **台設定→スタートG数編集**: 777ver検証用に現在のスタートG数を直接書き換え可能。

## 単チェリー仕様 (v3.1で実装・旧「未解決課題」は解決済み)
実機の「単チェリー」= **順押し(左→中→右)で左リールにチェリーが露出しているのに、中リールの真横・斜め(上下1コマ)にチェリーが繋がっていない停止形**。この形が出た時点でボーナス成立が確定する。
v3.1では**停止制御と点灯の両方向**で整合を取っている。
- `state.dupCherry`: そのゲームのチェリーがボーナス重複契機か(重複BB/RB または中段チェリー)。毎ゲームのレバーON時に必ず更新(ボーナス中は常にfalse)。
- **停止制御** (`chooseStopPosition`内、順押しの第2停止=中リールのみ):
  - 重複時 → 中リールに「繋がらない」停止形を優先(=必ず単チェリーになる)
  - 非重複時 → 中リールに「必ず繋がる」停止形を優先(=単チェリーを絶対に出さない)
  - 実装は `penalty += 40` の加点方式。チェリーはライン成立が左リールのみで決まるため他候補と同点となり、この加点だけで綺麗に選別される。スベリは常に4コマ以内に収まる(中リールのチェリー配置が4コマ間隔=どちらの形も必ず引き込めることを検証済み)。
- **点灯** (`onStopRelease`内): 第3停止ボタンを離した瞬間に `isSoloCherry()` を判定し、単チェリー形かつボーナス保持中なら**後ペカ抽選の結果に関わらず必ず点灯**させる(保険)。逆押し・中押し・ボーナス中・ボーナス非成立時は強制点灯しない(誤点灯防止)。
- ヘルパー関数: `cherryRows()` / `centerCherryLinked()` / `isSoloCherry()` (script.js の「単チェリー判定」セクション)。
- 検証: ランダム押下2000回で 重複=単チェリー形100%・点灯100% / 非重複=連チェリー形100% を確認済み。

## 未解決・保留中の課題
- 現在なし。

## v3.3で追加された仕様

### ボーナス楽曲ver「軍艦マーチ」
- 1Gver の表示名を「シークレットver」→ **「軍艦マーチver」** に変更(内部キー`SP`/`BBHITSP`/`BBSP`/`BBFINISHSP`/`verSP`は**変更なし**)。ミッションm37の文言とサウンドルームのグループ見出し・曲名が対象。
- サウンドルーム最下部の「― SPECIAL ―」枠(`FUNKY`/I'm FUNKY JUGGLER)は**別物なので変更していない**。

### LeverSP.mp3
- `SE_FILES.LEVERSP = './SE/LeverSP.mp3'`。
- **軍艦マーチver(SP)のBB中のみ**、そのボーナス内の**7ゲームごと**(1G目・8G目・15G目 = COUNT 0→14 / 98→112 / 196→210)のレバーONで`Lever.mp3`の代わりに再生。
- 判定は`leverSEKey()`。BB中は毎ゲーム14枚払い出しのため `Math.floor(bonusPaid / 14) + 1` でボーナス内消化G数が求まり、`(gameNo - 1) % 7 === 0`で判定。BB上限(21G)内で自然に3回で打ち止めになる。

### Wait.mp3 (ウェイト中ループ)
- `SE_FILES.WAIT = './SE/Wait.mp3'`(約0.3秒の短尺)。
- `audio.playSELoop(key)` / `audio.stopSELoop()` を新設。**WebAudioの`AudioBufferSourceNode.loop`**を使うため継ぎ目のない完全ループになる(HTMLAudioの`loop`属性にフォールバック)。
- **再生フロー**: BET(Bet/MaxBet音) → レバーON時にウェイトが残っていれば`state.inWait=true`にして`Wait.mp3`をループ開始し、**Lever音・レバーアニメーション・リール回転開始をすべて保留** → ウェイト終了と同時に`stopSELoop()`で即停止し、`doLeverAction()`(Lever音+レバーアニメ)と`startGame()`(回転開始)を実行。
- ウェイトが残っていない場合は従来通り即座に`doLeverAction()`+`startGame()`。
- `resetAll()`でも`audio.stopSELoop()`を呼んでいる。

### 状態ランプ (Start / Replay / Wait / Insert Medals)
- 実機パネル準拠の**色分け**: Start=赤 / Replay=青 / Wait=緑 / Insert Medals=白。CSS変数`--lampOff`(消灯時の暗いトーン)/`--lampBg`/`--lampOn`/`--lampGlow`を`#lampStart`等のidセレクタで定義し、`.state-lamp.on`で明るいトーン+グローに切り替える。
- 制御は**`updateStateLamps()`に一元化**(`updateUI()`から毎回呼ぶ)。個別のclassList操作は`startGame()`/リプレイ成立箇所から撤去済み。
- 点灯条件:
  - `Insert Medals` … レバー待ち(`gamePhase==='idle' && !xLock`)の間ずっと**0.20秒間隔で点滅**(`.blink`クラス+`@keyframes lampBlink`、0.4秒周期)。BET数に関わらず点滅を継続。
  - `Start` … レバー待ちかつ`bet > 0 || replayPending > 0`。
  - `Wait` … `state.inWait`のみ。
  - `Replay` … **`state.replayLamp`をそのまま反映(リール回転中も消灯しない)**。`state.replayLamp`はリプレイ成立時に`true`になり、**次のゲームのresolveGameで`hasReplay`の値に更新される**。したがって「1G目リプレイ揃い→点灯 / 2G目は回転中も点灯を維持 / 2G目停止で再びリプレイなら点灯継続・外れれば消灯」となる(v3.4で修正)。ボーナス図柄整列時は`startBonus`直前に`false`にする。

### システム設定「GOGO!CHANCE中は1BETのみにする」
- `state.gogo1Bet`(既定OFF)。判定は`gogoOneBetActive()` = `gogo1Bet && lampLit && !inBonus`。
- 有効時、`addBet()`/`setMaxBet()`のBET上限が1になる(**MAXBETを押しても1枚だけ入る**。ボタン自体は無効化しない)。SEも1枚時は`BET`音。
- 既にBET済みの枚数を戻すことはしない(実機同様BETは取り消せないため)。次のBETから制限がかかる。

### システム設定「簡単レバーモード」
- `state.easyLever`(**既定OFF**)。OFF時は**BET0でレバーを引けない**(実機準拠。実機レバー・スペースキー共通、メッセージ「メダルをBETしてください」)。
- ON時は従来どおりBET0でレバーを引くとMAXBET→レバーをまとめて実行(自動BET枚数は`betCapNow()`に従う)。

## v3.4で追加・変更された仕様

### BET上限と操作可否の一元管理
- **`betCapNow()`**: 現在BETできる上限枚数を返す。**ボーナス中=2枚**(GOGO中1BET設定より優先) / GOGO中1BET設定有効=1枚 / 通常=3枚。`addBet()`/`setMaxBet()`/ボタン活性判定がすべてこれを参照する。
- **`canPullLever()`**: レバーを引けるか(BET数の観点のみ)。`replayPending > 0` または `bet > 0` または `easyLever` がtrueなら引ける。
- **レバーのグレーアウト**: `el.lever.classList.toggle('disabled', !idle || xLock || !canPullLever())`。0BET時は視覚的にもグレーアウトし、1BET以上で解除される。
- **ボーナス中もMAXBETが必要に**: 従来はレバーONで自動的に2枚BETしていたが、**MAXBETボタンを有効化**し、2BETするまではレバーがグレーアウトする実機挙動に変更。1BETボタンはボーナス中も無効のまま。`leverOn()`内のボーナス専用自動BET分岐は撤去し、通常のBET0分岐に統合した。

### LeverSPと通常Leverの同時再生
- `audio.playSE(key, overlap, volMult)` に**第3引数の音量倍率**を追加(WebAudioはGainNode、HTMLAudioは`volume`で対応)。
- `doLeverAction()`は`leverSEKey()`が`LEVERSP`を返したとき、**`LeverSP.mp3`と`Lever.mp3`を同時再生**し、`Lever.mp3`側は`LEVER_SUB_VOL = 0.22`まで音量を絞る(ギリギリ聞こえる程度)。

### BETランプの順次点灯 / BETクールタイム / Auto Modeの自動BET
- **BETランプの順次点灯**: MAXBETで1・2・3を同時に光らせず、**`BET_LAMP_MS`(50ms=0.05秒)間隔で1本ずつ点灯**させる(MaxBet2/3.mp3の効果音に同期させる意図)。1本目は即時点灯し、以降0.05秒間隔。
  - `state.betLampShown`(今表示している本数)と`betLampTimer`で管理。`animateBetLamps(target)`/`renderBetLamps()`/`clearBetLampAnim()`。
  - `updateUI()`内で「増加時のみ演出、減少・消灯は即時」の判定を行う。777verの疑似BET(`xFakeBet`)も`betLampShown`経由に統一。
- **BETクールタイム**: 1BET/MAXBETを押してから**`BET_CT_MS`(100ms=0.1秒)はレバーを受け付けない**(同時押し対策)。`startBetCT()`で`state.betCtUntil`をセットし、`betCtActive()`が`leverOn()`冒頭とレバーのグレーアウト判定の両方で使われる。CT中はレバーが視覚的にもグレーアウトする。
- **Auto Modeの自動BET**: `autoNextGame()`がレバーを引く前に、`state.replayPending`が無くBET0なら**`setMaxBet()`で`betCapNow()`枚を自動投入**する。つまり**非ボーナス=3BET / GOGO!CHANCE点灯中で1BET設定ON=1BET / ボーナス中=2BET**。メダル不足時はBETせず1秒後にリトライ。投入後は`BET_CT_MS + 30`ms待ってから`leverOn(500)`を呼ぶ(クールタイムに弾かれないため)。**簡単レバーモードのON/OFFに関係なく自動BETされる**。

### ボーナス履歴グラフの反映タイミング
- `state.pendingHist`を`state.history`へunshiftする処理を、`endBonus()`の冒頭から**`hideCount()`の中へ移動**。これにより**COUNT表示が「---」になるのと完全に同じタイミング**で履歴グラフが1コマ右にシフトする。`hideCount()`内で`renderGraph()`/`saveGame()`/`updateUI()`も呼ぶ。

## UI構成 (v3.0)
- ヘッダー右上: Auto Modeボタン(ON=緑発光・**表示テキストは常に"Auto Mode"固定**)+♪ボタン(音量ポップアップ=BGM/SEのON-OFF+音量。**システム設定内にも同じ操作項目があり両方から操作可能・常に同期**、`syncSoundControls()`で一元管理)。
- ☰ハンバーガーメニュー: チャレンジモード/ミッション/サウンドルーム/小役一覧/台設定/システム設定/**リセット**(台データ/ミッション進捗/全リセットを1箇所に集約、各リセットは確認ポップアップ経由)。
- 台設定: 設定1-6/リール速度/GOGO確定ボタン/**スタートG数編集**/**現在のボーナスをスキップ**/カスタム設定モード。
- システム設定: メッセージバー/サウンド(♪ポップアップと同期)/**データ表示モード切替**/データ管理(JSON全データのエクスポート/インポート、SAVE_KEY+MISSION_SAVE_KEYをまとめて1ファイル化)。
- **データ表示モード(PC推奨・システム設定内で切替)**: ON時、画面右に差枚推移グラフ(canvas描画、表示レンジ100/200/300/500/1000Gを選択可・自動拡張)+実戦データカード(BB/RB実測確率・出玉率・ボーナス平均G・現在差枚・設定状態・ミッション達成数・判別チャレンジ成績)。`state.diffLog`(1ゲームごとの差枚ログ)・`state.diffBase`(データリセット時の基準値)。
- **サウンドルーム(音楽プレイヤー風)**: シーク/前後送り/**ループ(ブラウザ標準loop属性でシームレス化済み)**/専用音量。バージョン別グループ表示。**最下部に「― SPECIAL ―」枠**、シークレット曲「I'm FUNKY JUGGLER」(`./BGM/777.mp3`)は777ver完走まで🔒「???」。解放時は☰ボタン・サウンドルームボタンが黄色グロー発光、サウンドルームを開くと自動スクロール+輝きながら曲名が明らかになる演出。
- GOGOランプ: `GOGOCHANCE_0/1.png`(通常)+`gogoImgRainbow`(`GOGOCHANCE_2.png`、CHANCE文字だけの透過画像を`GOGOCHANCE_1.png`の上に重ねてhue-rotateアニメーション=中段チェリー時のレインボー)。
- ミッション: **全70個**(累計20/連チャン14/レア役16/応用20=v3.0で追加)。トースト通知(画面右上スライドイン)。進捗は`mstore`(生涯記録・データリセットでは消えず、システム設定内の「ミッション・進捗リセット」でのみ初期化)。

## 777ver(激アツ演出) ※v3.0の目玉・最重要
- 発生条件: ボーナス終了後77Gピッタリ(bbWinG===77)でBB当選。
- **77G目でGOGO!CHANCE点灯時**: ヘッダーの「スタート」数字が`.x-blink`クラスでゆっくりフェード点滅(777が揃うまで)。GOGO!SE停止0.1秒後から`GOGOCHANCE_X.mp3`(`GOGOX`キー)を煽りループ再生(777が揃うまで)。
- **777揃った瞬間**: 煽り即停止+ランプ消灯+スタートG点滅終了 → `xRunIntro()`実行:
  - `state.xLock=true`(貸出/BET/精算/レバー/停止 全操作ロック。レバーは視覚的にもグレーアウト)、`state.seMuteX=true`(Bet/MaxBet/Lever/Stop/GOGO SEを`playSE`内でミュート、hit曲に内蔵されているため)。
  - **疑似リプレイ演出**(`xRunChoreo(X_CHOREO1)`、実リール回転・停止を使用、メダル/回転数は一切変動しない見せかけ): `X_CHOREO1={bet:3100,lever:3850,s1:4650,s2:5030,s3:5410,rainbow:5820}` (ms、BBhitX再生開始からのオフセット)。各停止は中段に7を強制表示(`xFakeStop`)。
  - **暗転演出**: 1BETと同時(t.bet)に画面全体を黒75%で覆い中段リール帯だけくり抜き(`#xDimOverlay`/`#xDimHole`、`xDim(true/false)`、リール位置は`getBoundingClientRect()`で都度実測)、レインボー点灯(t.rainbow)と同時に解除。
  - `BBhitX.mp3`再生 → 終了後`BBX1.mp3`ループ開始+**BIG CHANCEバナー全体がhue-rotateで虹色回転**(`#topBanner.x-rainbow`)。
  - **xLock解除条件は「音声再生終了」と「疑似リプレイ演出完了(X_CHOREO1.rainbow+150ms)」の両方が揃った時点**(重要: BGM OFF時は音声が即時完了扱いになり演出より早く終わってしまうバグが過去にあったため、両条件のANDを取る設計に修正済み。`done1`カウンタ方式)。
- **COUNT表示(disp.bonus、内部値ではなく実際の表示値)が210に達した瞬間**: `BBX1`即停止→`BBX2`ループ開始(`xCheckPhase()`、`renderMedals()`内から毎フレーム呼び出し)。
- **294枚到達(内部bonusPaid>280)**: `xEnterSecond()`実行。`state.xLock=true`を即セット(BBFinishX再生前から)→`BBX2`停止+レインボー消灯+バナー虹色OFF→`BBFinishX.mp3`再生→**終了と思いきや、再生終了と同時にセカンドゾーン突入**:
  - `state.xMode=2`、`X_CHOREO2={bet:0,lever:770,s1:1550,s2:1930,s3:2320,rainbow:2700}`で疑似リプレイ第2弾+暗転(再生と同時に暗転開始)。COUNT294表示は維持したまま。
  - `BBhitX_2nd.mp3`終了後`BBX_2nd.mp3`ループ+バナー虹色再ON。xLock解除条件は同じく「音声終了 AND 演出完了(X_CHOREO2.rainbow+150ms)」。
  - リミットは294〜**336枚**(`336-14`が実質的なlimit)まで延長。
- **336枚到達**: `BBFinishX_2nd.mp3`再生→3.1秒後にレインボーが2.5秒かけてフェードアウト(`.x-fade`クラス、`opacity`トランジション)→通常のendBonusフローで終了。`xMode`リセット。
- **GetGrape14Xは廃止**、通常の`GetGrape14.mp3`を使用。
- 777ver中は「現在のボーナスをスキップ」ボタン無効。COUNT表示は294のままセカンドゾーンに入るのでプレイヤーには「終わったと見せかけて実は続く」演出に見える。
- **タイミング調整**: `X_CHOREO1`/`X_CHOREO2`定数(script.js冒頭付近)の数値を書き換えるだけで全タイミングを一括調整可能。

## BGM_FILESキー一覧(777ver関連追加分)
`GOGOX`(GOGOCHANCE_X.mp3) `BBX1` `BBX2` `BBHITX2`(BBhitX_2nd.mp3) `BBX2ND`(BBX_2nd.mp3) `BBFINISHX2`(BBFinishX_2nd.mp3) `FUNKY`(777.mp3)。旧`BBX`キーは廃止(`BBX1`に統合)。`bbLoopKey()`関数が777verの進行段階(xMode・COUNT)に応じて正しいループ曲キーを返す(リロード復帰・BGM ON/OFF切替時の再開に使用)。

## フォルダ構成
```
juggler/
  index.html, style.css, script.js, juggler_handover.md(本ファイル)
  font/DSEG7Modern-Bold.ttf
  GOGO/ (GOGOCHANCE_0/1/2.png ※2は中段チェリー時のCHANCE文字レインボー用透過画像)
  Reel/ (7種png)
  BGM/ (通常+シークレットver+第九ver+運命ver+777ver一式+777.mp3)
  SE/
  icon/gogo.png
```

## 削除済み機能(過去に実装→撤去)
- **「CPUとプレイ」モード**: 一度実装したが「正直微妙」との判断で完全撤去済み(script.js/index.html/style.cssから該当コード削除)。今後再度依頼があれば要相談。

## 現在のファイル状態
index.html 428行 / style.css 698行 / script.js 3023行 (v3.4)。テスト173項目ALL PASS。

## 今後の予定(ユーザー要望・未着手)
- BET数ランプ(1/2/3)の見た目を、Start/Replay/Wait/Insert Medalsと同様に**本家寄りのデザインへ変更**する可能性あり。現状は`#betLamps`+`.bet-lamp`(style.css 184行目付近)の黄色丸ランプ。

## v3.4の変更点
- Insert Medalsの点滅を0.15秒間隔→**0.20秒間隔**(style.css `.state-lamp.blink`の`.3s`→`.4s`)。
- Replayランプがリール回転中に消えていたのを修正(`updateStateLamps()`)。ボーナス整列時は`resolveGame()`で消灯。
- `betCapNow()`/`canPullLever()`を新設し、0BET時のレバーグレーアウト・ボーナス中MAXBET必須化を実装。
- `audio.playSE()`に音量倍率引数を追加し、`doLeverAction()`でLeverSPとLeverを同時再生(`LEVER_SUB_VOL=0.22`)。
- 履歴グラフの反映を`hideCount()`(COUNT「---」化)と同時に移動。
- 台設定ボタン名を「次ゲームでGOGO!確定 (1回)」→**「次ゲームでGOGO!CHANCE点灯」**(index.html 190行目 / script.js `refreshPekaBtn()`)。
- バージョン表記を v3.3 → v3.4 に更新(index.html 6行目・19行目)。
- (v3.4追補) `BET_LAMP_MS=50`/`BET_CT_MS=100`を新設。BETランプの順次点灯(`animateBetLamps`/`renderBetLamps`/`clearBetLampAnim`)、BETクールタイム(`startBetCT`/`betCtActive`)、Auto Modeの自動BET(`autoNextGame`)を実装。`state`に`betLampShown`/`betCtUntil`を追加。

## v3.3の変更点
- 「シークレットver」→「軍艦マーチver」表記変更(script.js ミッションm37 / サウンドルーム曲リスト)。
- `pickBBVersion()`に`hadBonus`ガードを追加(初回ボーナスは必ずNORMAL)。
- `SE_FILES`に`LEVERSP`/`WAIT`を追加、`leverSEKey()`/`doLeverAction()`を新設、`fireLever()`を再構成。
- `audio.playSELoop()`/`audio.stopSELoop()`を新設(WebAudioのloopでシームレス再生)。
- `updateStateLamps()`を新設し状態ランプ制御を一元化。style.cssにランプ4色+点滅アニメーションを追加。
- `gogoOneBetActive()`を新設し`addBet()`/`setMaxBet()`/ボタン活性判定に反映。
- `payoutFor()`に`cherryUnit`引数、`cherryUnitFor()`を新設(1BET連チェリー=2枚)。
- `state`に`inWait`/`replayLamp`/`gogo1Bet`/`easyLever`を追加(セーブ/ロード/リセット対応)。
- index.htmlのシステム設定に「ゲーム操作」セクション+チェックボックス2つを追加。
- バージョン表記を v3.2 → v3.3 に更新(index.html 6行目・19行目)。

## v3.2の変更点
- `WAIT_MS` を 1500 → **4100**(実機規定4.1秒)に復帰。script.js 104行目。
- 定数 `BB_SKIP_PAY=252` / `RB_SKIP_PAY=96` を新設。script.js 122-125行目。
- 「現在のボーナスをスキップ」ボタンの表示テキストを**BB/RBで出し分けず固定**に変更。script.js 2103行目付近(`refreshSkipBtn`)。
- `skipBonus()` の即時獲得枚数を 294/112 → **252/96** に変更＋超過時のガード追加。さらに**COUNT表示(`bonusPaid`)は294/112まで進め、実際の払い出し(`addPayout`)だけ252/96で頭打ち**という二重構造に修正(グロス/ネットの分離)。script.js 2107-2119行目付近。
- 確認ダイアログの枚数表示を定数参照に変更。script.js 2414行目付近。
- バージョン表記を v3.1 → v3.2 に更新(index.html 6行目・19行目)。

## v3.1の変更点
- 単チェリー仕様を実装(上記セクション参照)。script.js に「単チェリー判定」セクション(597-624行付近)を新設、`chooseStopPosition`の第1・第2停止スコアに単チェリー制御(695-701行付近)、`onStopRelease`を書き換え(1187-1201行付近)、`state.dupCherry`を追加(332行付近)、レバーON時の抽選結果反映(1041行/1092行付近)。
- バージョン表記を v3.0 → v3.1 に更新(index.html 6行目・19行目)。
- テストハーネスを再構築(98項目)。
