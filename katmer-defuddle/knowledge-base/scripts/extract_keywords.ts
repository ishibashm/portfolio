import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import kuromoji from "kuromoji";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DIRECT_URL, // DIRECT_URLを使ってPgBouncerの影響を回避
    },
  },
});

// kuromoji の辞書パス
const DIC_PATH = path.join(__dirname, "..", "node_modules", "kuromoji", "dict");

// 無視するストップワード（一般的な名詞や記号）
const STOP_WORDS = new Set([
  "こと",
  "もの",
  "これ",
  "それ",
  "あれ",
  "どれ",
  "ため",
  "よう",
  "そう",
  "どこ",
  "ここ",
  "そこ",
  "あそこ",
  "さん",
  "くん",
  "ちゃん",
  "たち",
  "など",
  "ほか",
  "ほか",
  "ため",
  "の",
  "ん",
  "ー",
  "（",
  "）",
  "「",
  "」",
  "する",
  "なる",
  "いる",
  "ある",
  "できる",
  "てる",
  "れる",
  "せる",
  "れる",
  "させる",
  "ない",
  "ます",
  "です",
  "・",
  "-",
  "_",
  "*",
  "#",
  "!",
  "！",
  "?",
  "？",
  ".",
  ",",
  "。",
  "、",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "0",
  "一",
  "二",
  "三",
  "四",
  "五",
  "六",
  "七",
  "八",
  "九",
  "十",
  "百",
  "千",
  "万",
  "今日",
  "明日",
  "昨日",
  "今年",
  "来年",
  "去年",
  "今月",
  "来月",
  "先月",
  "今週",
  "来週",
  "先週",
  "時間",
  "月",
  "日",
  "年",
  "週",
  "時",
  "分",
  "秒",
  "回",
  "度",
  "個",
  "人",
  "円",
  "件",
  "枚",
  "本",
  "冊",
  "匹",
  "台",
  "台",
  "場合",
  "とき",
  "時",
  "前",
  "後",
  "中",
  "上",
  "下",
  "右",
  "左",
  "内",
  "外",
  "側",
  "他",
  "以外",
  "以上",
  "以下",
  "未満",
  "未満",
  "自分",
  "私",
  "僕",
  "俺",
  "君",
  "あなた",
  "彼",
  "彼女",
  "彼ら",
  "彼女ら",
  "誰",
  "何",
  "誰か",
  "何か",
  "いつ",
  "どう",
  "どうして",
  "なぜ",
  "的",
  "性",
  "化",
  "感",
  "者",
  "達",
  "等",
  "等",
  "事",
  "物",
  "所",
  "所",
  "処",
  "訳",
  "訳",
  "はず",
  "筈",
  "つもり",
  "筈",
  "みたい",
  "みたい",
  "みたい",
  "みたい",
  "みたい",
  "みたい",
  "みたい",
  "みたい",
  "みたい",
  "みたい",
  "みたい",
  "みたい",
  "AI",
  "ai",
  "ai",
  "ai",
  "AI",
  "AI",
  "AI",
  "AI",
  "AI",
  "AI",
  "AI",
  "AI", // AI は頻出すぎるなら省くか検討
  "clippings",
  "Clippings",
  "http",
  "https",
  "www",
  "com",
  "co",
  "jp",
  "md",
  "html",
  "htm",
  "org",
  "net",
  "info",
  "file",
  "folder",
  "C",
  // English Stop Words
  "the",
  "i",
  "and",
  "to",
  "a",
  "of",
  "for",
  "on",
  "is",
  "in",
  "it",
  "as",
  "be",
  "are",
  "by",
  "this",
  "that",
  "an",
  "with",
  "from",
  "or",
  "ve",
  "user",
  "assistant",
  "focusing",
  "data",
  "now",
  "my",
  "we",
  "you",
  "they",
  "he",
  "she",
  "at",
  "but",
  "not",
  "no",
  "if",
  "do",
  "does",
  "did",
  "have",
  "has",
  "had",
  "can",
  "could",
  "will",
  "would",
  "should",
  "what",
  "which",
  "who",
  "when",
  "where",
  "why",
  "how",
  "設定",
  "情報",
  "作成",
  "機能",
  "データ",
  "必要",
  "使用",
  "実行",
  "ファイル",
  "可能",
  "確認",
  "画像",
  "the",
  "The",
  "This",
]);

// カスタムカテゴリ判定用のキーワード辞書
const CATEGORY_KEYWORDS = {
  "ファイナンス・株価": [
    "株",
    "株価",
    "投資",
    "為替",
    "円安",
    "円高",
    "ドル",
    "証券",
    "相場",
    "日経",
    "チャート",
    "トレード",
    "NISA",
    "ETF",
    "ダウ",
  ],
  プログラミング: [
    "プログラミング",
    "コード",
    "Python",
    "JavaScript",
    "TypeScript",
    "React",
    "Next.js",
    "API",
    "開発",
    "エンジニア",
    "エラー",
    "バグ",
    "デプロイ",
    "データベース",
    "Git",
  ],
  "運勢・占い": [
    "運勢",
    "占い",
    "吉方位",
    "九星気学",
    "大吉",
    "凶",
    "運気",
    "八方塞がり",
    "星",
    "風水",
  ],
  "AI・機械学習": [
    "AI",
    "LLM",
    "生成",
    "Gemini",
    "ChatGPT",
    "プロンプト",
    "機械学習",
    "モデル",
    "Ollama",
    "Gemma",
    "Agent",
  ],
};

