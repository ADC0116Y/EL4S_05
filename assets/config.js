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
//   gate   : ゲートのバー 幅68 高さ8（開くと左の柱に縮んでいきます）
//   people : 並ぶ人。1人ずつランダムに選ばれます。personSize の大きさで描かれ、
//            personAnchor の位置が「その人の足元の中心」になります。
window.GAME_ASSETS = {
  background: null,                 // 例: 'assets/background.png'（800×660 全体に描画）
  store:  'assets/store.svg',
  queue:  'assets/queue.svg',
  bubble: 'assets/bubble.svg',
  gate:   'assets/gate.svg',
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
