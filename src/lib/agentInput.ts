/** 自由文の軽い取り出し。日付を推測して計算に使わない。 */
export function extractAgentInput(text: string) {
  const date = text.match(
    /((?:19|20)\d{2})[年/-](\d{1,2})[月/-](\d{1,2})(?:日)?/,
  );
  const year = text.match(/((?:19|20)\d{2})年(?:生まれ|生)/)?.[1];
  const municipality = text.match(
    /[一-龯ぁ-んァ-ヶー]+(?:市[一-龯ぁ-んァ-ヶー]*区|市|区|町|村)/,
  )?.[0];
  return {
    birthDate: date
      ? `${date[1]}-${date[2].padStart(2, "0")}-${date[3].padStart(2, "0")}`
      : "",
    year: date?.[1] ?? year ?? "",
    municipality: municipality ?? "",
  };
}
/** 保存値は必要な問いのときだけ。曖昧なら自動送信せず追質問に任せる。 */
export function needsAgentBirth(question: string) {
  return (
    /本命星|私の|自分の|吉方位|吉日|引越.*(?:方位|日)|生まれ/.test(question) &&
    !/記事|意味|とは|考え方|仕組み/.test(question)
  );
}
export function needsAgentOrigin(question: string) {
  return (
    /方位|街|出発|引越|市区町村/.test(question) &&
    !/記事|意味|とは|考え方|仕組み/.test(question)
  );
}
export function withSavedAgentInput(
  question: string,
  birthDate: string,
  municipality: string,
  consent: boolean,
) {
  if (!consent) return question;
  return (
    question +
    (birthDate && needsAgentBirth(question) && !extractAgentInput(question).year
      ? `\n生年月日（保存値）: ${birthDate}`
      : "") +
    (municipality &&
    needsAgentOrigin(question) &&
    !extractAgentInput(question).municipality
      ? `\n出発地（保存値）: ${municipality}`
      : "")
  );
}
