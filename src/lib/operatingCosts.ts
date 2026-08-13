/**
 * このサイトを動かすのに掛かっている経費。
 *
 * **金額はここだけに置く。**画面にも集計にも同じ表から出す。散らすと、
 * 片方だけ更新されて「合計は合っているのに内訳が古い」状態になる。
 *
 * 数字は**推測で埋めない。**分からないものは `null`（未設定）にして、
 * 画面にもそう出す。もっともらしい額を置くと、あとから見た人がそれを
 * 実額だと思い込む。市区町村の所得で同じことが起きている（#231）。
 *
 * 実額が分かったら `monthlyYen` を埋めて PR を出す。コミット履歴が
 * そのまま「いつ経費が変わったか」の記録になる。
 *
 * ここは**固定費だけ**を持つ。従量課金の推定（外部 API の呼び出し回数 ×
 * 単価）と、GCP の請求 API から引く実額は別の口から入れて、画面で合算する。
 */

export interface CostItem {
  key: string;
  label: string;
  /** 月額（円）。分からないものは null。推測値を入れないこと。 */
  monthlyYen: number | null;
  /** 何に対する費用か。無料枠の条件など、額が変わる条件もここに書く。 */
  note: string;
}

/**
 * 固定費の一覧。
 *
 * `deploy.yml` の名前のとおり Cloud Run は無料枠前提で組んである。
 * 無料枠に収まっているあいだは 0 だが、**0 と「未設定」は違う**ので、
 * 確かめたものだけ 0 にする。
 */
export const FIXED_COSTS: CostItem[] = [
  {
    key: "cloud_run",
    label: "Cloud Run",
    monthlyYen: null,
    note: "本番のホスティング。deploy.yml は無料枠向けに組んである（最小インスタンス 0）。超えた月だけ課金される",
  },
  {
    key: "supabase",
    label: "Supabase",
    monthlyYen: null,
    note: "DB と認証。無料プランには行数と帯域の上限がある",
  },
  {
    key: "domain",
    label: "ドメイン",
    monthlyYen: null,
    note: "cloud-palette.com の更新料。年額を 12 で割った額を入れる",
  },
  {
    key: "artifact_registry",
    label: "Artifact Registry",
    monthlyYen: null,
    note: "デプロイのたびに積み上がるコンテナイメージの保管料",
  },
  {
    key: "external_api",
    label: "外部 API（固定）",
    monthlyYen: null,
    note: "月額が決まっているものだけ。呼び出し回数で決まるものは従量の側で数える",
  },
];

/** 合計。1 つでも未設定なら、合計も出せないものとして null を返す。 */
export function totalMonthlyYen(
  items: CostItem[] = FIXED_COSTS,
): number | null {
  if (items.length === 0) return 0;
  // 一部だけ埋まった状態で足すと、実際より小さい額が「合計」として出る。
  if (items.some((i) => i.monthlyYen === null)) return null;
  return items.reduce((sum, i) => sum + (i.monthlyYen ?? 0), 0);
}

/** 未設定の項目。画面に「何を埋めれば合計が出るか」を出すために使う。 */
export function unsetItems(items: CostItem[] = FIXED_COSTS): CostItem[] {
  return items.filter((i) => i.monthlyYen === null);
}

/**
 * 1 件あたりの単価。分母が 0 のときは null。
 *
 * 「登録者 1 人あたり」「1000PV あたり」を出すのに使う。経費そのものより、
 * 利用が増えたときに割に合うのかが読めるほうが判断に効く。
 */
export function perUnitYen(
  totalYen: number | null,
  count: number,
  per = 1,
): number | null {
  if (totalYen === null || count <= 0) return null;
  return (totalYen / count) * per;
}
