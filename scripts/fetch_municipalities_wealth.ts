import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs/promises';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const ESTAT_APP_ID = process.env.ESTAT_APP_ID;

if (!ESTAT_APP_ID) {
  console.error("エラー: ESTAT_APP_ID が .env に設定されていません。");
  process.exit(1);
}

// データ保存先のパス
const OUTPUT_FILE = path.resolve(process.cwd(), 'data/municipalities_wealth.json');

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
    const data = await response.json();
    
    if (data.GET_STATS_DATA.RESULT.STATUS !== 0) {
      console.error("APIエラー:", data.GET_STATS_DATA.RESULT.ERROR_MSG);
      console.log("※指定した年度のデータが存在しない可能性があります。");
      return;
    }

    const valueList = data.GET_STATS_DATA.STATISTICAL_DATA.DATA_INF.VALUE;
    const areaList = data.GET_STATS_DATA.STATISTICAL_DATA.CLASS_INF.CLASS_OBJ.find((obj: any) => obj['@id'] === 'area').CLASS;

    console.log(`\n計 ${valueList.length} 件のデータレコードを取得しました。データ集計を開始します...`);

    // 地域コードをキーにしたマップを作成
    const municipalities: Record<string, any> = {};

    // エリア名のマッピング（地域コード -> 地域名）
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
      const value = parseFloat(val['$']); // 数値に変換

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

    // 1人あたりの所得を計算し、配列に変換
    const results = Object.values(municipalities).map((m: any) => {
      // 課税対象所得は千円単位なので、円単位に直す
      const incomeYen = m.taxableIncomeThousandYen * 1000;
      // 1人あたりの所得を計算
      const incomePerCapita = m.taxpayersCount > 0 ? incomeYen / m.taxpayersCount : 0;

      return {
        ...m,
        incomeYen,
        incomePerCapita: Math.round(incomePerCapita) // 四捨五入して整数に
      };
    })
    // 納税者数が0のデータ（欠損値など）を除外
    .filter((m: any) => m.taxpayersCount > 0 && m.incomePerCapita > 0)
    // お金持ち度（1人あたり所得）が高い順にソート
    .sort((a, b) => b.incomePerCapita - a.incomePerCapita);

    // JSONファイルとして保存
    await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
    await fs.writeFile(OUTPUT_FILE, JSON.stringify(results, null, 2), 'utf-8');

    console.log(`\n=== 処理完了 ===`);
    console.log(`全 ${results.length} 市区町村のデータを ${OUTPUT_FILE} に保存しました。`);
    
    // トップ10を表示
    console.log("\n🏆 1人あたり平均所得 トップ10 🏆");
    results.slice(0, 10).forEach((m, index) => {
      const incomeFormatted = m.incomePerCapita.toLocaleString('ja-JP');
      console.log(`${index + 1}位: ${m.areaName} (${m.areaCode}) - 平均所得: ${incomeFormatted} 円`);
    });

  } catch (error) {
    console.error("リクエスト失敗:", error);
  }
}

fetchWealthData();