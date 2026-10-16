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
/** 個人条件が不要だと利用者の文面から明確に分かる質問。 */
export function isAgentGeneralQuestion(question: string) {
  return /記事|意味|とは|考え方|仕組み/.test(question);
}

/** 保存値は必要な問いのときだけ。曖昧なら自動送信せず追質問に任せる。 */
export function needsAgentBirth(question: string) {
  return (
    /本命星|私の|自分の|吉方位|吉日|引越.*(?:方位|日)|生まれ|何をすれば|どうすれば|おすすめ|相談/.test(
      question,
    ) && !isAgentGeneralQuestion(question)
  );
}
export function needsAgentOrigin(question: string) {
  return (
    /方位|街|出発|引越|市区町村|何をすれば|どうすれば|おすすめ|相談/.test(
      question,
    ) && !isAgentGeneralQuestion(question)
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

/** 質問と、クライアントが質問へ明示的に添付した保存値だけを照合する。 */
export function hasExplicitBirthDate(
  question: string,
  birthDate: unknown,
): boolean {
  if (typeof birthDate !== "string") return false;
  const target = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(birthDate);
  if (!target) return false;
  const normalized = question
    .normalize("NFKC")
    .replace(
      /(明治|大正|昭和|平成|令和)(元|\d+)年/g,
      (_, era: string, year: string) =>
        `${({ 明治: 1867, 大正: 1911, 昭和: 1925, 平成: 1988, 令和: 2018 }[era] ?? 0) + (year === "元" ? 1 : Number(year))}年`,
    );
  const dates = [
    ...normalized.matchAll(
      /(?<!\d)(?:(\d{4})[年/.-])?(\d{1,2})[月/.-](\d{1,2})(?:日)?(?!\d)/g,
    ),
  ];
  return dates.some(
    (d) =>
      (!d[1] || Number(d[1]) === Number(target[1])) &&
      Number(d[2]) === Number(target[2]) &&
      Number(d[3]) === Number(target[3]),
  );
}
export const UNKNOWN_BIRTH_DATE =
  "月日が不明です。年だけの入力を使うか利用者に尋ねてください";
