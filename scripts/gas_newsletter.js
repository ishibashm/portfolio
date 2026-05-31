/**
 * =========================================================================
 * Daily Tech Digest & Newsletter Aggregator for Google Apps Script (GAS)
 * =========================================================================
 * 
 * 概要:
 * 1. doPost(e): Webサイトからの購読登録リクエストを受け取り、スプレッドシートに保存します。
 *    - メールアドレスの重複チェックを行い、重複時はエラーを返します。
 *    - 送信形式（JSON / フォームデータ）の自動フォールバック解析と厳格なバリデーションを行います。
 * 
 * 2. doGet(e): Webサイト表示用の最新記事JSONを返却します。
 *    - CacheServiceを利用し、1時間キャッシュすることでアクセス速度を高速化します。
 *    - CORSを許可するMIMEタイプ設定で出力します。
 * 
 * 3. sendDailyTechDigest(): スプレッドシートの登録者全員にHTMLメールを一斉配信します。
 *    - FEED_CONFIGS から記事を取得・パースし、各ソース上位3件を抽出してまとめメールを作成します。
 *    - デザインはダークブルー（#1A365D）とグレーを基調としたインラインCSSのレスポンシブHTMLです。
 * 
 * 4. 汎用パーサー (parseFeed): RSS 2.0、Atom、RSS 1.0 (RDF) を自動識別・解析します。
 *    - 名前空間（Namespace）の有無にかかわらず頑健に動作するフォールバックパーサーを内蔵しています。
 */

// ==========================================
// 設定情報 (一元管理)
// ==========================================

// スプレッドシートID: 空文字の場合はコンテナバインド（スクリプトに紐づくシート）を使用
// スタンドアロン運用の場合は、対象のスプレッドシートIDを記述します。
const SPREADSHEET_ID = ""; 

// 購読者アドレスを格納するスプレッドシートのシート名
const SHEET_NAME = "Subscribers"; 

// キャッシュの有効期限 (秒): 3600秒 = 1時間
const CACHE_EXPIRATION_SEC = 3600; 

// RSS/Atomフィードの設定リスト
const FEED_CONFIGS = [
  { name: "🚀 Zenn (トレンド)", url: "https://zenn.dev/feed" },
  { name: "🔥 Qiita (トレンド)", url: "https://qiita.com/popular-items/feed.atom" },
  { name: "🔖 はてなブックマークIT", url: "https://b.hatena.ne.jp/hotentry/it.rss" },
  { name: "🔑 Publickey", url: "https://www.publickey1.jp/atom.xml" },
  { name: "🛠️ DevelopersIO", url: "https://dev.classmethod.jp/feed" },
  { name: "🏢 企業テックブログ（まとめ）", url: "https://yamadashy.github.io/tech-blog-rss-feed/feeds/rss.xml" }
];

// ==========================================
// 1. Web App: doPost (購読登録処理)
// ==========================================

function doPost(e) {
  try {
    let email = "";
    
    // 【解析形式A】 JSON形式 (body: JSON.stringify({ email: "..." }))
    if (e && e.postData && e.postData.contents) {
      try {
        const payload = JSON.parse(e.postData.contents);
        if (payload && payload.email) {
          email = payload.email;
        }
      } catch (jsonError) {
        // パースエラー時は何もしない（フォールバック処理に任せる）
      }
    }
    
    // 【解析形式B】 フォームデータ形式 (email=...) のフォールバック
    if (!email && e && e.parameter && e.parameter.email) {
      email = e.parameter.email;
    }
    
    // トリミング処理
    if (email) {
      email = email.trim();
    }
    
    // バリデーション: 空チェック
    if (!email) {
      return createJsonResponse({
        status: "error",
        code: 400,
        message: "メールアドレスが指定されていません。"
      });
    }
    
    // バリデーション: メールアドレス形式チェック (RFC 5322準拠の正規表現)
    if (!isValidEmail(email)) {
      return createJsonResponse({
        status: "error",
        code: 400,
        message: "無効なメールアドレス形式です。"
      });
    }
    
    // スプレッドシートの取得と重複チェック
    const sheet = getSubscribersSheet();
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    
    // A列を巡回して同一メールアドレスが既に登録されていないか確認 (1行目はヘッダー)
    for (let i = 1; i < values.length; i++) {
      const registeredEmail = values[i][0];
      if (registeredEmail && registeredEmail.toString().toLowerCase() === email.toLowerCase()) {
        return createJsonResponse({
          status: "duplicate",
          code: 409,
          message: "このメールアドレスは既に登録されています。"
        });
      }
    }
    
    // 新規登録処理: A列にメールアドレス、B列に登録日時
    sheet.appendRow([email, new Date()]);
    
    return createJsonResponse({
      status: "success",
      code: 200,
      message: "購読登録が完了しました。"
    });
    
  } catch (error) {
    console.error("doPost内でエラーが発生しました: " + error.toString());
    return createJsonResponse({
      status: "error",
      code: 500,
      message: "サーバーエラーが発生しました: " + error.toString()
    });
  }
}

