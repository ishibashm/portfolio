/**
 * 政府統計の総合窓口（e-Stat）の API 機能の利用規約が求めるクレジット。
 * **文言は規約が指定している。言い換えると満たさなくなる。**
 *
 * 以前は `api/housing-stats/by-direction/route.ts` が export していた。
 * route ファイルは route 以外の名前を export できない（`next dev` を
 * 起こすと `.next/types` が生成され、tsc が拾う。`ignoreBuildErrors: true`
 * なので CI では出ないが、手元の `tsc --noEmit` が落ちる）。読む側
 * （route の meta.credit・テスト 2 本）はここから引く。
 *
 * 表示場所は「利用される方が参照できる場所」なら自由（規約）。
 * e-Stat の API で取ったデータを新しく出す頁を足したら、
 * `__tests__/estatApiCredit.test.ts` の一覧に足す。
 */
export const ESTAT_API_CREDIT =
  "このサービスは、政府統計総合窓口(e-Stat)のAPI機能を使用していますが、サービスの内容は国によって保証されたものではありません。";
