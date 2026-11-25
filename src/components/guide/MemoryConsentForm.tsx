import Link from "next/link";

const STAR_LABELS: Record<number, string> = {
  1: "一白水星",
  2: "二黒土星",
  3: "三碧木星",
  4: "四緑木星",
  5: "五黄土星",
  6: "六白金星",
  7: "七赤金星",
  8: "八白土星",
  9: "九紫火星",
};

const PREF_LABELS: Record<string, string> = {
  "01": "北海道",
  "02": "青森県",
  "03": "岩手県",
  "04": "宮城県",
  "05": "秋田県",
  "06": "山形県",
  "07": "福島県",
  "08": "茨城県",
  "09": "栃木県",
  "10": "群馬県",
  "11": "埼玉県",
  "12": "千葉県",
  "13": "東京都",
  "14": "神奈川県",
  "15": "新潟県",
  "16": "富山県",
  "17": "石川県",
  "18": "福井県",
  "19": "山梨県",
  "20": "長野県",
  "21": "岐阜県",
  "22": "静岡県",
  "23": "愛知県",
  "24": "三重県",
  "25": "滋賀県",
  "26": "京都府",
  "27": "大阪府",
  "28": "兵庫県",
  "29": "奈良県",
  "30": "和歌山県",
  "31": "鳥取県",
  "32": "島根県",
  "33": "岡山県",
  "34": "広島県",
  "35": "山口県",
  "36": "徳島県",
  "37": "香川県",
  "38": "愛媛県",
  "39": "高知県",
  "40": "福岡県",
  "41": "佐賀県",
  "42": "長崎県",
  "43": "熊本県",
  "44": "大分県",
  "45": "宮崎県",
  "46": "鹿児島県",
  "47": "沖縄県",
};

const TOPIC_LABELS: Record<string, string> = {
  honmei: "本命星",
  kippou: "吉方位",
  tenchusatsu: "天中殺",
  hidori: "引越しの日取り",
  rokuyo: "六曜",
  hinoeuma: "丙午",
  toukei: "統計的な裏づけ",
  move: "引越しの方位と日取り",
  today: "今日の吉方位",
};

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,119}$/;

export type MemoryConsentFormProps = {
  star?: number;
  pref?: string;
  topic?: string;
  topics?: string[];
  slugs?: string[];
  back?: "/annai/memory" | "/annai" | "/annai/ask";
};

/**
 * 案内役の条件・読んだ記事を長期記憶に保存するための明示同意フォーム。
 * チェックボックスは既定で未選択（UNCHECKED）とし、同意文言を隠さず全文表示する。
 */
export default function MemoryConsentForm({
  star,
  pref,
  topic,
  topics,
  slugs,
  back = "/annai/memory",
}: MemoryConsentFormProps) {
  const validStar =
    typeof star === "number" && Number.isInteger(star) && star >= 1 && star <= 9
      ? star
      : undefined;

  const validPref =
    typeof pref === "string" &&
    Object.prototype.hasOwnProperty.call(PREF_LABELS, pref)
      ? pref
      : undefined;

  const validTopics: string[] = [];
  for (const t of [...(topic ? [topic] : []), ...(topics ?? [])]) {
    if (
      typeof t === "string" &&
      Object.prototype.hasOwnProperty.call(TOPIC_LABELS, t) &&
      !validTopics.includes(t)
    ) {
      validTopics.push(t);
      if (validTopics.length >= 5) break;
    }
  }

  const validSlugs: string[] = [];
  for (const s of slugs ?? []) {
    if (typeof s === "string" && SLUG_RE.test(s) && !validSlugs.includes(s)) {
      validSlugs.push(s);
      if (validSlugs.length >= 20) break;
    }
  }

  const previewItems: string[] = [];
  if (validStar !== undefined) {
    previewItems.push(`本命星: ${STAR_LABELS[validStar]}`);
  }
  if (validPref !== undefined) {
    previewItems.push(`都道府県: ${PREF_LABELS[validPref]}`);
  }
  if (validTopics.length > 0) {
    previewItems.push(
      `話題: ${validTopics.map((t) => TOPIC_LABELS[t]).join("・")}`,
    );
  }
  if (validSlugs.length > 0) {
    previewItems.push(`読んだ記事: ${validSlugs.join("、")}`);
  }

  if (previewItems.length === 0) {
    return null;
  }

  return (
    <section
      aria-label="次回も条件を覚える"
      className="rounded-2xl border border-theme-border bg-theme-surface p-5 shadow-sm"
    >
      <form
        method="post"
        action="/annai/memory/save"
        className="space-y-3 text-sm text-ink"
      >
        <input type="hidden" name="back" value={back} />
        {validStar !== undefined && (
          <input type="hidden" name="star" value={String(validStar)} />
        )}
        {validPref !== undefined && (
          <input type="hidden" name="pref" value={validPref} />
        )}
        {validTopics.map((t) => (
          <input key={`topic-${t}`} type="hidden" name="topic" value={t} />
        ))}
        {validSlugs.map((s) => (
          <input key={`slug-${s}`} type="hidden" name="slug" value={s} />
        ))}

        <label className="flex items-center gap-2 font-bold text-ink cursor-pointer">
          <input
            type="checkbox"
            name="consent"
            value="yes"
            className="accent-accent focus-visible:outline-accent"
          />
          <span>次回も条件を覚える</span>
        </label>

        <div className="rounded-xl border border-theme-border bg-theme-subtle px-3.5 py-2.5 text-xs text-ink">
          <span className="font-bold">このページから保存される項目: </span>
          <span>{previewItems.join(" / ")}</span>
        </div>

        <div className="space-y-1.5 text-xs leading-relaxed text-ink-muted max-w-[70ch]">
          <p>
            次の項目だけを、当サイトのデータベースに暗号化して保存し、お使いのブラウザにランダムな識別子のCookie（annai_mem）を置きます。
          </p>
          <p className="font-semibold text-ink">
            ・本命星（1〜9）　・出発地の都道府県　・関心のある話題の区分　・読んだ記事の識別子
          </p>
          <p>
            質問や回答の文章、生年月日、氏名、連絡先、IPアドレスは保存しません。
          </p>
          <p>
            目的は、次回の案内で条件の入力を省くことだけです。最後に使った日から90日（最長でも保存開始から1年）で、自動的に使えなくなり削除します。
          </p>
          <p>
            「
            <Link
              href="/annai/memory"
              className="font-semibold text-accent underline hover:text-ink"
            >
              記憶を見る・消す
            </Link>
            」のページで、いつでも確認・書き出し・削除ができます。覚えなくても、案内役のすべての機能をご利用いただけます。
          </p>
        </div>

        <div className="pt-1">
          <button
            type="submit"
            className="rounded-xl border border-theme-border bg-theme-subtle px-4 py-2 text-xs font-bold text-ink hover:border-accent hover:bg-theme-accent-soft"
          >
            覚える
          </button>
        </div>
      </form>
    </section>
  );
}
