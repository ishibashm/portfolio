import * as dotenv from "dotenv";
import path from "path";
import fs from "fs/promises";
import { aggregateWealth, type EstatStatsResponse } from "./estatWealth";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const ESTAT_APP_ID = process.env.ESTAT_APP_ID;

if (!ESTAT_APP_ID) {
  console.error("エラー: ESTAT_APP_ID が .env に設定されていません。");
  process.exit(1);
}

// データ保存先のパス
const OUTPUT_FILE = path.resolve(
  process.cwd(),
  "data/municipalities_wealth.json",
);

async function fetchWealthData() {
  const statsDataId = "0000020103"; // 市区町村データのID
  // C120110: 課税対象所得（千円）, C120120: 納税義務者数（人）
  const cdCat01 = "C120110,C120120";

  // APIリクエストURL (最新の年次データを取得するため、cdTimeは一旦指定せず取得して後で最新をフィルタします)
  // ※取得件数が多すぎるのを防ぐため、まずは直近の年 (例: 2021年 = 2021100000) を指定して試します
  const cdTime = "2021100000"; // e-Statの「2021年度」のコード形式（年によっては変更が必要な場合があります）

  const url = `https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData?appId=${ESTAT_APP_ID}&statsDataId=${statsDataId}&cdCat01=${cdCat01}&cdTime=${cdTime}`;

  console.log("e-Stat API から市区町村のお金持ち度データを取得しています...");

  try {
    const response = await fetch(url);
    const data = (await response.json()) as EstatStatsResponse;

    if (data.GET_STATS_DATA.RESULT.STATUS !== 0) {
      console.error("APIエラー:", data.GET_STATS_DATA.RESULT.ERROR_MSG);
      console.log("※指定した年度のデータが存在しない可能性があります。");
      return;
    }

    console.log(
      `\n計 ${data.GET_STATS_DATA.STATISTICAL_DATA.DATA_INF.VALUE.length} 件のデータレコードを取得しました。データ集計を開始します...`,
    );

    /*
      応答の読み方・集計・1 人あたり所得の出し方は
      scripts/import_municipalities_wealth.ts と丸ごと同じものが書いてあった。
      片方だけ直すと、ここが書き出す JSON と DB の数字が食い違う。
      scripts/estatWealth.ts に寄せた（答えは __tests__/estatWealth.test.ts）。
    */
    const results = aggregateWealth(data)
      // お金持ち度（1人あたり所得）が高い順にソート
      .sort((a, b) => b.incomePerCapita - a.incomePerCapita);

    // JSONファイルとして保存
    await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
    await fs.writeFile(OUTPUT_FILE, JSON.stringify(results, null, 2), "utf-8");

    console.log(`\n=== 処理完了 ===`);
    console.log(
      `全 ${results.length} 市区町村のデータを ${OUTPUT_FILE} に保存しました。`,
    );

    // トップ10を表示
    console.log("\n🏆 1人あたり平均所得 トップ10 🏆");
    results.slice(0, 10).forEach((m, index) => {
      const incomeFormatted = m.incomePerCapita.toLocaleString("ja-JP");
      console.log(
        `${index + 1}位: ${m.areaName} (${m.areaCode}) - 平均所得: ${incomeFormatted} 円`,
      );
    });
  } catch (error) {
    console.error("リクエスト失敗:", error);
  }
}

fetchWealthData();
