// ===== オンラインランキングの設定 =====
// Firebase のプロジェクトを作って、「ウェブアプリを追加」で表示される firebaseConfig の値をここに貼り付けてください。
// apiKey が空のままだと、ランキングは「未設定」と表示され、ゲームはふつうに遊べます。
// 手順は README.md の「オンラインランキングの設定」を見てください。
//
// ※ この値は公開されても問題ありません（Firebase のウェブ用の設定はもともと公開される前提です）。
//    書き込める内容は firestore.rules で制限します。
window.RANKING_CONFIG = {
  firebase: {
    apiKey: '',
    authDomain: '',
    projectId: '',
    appId: '',
  },
  topN: 10,          // 表示する順位の数
};
