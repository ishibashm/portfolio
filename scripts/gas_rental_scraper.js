// Google Apps Script for fetching Real Estate Emails and sending to Next.js Webhook

// ==============================
// 設定 (Settings)
// ==============================
// 賃貸情報が届くGmailのラベル名（ご自身の環境に合わせて変更してください）
const GMAIL_LABEL = "不動産"; 

// ポートフォリオサイト（デプロイ先）のWebhook URL
// ローカルテスト時は ngrok のURLなどを指定します
const WEBHOOK_URL = "https://cloud-palette.com/api/rentals/webhook"; 

/**
 * フィルターに合致する新着（未読）メールを取得してWebhookに送信するメイン関数
 */
function fetchAndSendRealEstateEmails() {
  // 指定したラベルが付いている未読メールを検索
  const searchQuery = \`label:\${GMAIL_LABEL} is:unread\`;
  const threads = GmailApp.search(searchQuery, 0, 10); // 一度に最大10スレッド処理
  
  if (threads.length === 0) {
    Logger.log("新着の不動産メールはありませんでした。");
    return;
  }
  
  for (const thread of threads) {
    const messages = thread.getMessages();
    
    for (const message of messages) {
      if (message.isUnread()) {
        const emailData = {
          email_id: message.getId(),
          subject: message.getSubject(),
          date: message.getDate().toISOString(),
          body: message.getPlainBody()
        };
        
        // Webhookの呼び出し
        const success = sendToWebhook(emailData);
        
        // 成功したら既読にする（同じメールを何度も処理しないため）
        if (success) {
          message.markRead();
        }
      }
    }
  }
}

/**
 * Next.jsのAPIにデータをPOST送信する関数
 */
function sendToWebhook(data) {
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(data),
    muteHttpExceptions: true // エラー時も例外を投げずにレスポンスを取得
  };
  
  try {
    const response = UrlFetchApp.fetch(WEBHOOK_URL, options);
    const responseCode = response.getResponseCode();
    
    if (responseCode >= 200 && responseCode < 300) {
      Logger.log(\`✅ Webhook送信成功: \${data.subject}\`);
      return true;
    } else {
      Logger.log(\`❌ Webhookエラー (\${responseCode}): \${response.getContentText()}\`);
      return false;
    }
  } catch (e) {
    Logger.log(\`⚠️ 送信時の例外エラー: \${e.message}\`);
    return false;
  }
}
