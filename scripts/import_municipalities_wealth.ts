import * as dotenv from "dotenv";
import path from "path";
import { aggregateWealth, type EstatStatsResponse } from "./estatWealth";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const ESTAT_APP_ID = process.env.ESTAT_APP_ID;

if (!ESTAT_APP_ID) {
  console.error("エラー: ESTAT_APP_ID が .env に設定されていません。");
  process.exit(1);
}

async function fetchAndImportWealthData() {
  const { default: prisma } = await import("../src/lib/prisma.js");

  const statsDataId = "0000020103"; // 市区町村データのID
  // C120110: 課税対象所得（千円）, C120120: 納税義務者数（人）
  const cdCat01 = "C120110,C120120";
  /*
    年度は 1 か所で決める。以前は問い合わせの cdTime が "2021100000"、
    行に付ける dataYear が "2021" と別々に書いてあった。**年度を上げる
    ときに片方だけ直すと、去年のデータに今年の年度が付く**（逆も同じ）。
    どちらも DATA_YEAR から作る。
  */
  const DATA_YEAR = "2021";
  const cdTime = `${DATA_YEAR}100000`; // e-Stat の年度コード

  const url = `https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData?appId=${ESTAT_APP_ID}&statsDataId=${statsDataId}&cdCat01=${cdCat01}&cdTime=${cdTime}`;

  console.log("e-Stat API から市区町村のお金持ち度データを取得しています...");

  try {
    const response = await fetch(url);
    const data = (await response.json()) as EstatStatsResponse;

    if (data.GET_STATS_DATA.RESULT.STATUS !== 0) {
      console.error("APIエラー:", data.GET_STATS_DATA.RESULT.ERROR_MSG);
      return;
    }

    /*
      応答の読み方・集計・1 人あたり所得の出し方は、書き出す側
      （scripts/fetch_municipalities_wealth.ts）と丸ごと同じものが
      書いてあった。片方だけ直すと、書き出した JSON とこの DB の数字が
      食い違う。scripts/estatWealth.ts に寄せた（#352 の続き。答えは
      __tests__/estatWealth.test.ts）。

      dataYear は取り込む年度の目印なので、上の cdTime と同じ場所で
      決まるようにここで足す。
    */
    const results = aggregateWealth(data).map((m) => ({
      ...m,
      dataYear: DATA_YEAR,
    }));

    console.log(
      `\nデータベースへ ${results.length} 件のデータを保存・更新します...`,
    );

    let count = 0;
    for (const data of results) {
      await prisma.municipalityWealth.upsert({
        where: { areaCode: data.areaCode },
        update: {
          areaName: data.areaName,
          taxableIncomeThousandYen: data.taxableIncomeThousandYen,
          taxpayersCount: data.taxpayersCount,
          incomeYen: data.incomeYen,
          incomePerCapita: data.incomePerCapita,
          dataYear: data.dataYear,
        },
        create: {
          areaCode: data.areaCode,
          areaName: data.areaName,
          taxableIncomeThousandYen: data.taxableIncomeThousandYen,
          taxpayersCount: data.taxpayersCount,
          incomeYen: data.incomeYen,
          incomePerCapita: data.incomePerCapita,
          dataYear: data.dataYear,
        },
      });
      count++;
      if (count % 100 === 0) {
        console.log(`${count} 件処理完了...`);
      }
    }

    console.log(`\n=== 処理完了 ===`);
    console.log(`全 ${count} 市区町村のデータをデータベースに保存しました。`);
  } catch (error) {
    console.error("リクエスト失敗:", error);
  } finally {
    await prisma.$disconnect();
  }
}

fetchAndImportWealthData();
