import { AREAS } from "@/lib/areaContent";
/** 同梱の公開一覧だけ。外部の住所検索へ入力を渡さない。 */
export function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const names =
    q.length >= 2 && q.length <= 80 && /^[一-龯ぁ-んァ-ヶー\s]+$/.test(q)
      ? AREAS.filter((a) => (a.pref + a.city).includes(q))
          .slice(0, 6)
          .map((a) => a.pref + a.city)
      : [];
  return Response.json({ names });
}
