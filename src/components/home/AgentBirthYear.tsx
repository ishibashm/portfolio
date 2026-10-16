"use client";
import { useState } from "react";

/** 本命星だけの簡易入力。日柱・空亡の計算へ代表日を渡さない。 */
export function AgentBirthYear() {
  const [year, setYear] = useState("");
  const [boundary, setBoundary] = useState("");
  const [date, setDate] = useState("");
  const [result, setResult] = useState("");
  async function calculate() {
    const n = Number(year);
    if (!Number.isInteger(n) || n < 1900 || n > 2100 || !boundary) return;
    const birth = boundary === "yes" ? date : `${year}-07-01`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birth) || !birth.startsWith(year + "-"))
      return;
    const { getHonmeiStar } = await import("@/utils/ephemerisEngine");
    const d = new Date(birth + "T12:00:00+09:00");
    if (!Number.isFinite(d.getTime())) return;
    setResult(
      `本命星は${getHonmeiStar(d)}です。${boundary === "no" ? "節分境界外の年の代表日（7月1日）で計算しました。" : "指定日の正午を代表値として計算しました。立春当日は出生時刻により変わる場合があります。"}九星気学の参考情報です。`,
    );
  }
  return (
    <details className="text-sm">
      <summary className="cursor-pointer">
        本命星だけなら、生年から調べる
      </summary>
      <label className="mt-3 block">
        生年
        <input
          type="number"
          min="1900"
          max="2100"
          value={year}
          onChange={(e) => {
            setYear(e.target.value);
            setResult("");
          }}
          className="ml-2 border p-2"
        />
      </label>
      <label className="mt-3 block">
        1月1日〜2月4日生まれですか
        <select
          value={boundary}
          onChange={(e) => {
            setBoundary(e.target.value);
            setResult("");
          }}
          className="ml-2 border p-2"
        >
          <option value="">選んでください</option>
          <option value="no">いいえ</option>
          <option value="yes">はい</option>
        </select>
      </label>
      {boundary === "yes" && (
        <label className="mt-3 block">
          境界を確かめる生年月日
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="ml-2 border p-2"
          />
        </label>
      )}
      <button
        type="button"
        onClick={() => void calculate()}
        className="mt-3 underline"
      >
        端末内で本命星を計算
      </button>
      {result && <p className="mt-3">{result}</p>}
    </details>
  );
}
