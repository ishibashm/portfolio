import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const ESTAT_APP_ID = process.env.ESTAT_APP_ID;

if (!ESTAT_APP_ID) {
  console.error("エラー: ESTAT_APP_ID が .env に設定されていません。");
  process.exit(1);
}

async function fetchMetaInfo() {
  // 市区町村別の「経済基盤」データセットID
  const statsDataId = "0000020103";
  const url = `https://api.e-stat.go.jp/rest/3.0/app/json/getMetaInfo?appId=${ESTAT_APP_ID}&statsDataId=${statsDataId}`;

  console.log("e-Stat API からメタデータを取得しています...");

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.GET_META_INFO.RESULT.STATUS !== 0) {
      console.error("APIエラー:", data.GET_META_INFO.RESULT.ERROR_MSG);
      return;
    }

    // 項目（cat01）のリストを取得
    const classObjs = data.GET_META_INFO.METADATA_INF.CLASS_INF.CLASS_OBJ;
    const cat01 = classObjs.find((obj: any) => obj["@id"] === "cat01"); // cat01 が通常「観測項目」

    if (cat01 && cat01.CLASS) {
      console.log(`\n取得可能項目（一部）:`);
      // 「所得」を含む項目をフィルタリング
      const incomeItems = Array.isArray(cat01.CLASS)
        ? cat01.CLASS.filter((item: any) => item["@name"].includes("所得"))
        : [cat01.CLASS].filter((item: any) => item["@name"].includes("所得"));

      incomeItems.forEach((item: any) => {
        console.log(`コード: ${item["@code"]}, 項目名: ${item["@name"]}`);
      });

      console.log(`\n※その他「財政力」等も検索できます`);
    }
  } catch (error) {
    console.error("リクエスト失敗:", error);
  }
}

fetchMetaInfo();