// ==========================================
// 2. Web App: doGet (JSONエンドポイントサーブ)
// ==========================================

function doGet(e) {
  try {
    const cache = CacheService.getScriptCache();
    const cacheKey = "tech_digest_articles_json";
    
    // キャッシュの読み込み試行
    let cachedData = cache.get(cacheKey);
    if (cachedData) {
      return ContentService.createTextOutput(cachedData)
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // キャッシュがない場合はRSSフィードを巡回・解析
    const aggregatedData = fetchAndParseFeeds();
    const jsonString = JSON.stringify(aggregatedData);
    
    // キャッシュへ格納 (1時間)
    try {
      cache.put(cacheKey, jsonString, CACHE_EXPIRATION_SEC);
    } catch (cacheError) {
      // キャッシュサイズが100KB上限を超えた場合の対処
      console.warn("キャッシュ書き込みエラー: " + cacheError.toString());
    }
    
    return ContentService.createTextOutput(jsonString)
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    console.error("doGet内でエラーが発生しました: " + error.toString());
    const errorJson = JSON.stringify({
      status: "error",
      message: "記事データの取得に失敗しました: " + error.toString()
    });
    return ContentService.createTextOutput(errorJson)
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ==========================================
// 3. Daily Tech Digest: sendDailyTechDigest (日刊配信処理)
// ==========================================

function sendDailyTechDigest() {
  try {
    const sheet = getSubscribersSheet();
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    
    // 購読者メールアドレスの抽出
    const emails = [];
    for (let i = 1; i < values.length; i++) {
      const emailVal = values[i][0];
      if (emailVal && isValidEmail(emailVal.toString())) {
        emails.push(emailVal.toString().trim());
      }
    }
    
    if (emails.length === 0) {
      console.log("購読登録者が存在しないため、メール配信処理を中止しました。");
      return;
    }
    
    // 最新フィード記事の取得と解析
    const aggregatedData = fetchAndParseFeeds();
    
    // 本日の日付フォーマットの取得 (Sessionのタイムゾーンに依拠)
    const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy/MM/dd");
    
    // メールコンテンツの構築
    const htmlTemplate = getEmailTemplate();
    const contentHtml = buildEmailContentHtml(aggregatedData);
    
    // テンプレートへのデータ埋め込み
    const emailBodyHtml = htmlTemplate
      .replace("{{date}}", today)
      .replace("{{content}}", contentHtml);
      
    // HTML非対応のメールクライアント用のプレーンテキスト作成
    const emailBodyText = buildEmailTextBody(aggregatedData, today);
    
    // 個人情報保護（他者のアドレスの秘匿）のため、BCCを利用して一斉送信します。
    // 送信元(to)は送信者自身のアドレスに設定します。
    const senderEmail = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail();
    
    MailApp.sendEmail({
      to: senderEmail,
      bcc: emails.join(","),
      subject: `【日刊】Tech Digest - ${today}`,
      htmlBody: emailBodyHtml,
      body: emailBodyText
    });
    
    console.log(`${emails.length} 件のアドレスにまとめメールを正常に送信しました。`);
    
  } catch (error) {
    console.error("sendDailyTechDigest実行中に致命的なエラーが発生しました: " + error.toString());
  }
}

// ==========================================
// 4. RSS / Atom フィードのパース・ユーティリティ
// ==========================================

/**
 * 設定されたすべてのフィードからデータを取得し、グルーピングして返却します。
 */
function fetchAndParseFeeds() {
  const result = {};
  
  FEED_CONFIGS.forEach(function(config) {
    try {
      const response = UrlFetchApp.fetch(config.url, {
        muteHttpExceptions: true,
        timeoutInSeconds: 15
      });
      
      if (response.getResponseCode() === 200) {
        const xmlText = response.getContentText("UTF-8");
        const parsedArticles = parseFeed(xmlText, config.name);
        result[config.name] = parsedArticles;
      } else {
        console.warn(`${config.name} フィードの取得に失敗しました。HTTPステータス: ${response.getResponseCode()}`);
        result[config.name] = [];
      }
    } catch (e) {
      console.error(`${config.name} のフェッチおよび解析中に例外が発生しました: ` + e.toString());
      result[config.name] = [];
    }
  });
  
  return result;
}

/**
 * RSS 2.0、RSS 1.0 (RDF)、Atom 形式を自動判別し、パースして共通形式で返します。
 * 返却オブジェクト: { title: string, link: string }
 */
function parseFeed(xmlText, feedName) {
  const articles = [];
  try {
    const document = XmlService.parse(xmlText);
    const root = document.getRootElement();
    const rootName = root.getName();
    
    // A. Atom形式の解析 (ルート要素名が "feed")
    if (rootName === "feed") {
      const atomNs = root.getNamespace() || XmlService.getNamespace("http://www.w3.org/2005/Atom");
      const entries = root.getChildren("entry", atomNs);
      
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const titleEl = entry.getChild("title", atomNs);
        const linkEl = entry.getChild("link", atomNs);
        
        const title = titleEl ? titleEl.getText() : "";
        let link = "";
        
        if (linkEl) {
          link = linkEl.getAttribute("href") ? linkEl.getAttribute("href").getValue() : linkEl.getText();
        }
        
        if (title && link) {
          articles.push({ title: title.trim(), link: link.trim() });
        }
      }
    }
    // B. RSS 1.0 (RDF) 形式の解析 (ルート要素名が "RDF")
    else if (rootName === "RDF") {
      const rssNs = XmlService.getNamespace("http://purl.org/rss/1.0/");
      const items = root.getChildren("item", rssNs);
      
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const titleEl = item.getChild("title", rssNs);
        const linkEl = item.getChild("link", rssNs);
        
        const title = titleEl ? titleEl.getText() : "";
        const link = linkEl ? linkEl.getText() : "";
        
        if (title && link) {
          articles.push({ title: title.trim(), link: link.trim() });
        }
      }
    }
    // C. RSS 2.0 形式の解析 (ルート要素名が "rss")
    else if (rootName === "rss") {
      const channel = root.getChild("channel");
      if (channel) {
        const items = channel.getChildren("item");
        
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const titleEl = item.getChild("title");
          const linkEl = item.getChild("link");
          
          const title = titleEl ? titleEl.getText() : "";
          const link = linkEl ? linkEl.getText() : "";
          
          if (title && link) {
            articles.push({ title: title.trim(), link: link.trim() });
          }
        }
      }
    }
    // D. 判別不可・独自仕様時の名前空間無視フォールバック
    else {
      // <entry> タグの検索
      const entries = findElementsLocalName(root, "entry");
      if (entries.length > 0) {
        entries.forEach(function(entry) {
          const titleEl = findElementLocalName(entry, "title");
          const linkEl = findElementLocalName(entry, "link");
          
          const title = titleEl ? titleEl.getText() : "";
          let link = "";
          if (linkEl) {
            link = linkEl.getAttribute("href") ? linkEl.getAttribute("href").getValue() : linkEl.getText();
          }
          if (title && link) {
            articles.push({ title: title.trim(), link: link.trim() });
          }
        });
      } else {
        // <item> タグの検索
        const items = findElementsLocalName(root, "item");
        items.forEach(function(item) {
          const titleEl = findElementLocalName(item, "title");
          const linkEl = findElementLocalName(item, "link");
          
          const title = titleEl ? titleEl.getText() : "";
          const link = linkEl ? linkEl.getText() : "";
          if (title && link) {
            articles.push({ title: title.trim(), link: link.trim() });
          }
        });
      }
    }
  } catch (error) {
    console.error(`${feedName} フィードのパース中にエラーが発生しました: ` + error.toString());
  }
  
  return articles;
}

