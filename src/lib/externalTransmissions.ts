/**
 * 外部送信の公表（電気通信事業法 27 条の 12）。
 *
 * ブラウザから第三者へ実際に出ていく先だけを書く。サーバーが代わりに
 * 取りに行くもの（気象庁の予報、住所の検索）は利用者の端末から送られない
 * ので、ここには入れない。**新しく外部の部品を足したら、ここに 1 行足す**
 * （__tests__/privacyExternalTransmissions.test.ts が実装と突き合わせる）。
 * /privacy の「外部への送信について」の表がこれを読む。
 */
export const EXTERNAL_TRANSMISSIONS: {
  recipient: string;
  where: string;
  purpose: string;
  policy: string;
}[] = [
  {
    recipient: "Google LLC（Google AdSense）",
    where: "広告を表示するページ（広告の配信を始めた後）",
    purpose: "広告の配信、表示回数・クリックの計測、不正なクリックの防止",
    policy: "https://policies.google.com/privacy",
  },
  {
    recipient: "株式会社ファンコミュニケーションズ（A8.net）",
    where: "アフィリエイトの広告枠があるページ",
    purpose: "広告の表示とお申し込みの成果の計測",
    policy: "https://www.a8.net/privacy.html",
  },
  {
    recipient: "Google LLC（YouTube）",
    where:
      "動画を載せた記事。再生ボタンを押す前はサムネイル画像だけを読み込みます",
    purpose: "動画のサムネイルと再生",
    policy: "https://policies.google.com/privacy",
  },
  {
    recipient: "国土地理院（地理院タイル）",
    where: "地図を表示するページ",
    purpose: "地図画像の配信（表示している範囲の画像を取得します）",
    policy: "https://maps.gsi.go.jp/help/termsofuse.html",
  },
  {
    recipient: "Cloudflare, Inc.（cdnjs）",
    where: "一部の地図（移動の履歴、シミュレーター）",
    purpose: "地図の目印の画像の配信",
    policy: "https://www.cloudflare.com/privacypolicy/",
  },
  {
    recipient: "Supabase（認証とデータベースの委託先）",
    where: "ログイン、ログイン中の設定の保存",
    purpose: "ログインの認証と、アカウントに保存する設定の管理",
    policy: "https://supabase.com/privacy",
  },
];