function determineCategory(text: string, category: string | null): string {
  // 既存のカテゴリがあればそれを尊重しつつ、詳細な分類を試みる
  const lowerText = text.toLowerCase();

  let bestMatch = category || "Others";
  let maxScore = 0;

  for (const [catName, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (lowerText.includes(kw.toLowerCase())) {
        score++;
      }
    }
    if (score > maxScore) {
      maxScore = score;
      bestMatch = catName;
    }
  }

  // もしスコアが0で、既存カテゴリがAI_Agents_LLMなら AI・機械学習 にマップ
  if (maxScore === 0) {
    if (category === "AI_Agents_LLM") return "AI・機械学習";
    if (category === "Cloud_Infra") return "プログラミング";
    if (category === "Data_Tech") return "プログラミング";
  }

  return bestMatch;
}

// kuromoji の初期化を Promise でラップ
function buildTokenizer(): Promise<
  kuromoji.Tokenizer<kuromoji.IpadicFeatures>
> {
  return new Promise((resolve, reject) => {
    kuromoji.builder({ dicPath: DIC_PATH }).build((err, tokenizer) => {
      if (err) reject(err);
      else resolve(tokenizer);
    });
  });
}

async function main() {
  console.log("Starting Keyword Extraction & Analytics Data Generation...");

  // Set statement_timeout to 0 for this session
  try {
    await prisma.$executeRawUnsafe("SET statement_timeout = 0;");
    console.log("Set statement_timeout to 0");
  } catch (e) {
    console.warn("Failed to set statement_timeout", e);
  }

  const tokenizer = await buildTokenizer();
  console.log("Kuromoji tokenizer loaded.");

  // ドキュメントをページネーションで取得
  const BATCH_SIZE = 50;
  let skip = 0;
  let hasMore = true;
  let documentsCount = 0;

  const keywordCounts: Record<string, number> = {};
  const categoryCounts: Record<string, number> = {};
  const documentsData: any[] = [];

  while (hasMore) {
    console.log(`Fetching documents... skip: ${skip}, take: ${BATCH_SIZE}`);
    const docsBatch = await prisma.knowledgeDocument.findMany({
      select: {
        id: true,
        title: true,
        content: true, // ローカルDBになったので本文も取得して解析する
        category: true,
        tags: true,
        created_at: true,
      },
      skip,
      take: BATCH_SIZE,
      orderBy: { created_at: "asc" },
    });

    if (docsBatch.length === 0) {
      hasMore = false;
      break;
    }

    documentsCount += docsBatch.length;

    for (const doc of docsBatch) {
      const tagsStr = Array.isArray(doc.tags) ? doc.tags.join(" ") : "";
      let text = `${doc.title}\n${doc.content || ""}\n${tagsStr}`; // 本文（中身）を含めて形態素解析

      // Obsidian や Web記事特有のノイズ（URLやファイルパス）を事前に削除
      text = text.replace(/https?:\/\/[^\s]+/g, ""); // URL
      text = text.replace(/[a-zA-Z]:\\[^\s]+/g, ""); // Windowsのファイルパス (C:\...)
      text = text.replace(/[a-zA-Z]:\/[^\s]+/g, ""); // スラッシュのファイルパス (C:/...)

      // Markdown特有の記号やコードブロックの残骸を除去
      text = text.replace(/```[a-z]*\n[\s\S]*?\n```/g, ""); // コードブロック自体を除外
      text = text.replace(/[#*`~_=\-[\]()<>:|'"]/g, " "); // 記号をスペースに変換

      // 長すぎるテキスト（数万文字など）は Kuromoji がフリーズするため、最初の 5000 文字に制限する
      if (text.length > 5000) {
        text = text.substring(0, 5000);
      }

      const tokens = tokenizer.tokenize(text);

      const docKeywords = new Set<string>();

      for (const token of tokens) {
        // 名詞および数詞を抽出（数字も重要な指標として扱う）
        if (token.pos === "名詞" && token.pos_detail_1 !== "代名詞") {
          const word = token.surface_form;
          const lowerWord = word.toLowerCase();

          // 完全に記号だけの単語は除外
          if (
            /^[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+$/.test(word)
          )
            continue;
          // 英語の1文字だけ（a, b, I, など）は除外
          if (/^[a-zA-Z]$/.test(word)) continue;

          if (
            word.length >= 1 &&
            !STOP_WORDS.has(word) &&
            !STOP_WORDS.has(lowerWord)
          ) {
            keywordCounts[word] = (keywordCounts[word] || 0) + 1;
            docKeywords.add(word);
          }
        }
      }

      // カテゴリ判定
      const inferredCategory = determineCategory(text, doc.category);
      categoryCounts[inferredCategory] =
        (categoryCounts[inferredCategory] || 0) + 1;

      documentsData.push({
        id: doc.id,
        title: doc.title,
        category: inferredCategory,
        keywords: Array.from(docKeywords).slice(0, 10), // 上位10個程度
        created_at: doc.created_at,
      });
    }

    skip += BATCH_SIZE;
  }

  console.log(`Processed ${documentsCount} documents.`);

  // キーワードランキングを生成
  const sortedKeywords = Object.entries(keywordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 100) // 上位100件
    .map(([text, value]) => ({ text, value }));

  const sortedCategories = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));

  const outputData = {
    generatedAt: new Date().toISOString(),
    totalDocuments: documentsCount,
    topKeywords: sortedKeywords,
    categoryDistribution: sortedCategories,
    documents: documentsData,
  };

  // public ディレクトリに保存（フロントエンドから fetch できるように）
  const outputPath = path.join(
    __dirname,
    "..",
    "public",
    "analytics_data.json",
  );
  fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2), "utf-8");

  console.log(`Analytics data saved to ${outputPath}`);
  console.log("Top 5 Keywords:", sortedKeywords.slice(0, 5));
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