/**
 * 名前空間を無視してローカル名で子要素を1つ検索するヘルパー
 */
function findElementLocalName(element, localName) {
  const children = element.getChildren();
  for (let i = 0; i < children.length; i++) {
    if (children[i].getName() === localName) {
      return children[i];
    }
  }
  return null;
}

/**
 * 名前空間を無視してローカル名で子要素をすべて検索するヘルパー
 */
function findElementsLocalName(element, localName) {
  const result = [];
  const children = element.getChildren();
  for (let i = 0; i < children.length; i++) {
    if (children[i].getName() === localName) {
      result.push(children[i]);
    }
  }
  return result;
}

// ==========================================
// 5. ヘルパー関数
// ==========================================

/**
 * JSONレスポンスを作成する
 */
function createJsonResponse(data) {
  const jsonString = JSON.stringify(data);
  return ContentService.createTextOutput(jsonString)
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 設定値に応じて適切なスプレッドシートインスタンスを取得します。
 */
function getSpreadsheet() {
  if (SPREADSHEET_ID) {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  } else {
    try {
      return SpreadsheetApp.getActiveSpreadsheet();
    } catch (e) {
      throw new Error("スプレッドシートにコンテナバインドされていないか、指定されたIDが不正です。");
    }
  }
}

/**
 * 購読者を管理するシートを安全に取得します。存在しない場合は新規作成します。
 */
function getSubscribersSheet() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    // ヘッダーの挿入
    sheet.appendRow(["Email", "Registered At"]);
    // スタイル調整 (1行目をボールドにし、固定)
    sheet.setFrozenRows(1);
    sheet.getRange("A1:B1").setFontWeight("bold");
  }
  return sheet;
}

