// ===== ぴったり入店ゲート：アセット設定 =====
// 画像を差し替えたいときは、このファイルのパスを書き換えるか、
// assets フォルダ内の画像を同じ名前で上書きしてください。
// SVG でも PNG でも使えます。読み込めなかった画像は、ゲーム内蔵の簡易な絵で代わりに描きます。
//
// 各画像は、ゲーム画面（横800×縦660）上の次の枠に引き伸ばして描かれます。
//   store  : 店        x200 y40  幅290 高さ150（下辺の中央にゲート）
//   queue  : 行列エリア x60  y420 幅560 高さ215
//   bubble : 吹き出し   x465 y30  幅300 高さ140（文字はゲームが上に描きます。
//                       文字の中心は x640 y84 と y122 あたり）
//   corridor      : 行列ゲートから店までの通路  x321 y190 幅48 高さ234
//
//   【店の自動ドア】（店の下辺の真ん中、x345 y190 が出入口の中心）
//   doorFrame     : 戸袋（左右の壁）とレール  x273 y181 幅144 高さ18（真ん中の68が出入口）
//   doorPanel     : ガラス戸1枚（左の戸）    幅34 高さ12。右の戸は左右反転して描かれ、
//                   開くと左右の戸袋へスライドします
//   doorMat       : ドア前のマット          x305 y198 幅80 高さ26
//   doorSensorOff : センサー（閉まっているとき） x331 y167 幅28 高さ10
//   doorSensorOn  : センサー（人が近づいて開いているとき） 同じ位置
//
//   【行列の出口ゲート】（ボタンで開け閉め。行列エリアの上辺の真ん中、x345 y420）
//   gate          : ゲートのバー            x317 y416 幅56 高さ8（開くと左の柱に縮んでいきます）
//   gatePost      : 柱（左右に1本ずつ）       幅12 高さ12。中心が x317 と x373（y420）
//   gateLampOff   : ランプ（閉まっているとき） 幅16 高さ16。中心が x391 y406
//   gateLampOn    : ランプ（開いているとき）   同じ位置
//
//   people : 並ぶ人。1人ずつランダムに選ばれます。personSize の大きさで描かれ、
//            personAnchor の位置が「その人の足元の中心」になります。
window.GAME_ASSETS = {
  background: null,                 // 例: 'assets/background.png'（800×660 全体に描画）
  store:  'assets/store.svg',
  queue:  'assets/queue.svg',
  bubble: 'assets/bubble.svg',
  corridor: 'assets/corridor.svg',

  // 店の自動ドア
  doorFrame:     'assets/door_frame.svg',
  doorPanel:     'assets/door_panel.svg',
  doorMat:       'assets/door_mat.svg',
  doorSensorOff: 'assets/door_sensor_off.svg',
  doorSensorOn:  'assets/door_sensor_on.svg',

  // 行列の出口ゲート
  gate:        'assets/gate.svg',
  gatePost:    'assets/gate_post.svg',
  gateLampOff: 'assets/gate_lamp_off.svg',
  gateLampOn:  'assets/gate_lamp_on.svg',

  people: [
    'assets/person_1.svg',
    'assets/person_2.svg',
    'assets/person_3.svg',
    'assets/person_4.svg',
    'assets/person_5.svg',
    'assets/person_6.svg',
  ],
  personSize:   { w: 24, h: 28 },
  personAnchor: { x: 12, y: 13 },   // 画像内のこの点が人の位置になる
};
