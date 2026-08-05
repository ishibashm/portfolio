const ERROR_MESSAGES: Record<string, string> = {
  INVALID_BIRTH_DATE: "生年月日の形式が正しくありません。",
  INVALID_RANGE: "終了日は開始日以降の日付を指定してください。",
  INVALID_DIRECTION: "方位の指定が正しくありません。",
};

export function getAuspiciousDayErrorMessage(code?: string): string {
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  return "日取りを取得できませんでした。入力内容を確認して再度お試しください。";
}