/**
 * RFC 5322 に準拠した簡易メールアドレスバリデーション
 */
function isValidEmail(email) {
  if (!email || typeof email !== "string") {
    return false;
  }
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;
  return emailRegex.test(email);
}

/**
 * HTMLエスケープ処理 (XSS対策)
 */
function escapeHtml(string) {
  if (typeof string !== "string") {
    return "";
  }
  return string.replace(/[&<>"']/g, function(match) {
    switch (match) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#039;";
      default: return match;
    }
  });
}

// ==========================================
// 6. メールHTMLおよびプレーンテキスト構築関数
// ==========================================

/**
 * 配信されるHTMLメールのヘッダー・フッターおよび全体レイアウト。
 * 知的なダークブルー(#1A365D)とグレーを基調としたインラインCSSの構造。
 */
function getEmailTemplate() {
  return '<!DOCTYPE html>\n' +
    '<html>\n' +
    '<head>\n' +
    '  <meta charset="utf-8">\n' +
    '  <title>Daily Tech Digest</title>\n' +
    '</head>\n' +
    '<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, Helvetica, Arial, sans-serif; background-color: #f7fafc; color: #2d3748; -webkit-text-size-adjust: 100%;">\n' +
    '  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f7fafc; padding: 20px 0;">\n' +
    '    <tr>\n' +
    '      <td align="center">\n' +
    '        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0;">\n' +
    '          \n' +
    '          <!-- ヘッダー -->\n' +
    '          <tr>\n' +
    '            <td style="background-color: #1a365d; padding: 30px 20px; text-align: center;">\n' +
    '              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 0.5px;">Daily Tech Digest</h1>\n' +
    '              <p style="color: #cbd5e0; margin: 5px 0 0 0; font-size: 14px;">本日の最新トレンド技術記事まとめ</p>\n' +
    '            </td>\n' +
    '          </tr>\n' +
    '          \n' +
    '          <!-- 日付表示 -->\n' +
    '          <tr>\n' +
    '            <td style="padding: 15px 25px; border-bottom: 1px solid #edf2f7; text-align: right; font-size: 13px; color: #718096; background-color: #fcfdfd;">\n' +
    '              配信日: {{date}}\n' +
    '            </td>\n' +
    '          </tr>\n' +
    '          \n' +
    '          <!-- コンテンツエリア -->\n' +
    '          <tr>\n' +
    '            <td style="padding: 25px 25px;">\n' +
    '              {{content}}\n' +
    '            </td>\n' +
    '          </tr>\n' +
    '          \n' +
    '          <!-- フッター -->\n' +
    '          <tr>\n' +
    '            <td style="background-color: #edf2f7; padding: 25px 20px; text-align: center; border-top: 1px solid #e2e8f0;">\n' +
    '              <p style="margin: 0 0 10px 0; font-size: 12px; color: #718096;">※このメールは Daily Tech Digest にご登録いただいた方にお送りしています。</p>\n' +
    '              <p style="margin: 0; font-size: 12px; color: #718096; line-height: 1.5;">\n' +
    '                配信停止を希望される方は、このメールに直接返信してその旨をお伝えください。\n' +
    '              </p>\n' +
    '            </td>\n' +
    '          </tr>\n' +
    '          \n' +
    '        </table>\n' +
    '      </td>\n' +
    '    </tr>\n' +
    '  </table>\n' +
    '</body>\n' +
    '</html>';
}

