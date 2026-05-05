import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const ESTAT_APP_ID = process.env.ESTAT_APP_ID;

if (!ESTAT_APP_ID) {
  console.error("エラー: ESTAT_APP_ID が .env に設定されていません。");
  process.exit(1);
}

async function fetchAndImportWealthData() {
  const { default: prisma } = await import('../src/lib/prisma.js');

  const statsDataId = "0000020103"; // 市区町村データのID
  // C120110: 課税対象所得（千円）, C120120: 納税義務者数（人）
  const cdCat01 = "C120110,C120120"; 
  const cdTime = "2021100000"; // e-Statの「2021年度」
  
  const url = `https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData?appId=${ESTAT_APP_ID}&statsDataId=${statsDataId}&cdCat01=${cdCat01}&cdTime=${cdTime}`;
  
  console.log("e-Stat API から市区町村のお金持ち度データを取得しています...");
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.GET_STATS_DATA.RESULT.STATUS !== 0) {
      console.error("APIエラー:", data.GET_STATS_DATA.RESULT.ERROR_MSG);
      return;
    }

    const valueList = data.GET_STATS_DATA.STATISTICAL_DATA.DATA_INF.VALUE;
    const areaList = data.GET_STATS_DATA.STATISTICAL_DATA.CLASS_INF.CLASS_OBJ.find((obj: any) => obj['@id'] === 'area').CLASS;

    // 地域コードをキーにしたマップを作成
    const municipalities: Record<string, any> = {};
    const areaMap: Record<string, string> = {};
    
    if (Array.isArray(areaList)) {
        areaList.forEach((area: any) => {
            areaMap[area['@code']] = area['@name'];
        });
    }

    // データの集計
    valueList.forEach((val: any) => {
      const areaCode = val['@area'];
      const catCode = val['@cat01'];
      const value = parseFloat(val['$']);

      if (!municipalities[areaCode]) {
        municipalities[areaCode] = {
          areaCode: areaCode,
          areaName: areaMap[areaCode] || "不明",
          taxableIncomeThousandYen: 0,
          taxpayersCount: 0,
        };
      }

      if (catCode === 'C120110') {
        municipalities[areaCode].taxableIncomeThousandYen = value;
      } else if (catCode === 'C120120') {
        municipalities[areaCode].taxpayersCount = value;
      }
    });

    const results = Object.values(municipalities).map((m: any) => {
      const incomeYen = m.taxableIncomeThousandYen * 1000;
      const incomePerCapita = m.taxpayersCount > 0 ? incomeYen / m.taxpayersCount : 0;

      return {
        ...m,
        incomeYen,
        incomePerCapita: Math.round(incomePerCapita),
        dataYear: "2021"
      };
    }).filter((m: any) => m.taxpayersCount > 0 && m.incomePerCapita > 0);

    console.log(`\nデータベースへ ${results.length} 件のデータを保存・更新します...`);

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
        }
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
