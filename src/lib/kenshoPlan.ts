/** 「たしかめる」で計画している検証テーマと原則。結果はまだ無いので、計画だけを持つ。 */

export type KenshoPrinciple = {
  title: string;
  description: string;
};

/** 検証の6原則。 */
export const KENSHO_PRINCIPLES: readonly KenshoPrinciple[] = [
  {
    title: "文化効果と宇宙の因果を分ける",
    description:
      "暦や迷信を意識して人が行動を変える効果（文化・行動の効果）と、天体や暦そのものが直接起こす効果を切り分けて記述します。",
  },
  {
    title: "事前登録（解析条件の先出し）",
    description:
      "都合のよい期間や閾値を後から選ばないよう、使うデータ・期間・閾値・検定方法を先に公開してから集計します。",
  },
  {
    title: "効果量と区間を出す",
    description:
      "p値だけで有無を断定せず、どの程度の大きさの差か（効果量）と不確かさの幅（信頼区間・予測区間）を併記します。",
  },
  {
    title: "多重比較の補正",
    description:
      "複数の区分（六曜や九星など）を同時に比べるときは、たまたま差が出たように見える偽陽性を防ぐため Holm 法などで補正します。",
  },
  {
    title: "差がなかった結果も出す",
    description:
      "統計的な差が見られなかった場合も、仮説どおりにならなかった記録としてそのまま公開します。",
  },
  {
    title: "限界を書く",
    description:
      "データの粒度・交絡因子・観測できない要因など、その検証だけでは言えない限界を明記します。",
  },
] as const;

export type KenshoPlannedTheme = {
  id: number;
  theme: string;
  claim: string;
  publicData: string;
  method: string;
  feasibility: string;
  status: "計画中";
};

/** 計画中の検証テーマ一覧（全13件、結果は未算出）。 */
export const KENSHO_PLANNED_THEMES: readonly KenshoPlannedTheme[] = [
  {
    id: 1,
    theme: "丙午",
    claim:
      "「丙午の年に生まれた女性は不幸になる、という迷信で出産が避けられるのか」",
    publicData: "人口動態統計（月次速報・月報）",
    method:
      "2015〜2025年の月次から2026年の予測線を先に公開し、実績との差を見る。性比と2027年の反動も見る。",
    feasibility: "高い",
    status: "計画中",
  },
  {
    id: 2,
    theme: "六曜",
    claim: "「仏滅や友引に交通事故は減るのか」",
    publicData: "警察庁 交通事故統計オープンデータ",
    method: "日別件数を曜日・祝日・月・年で調整した回帰で比べ、Holm法で補正。",
    feasibility: "高い",
    status: "計画中",
  },
  {
    id: 3,
    theme: "厄年",
    claim: "「厄年に死亡率は上がるのか」",
    publicData: "人口動態統計の年齢各歳別死亡数・生命表",
    method:
      "前後の年齢から引いた滑らかな曲線との差を、厄年でない年齢（偽の厄年）と比べる。",
    feasibility: "高い",
    status: "計画中",
  },
  {
    id: 4,
    theme: "九星気学",
    claim: "「五黄土星の年に大きな地震は多いのか」",
    publicData: "気象庁 震度データベース（1919年〜）",
    method:
      "九つの星の年で震度6弱以上の回数を比べる（並べ替え検定）。閾値と期間は先に公開。",
    feasibility: "高い",
    status: "計画中",
  },
  {
    id: 5,
    theme: "言い伝え",
    claim: "「夕焼けの翌日は晴れるのか」「満月の日に出産は増えるのか」",
    publicData: "気象庁 過去の気象データ、人口動態の日別出生",
    method: "代わりの指標の定義を先に公開し、晴れの基本の率と比べる。",
    feasibility: "高い",
    status: "計画中",
  },
  {
    id: 6,
    theme: "陰陽五行",
    claim: "「季節ごとに五行で割り当てられた臓器の病気が増えるのか」",
    publicData: "人口動態統計の死因別・月別死亡数",
    method: "死因分類と季節（月別）の推移を基準線と比較する。",
    feasibility: "中〜高",
    status: "計画中",
  },
  {
    id: 7,
    theme: "風水",
    claim: "「縁起の悪い数字の階は安くなるのか」",
    publicData: "国土交通省 不動産情報ライブラリ",
    method: "ヘドニック回帰",
    feasibility: "中",
    status: "計画中",
  },
  {
    id: 8,
    theme: "西洋占星術",
    claim: "「太陽星座で職業が決まるのか」",
    publicData: "国勢調査・公的統計の出生月分布および職業別統計",
    method: "出生月の分布と比べ、学年の区切りによる相対年齢効果を調整。",
    feasibility: "中",
    status: "計画中",
  },
  {
    id: 9,
    theme: "血液型",
    claim: "血液型と性格の関連に関する主張",
    publicData: "既存の研究論文（縄田 2014 など）",
    method: "既存の研究（縄田 2014 など）を紹介する記事。自分では解析しない。",
    feasibility: "紹介記事",
    status: "計画中",
  },
  {
    id: 10,
    theme: "四柱推命",
    claim: "吉日に生まれるよう出産日を選ぶ行動（文化効果）",
    publicData: "人口動態統計の出生日分布",
    method: "吉日に生まれるよう出産日を選ぶ行動（文化効果）のほうを扱う。",
    feasibility: "低〜中",
    status: "計画中",
  },
  {
    id: 11,
    theme: "奇門遁甲",
    claim: "方位術・日取りの吉凶に関する主張",
    publicData: "結果を記録した公開データなし",
    method:
      "結果を記録した公開データが無く、統計では検証できないと正直に書く。",
    feasibility: "低い",
    status: "計画中",
  },
  {
    id: 12,
    theme: "姓名判断",
    claim: "名前の画数と運勢に関する主張",
    publicData: "公的な名前のデータなし",
    method: "公的な名前のデータが無い。",
    feasibility: "低い",
    status: "計画中",
  },
  {
    id: 13,
    theme: "手相",
    claim: "掌線の形と運勢に関する主張",
    publicData: "公的な統計データなし",
    method: "紹介記事のみ。",
    feasibility: "低い",
    status: "計画中",
  },
] as const;