/**
 * グルーピングされた記事データから、HTML本文のリストを生成します（各フィード最大3件）。
 */
function buildEmailContentHtml(aggregatedData) {
  let contentHtml = "";
  let hasArticles = false;
  
  for (const sourceName in aggregatedData) {
    const articles = aggregatedData[sourceName];
    if (!articles || articles.length === 0) continue;
    
    hasArticles = true;
    const topArticles = articles.slice(0, 3);
    
    contentHtml += `
      <div style="margin-bottom: 25px;">
        <h2 style="font-size: 16px; font-weight: 700; color: #1a365d; border-left: 4px solid #1a365d; padding-left: 8px; margin: 0 0 12px 0; line-height: 1.4;">
          ${escapeHtml(sourceName)}
        </h2>
        <ul style="margin: 0; padding-left: 20px; list-style-type: square; color: #4a5568;">
    `;
    
    topArticles.forEach(function(article) {
      contentHtml += `
        <li style="margin-bottom: 8px; line-height: 1.5;">
          <a href="${escapeHtml(article.link)}" target="_blank" style="color: #2b6cb0; text-decoration: none; font-weight: 500; font-size: 14px;">
            ${escapeHtml(article.title)}
          </a>
        </li>
      `;
    });
    
    contentHtml += `
        </ul>
      </div>
    `;
  }
  
  if (!hasArticles) {
    contentHtml = `<p style="font-size: 14px; color: #718096; text-align: center; margin: 40px 0;">現在、最新のトレンド記事が見つかりませんでした。</p>`;
  }
  
  return contentHtml;
}

/**
 * HTMLメール非対応クライアント用のプレーンテキスト本文を生成します。
 */
function buildEmailTextBody(aggregatedData, dateString) {
  let text = `Daily Tech Digest - ${dateString}\n本日の最新トレンド技術記事まとめ\n\n`;
  let hasArticles = false;
  
  for (const sourceName in aggregatedData) {
    const articles = aggregatedData[sourceName];
    if (!articles || articles.length === 0) continue;
    
    hasArticles = true;
    text += `■ ${sourceName}\n`;
    
    const topArticles = articles.slice(0, 3);
    topArticles.forEach(function(article) {
      text += `- ${article.title}\n  ${article.link}\n`;
    });
    
    text += `\n`;
  }
  
  if (!hasArticles) {
    text += "現在、最新のトレンド記事が見つかりませんでした。\n\n";
  }
  
  text += `※このメールは Daily Tech Digest にご登録いただいた方にお送りしています。\n`;
  text += `配信停止を希望される方は、このメールに直接返信してその旨をお伝えください。\n`;
  
  return text;
}
