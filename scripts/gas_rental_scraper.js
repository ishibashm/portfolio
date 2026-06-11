// @ts-nocheck
/* eslint-disable */
// Google Apps Script for fetching Real Estate Emails and sending to Next.js Webhook

// ==============================
// 設定 (Settings)
// ==============================
// 賃貸情報が届くGmailのラベル名（ご自身の環境に合わせて変更してください）
const GMAIL_LABEL = "不動産";

// ポートフォリオサイト（デプロイ先）のWebhook URL
// ローカルテスト時は ngrok のURLなどを指定します
const WEBHOOK_URL = "https://cloud-palette.com/api/rentals/webhook";

// 不正アクセスを防ぐためのシークレットキー (必須)
// Next.jsの環境変数(API_SECRET_KEY)と同じ文字列を設定してください
const API_SECRET_KEY = "PLEASE_SET_YOUR_SECRET_KEY_HERE";

/**
 * フィルターに合致する新着（未読）メールを取得してWebhookに送信するメイン関数
 * 処理結果の統計オブジェクトを返します。
 */
function fetchAndSendRealEstateEmails() {
  // 指定したラベルが付いている未読メールを検索
  const searchQuery = `label:${GMAIL_LABEL} is:unread`;
  const threads = GmailApp.search(searchQuery, 0, 10); // 一度に最大10スレッド処理

  const stats = {
    threadsFound: threads.length,
    emailsProcessed: 0,
    webhooksSent: 0,
    webhooksSucceeded: 0,
    errors: [],
  };

  if (threads.length === 0) {
    Logger.log("新着の不動産メールはありませんでした。");
    return stats;
  }

  for (const thread of threads) {
    const messages = thread.getMessages();

    for (const message of messages) {
      if (message.isUnread()) {
        stats.emailsProcessed++;

        const emailData = {
          email_id: message.getId(),
          subject: message.getSubject(),
          date: message.getDate().toISOString(),
          body: message.getPlainBody(),
        };

        // Webhookの呼び出し
        stats.webhooksSent++;
        const result = sendToWebhook(emailData);

        // 成功したら既読にする（同じメールを何度も処理しないため）
        if (result.success) {
          stats.webhooksSucceeded++;
          message.markRead();
        } else {
          stats.errors.push(`Email "${emailData.subject}": ${result.error}`);
        }
      }
    }
  }

  return stats;
}

/**
 * Next.jsのAPIにデータをPOST送信する関数
 * 送信結果オブジェクトを返します。
 */
function sendToWebhook(data) {
  const options = {
    method: "post",
    headers: {
      Authorization: `Bearer ${API_SECRET_KEY}`,
    },
    contentType: "application/json",
    payload: JSON.stringify(data),
    muteHttpExceptions: true, // エラー時も例外を投げずにレスポンスを取得
  };

  try {
    const response = UrlFetchApp.fetch(WEBHOOK_URL, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();

    if (responseCode >= 200 && responseCode < 300) {
      Logger.log(`✅ Webhook送信成功: ${data.subject}`);
      return { success: true };
    } else {
      const errMsg = `Webhookエラー (${responseCode}): ${responseText}`;
      Logger.log(`❌ ${errMsg}`);
      return { success: false, error: errMsg };
    }
  } catch (e) {
    const errMsg = `送信時の例外エラー: ${e.message}`;
    Logger.log(`⚠️ ${errMsg}`);
    return { success: false, error: errMsg };
  }
}

/**
 * 手動取得ボタン（Web App経由）用のエンドポイント
 */
function doGet(e) {
  try {
    const stats = fetchAndSendRealEstateEmails();
    return ContentService.createTextOutput(
      JSON.stringify({
        success: true,
        message: `Scraper executed. Threads found: ${stats.threadsFound}, Emails processed: ${stats.emailsProcessed}, Sent to Webhook: ${stats.webhooksSent}, Succeeded: ${stats.webhooksSucceeded}`,
        stats: stats,
      }),
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: error.message }),
    ).setMimeType(ContentService.MimeType.JSON);
  }
}
