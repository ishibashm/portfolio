/**
 * MCP（Model Context Protocol）サーバーの本体。
 *
 * AI アシスタントが、このサイトの判定と地理の一覧を**道具として**呼べる
 * ようにする。llms.txt が「読み物」として案内するのに対し、こちらは
 * 「計算」を渡す。
 *
 * ## 決め事
 *
 * - **公開しているものしか出さない。**ここで返すのは、ログインなしで
 *   画面から得られる計算（方位の吉凶・日取り・市区町村の一覧・県の
 *   まとめ）だけ。個人データ・履歴・管理系は一切触らない。公開範囲を
 *   広げる変更ではない
 * - **DB に触らない。**全部 in-process の計算と静的 JSON。物件の走査
 *   （/api/rentals/arbitrage）は数秒かかるうえ DB を食うので、ここには
 *   載せない。案内だけ返す
 * - **判定はページと同じ関数を呼ぶ。**auspiciousDays / areaContent /
 *   prefContent をそのまま使う。ここに判定を書き写さない（写すと画面と
 *   食い違う。3 節の方針）
 * - **状態を持たない。**リクエストごとに server と transport を作る。
 *   Cloud Run は複数インスタンスで動くので、セッションを持つと別の
 *   インスタンスに当たったときに壊れる
 *
 * route.ts はこれを呼ぶだけ。中身はここに置いて、HTTP を通さずに
 * 検査できるようにしてある（__tests__/mcpServer.test.ts）。
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  ALL_DIRECTIONS,
  type AuspiciousDayParams,
  findAuspiciousDaysAllDirections,
  gradeVerdict,
  judgeDayAllDirections,
} from "@/utils/auspiciousDays";
import {
  getHonmeiStar,
  getPersonalVoidZodiac,
  parseDirectionFilterMode,
} from "@/utils/ephemerisEngine";
import { forecastAnchorMs } from "@/utils/boardInstant";
import {
  DEFAULT_TENCHUSATSU_MODE,
  isTenchusatsuMode,
  type TenchusatsuMode,
} from "@/utils/tenchusatsuPolicy";
import {
  AREAS,
  areaAsOf,
  emptyDirections,
  findArea,
  neighboursByDirection,
} from "@/lib/areaContent";
import { DIRECTION_LABELS, DIRECTIONS } from "@/lib/kigakuContent";
import {
  getPrefStats,
  prefCodeByName,
  prefNameByCode,
} from "@/lib/prefContent";

export const SITE_NAME = "Cloud Palette";
export const SITE_URL = "https://cloud-palette.com";

/** 生年月日・日付の受け口。YYYY-MM-DD を日本時間の正午に寄せる（4.1 節）。 */
function parseJstDate(value: string): Date | null {
  const d = new Date(value.includes("T") ? value : `${value}T12:00:00+09:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const tenchusatsuSchema = z
  .enum(["strict", "month_day", "day_only", "weaken", "off"])
  .optional()
  .describe(
    "天中殺の扱い。strict=年月日すべて避ける / month_day / day_only / weaken=弱める（禁止しない） / off。既定は画面と同じ",
  );
const directionFilterSchema = z
  .enum(["composite", "personal_kigaku", "personal_bazi", "environmental"])
  .optional()
  .describe("絞り込みの見方。既定 composite（総合判定）");

function text(payload: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(payload, null, 2) },
    ],
    structuredContent: payload as Record<string, unknown>,
  };
}

function fail(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true as const,
  };
}

/** 生年月日と経度から判定の材料を組む。auspicious-days route と同じ手順。 */
type BuiltBase =
  | { ok: false; error: string }
  | {
      ok: true;
      honmei: ReturnType<typeof getHonmeiStar>;
      voidZodiacs: string[];
      tenchusatsuMode: TenchusatsuMode;
      base: Omit<AuspiciousDayParams, "direction">;
    };

function buildBase(input: {
  birthDate?: string | undefined;
  lon?: number | undefined;
  tenchusatsuMode?: string | undefined;
  involuntaryMove?: boolean | undefined;
  directionFilterMode?: string | undefined;
}): BuiltBase {
  const birth = input.birthDate ? parseJstDate(input.birthDate) : null;
  if (!birth)
    return { ok: false, error: "birthDate は YYYY-MM-DD で指定してください。" };
  if (typeof input.lon !== "number" || !Number.isFinite(input.lon)) {
    return {
      ok: false,
      error: "lon（出発地の経度）は数値で指定してください。",
    };
  }
  const raw = input.tenchusatsuMode ?? DEFAULT_TENCHUSATSU_MODE;
  const tenchusatsuMode: TenchusatsuMode = isTenchusatsuMode(raw)
    ? raw
    : DEFAULT_TENCHUSATSU_MODE;
  const honmei = getHonmeiStar(birth);
  const voidZodiacs = getPersonalVoidZodiac(birth);
  return {
    ok: true,
    honmei,
    voidZodiacs,
    tenchusatsuMode,
    base: {
      honmeiStar: honmei.classical,
      voidZodiacs,
      lon: input.lon,
      tenchusatsuMode,
      involuntaryMove: input.involuntaryMove === true,
      directionFilterMode: parseDirectionFilterMode(input.directionFilterMode),
    },
  };
}

/** 1 リクエストぶんのサーバーを作る。状態は持たない。 */
export function createMcpServer(): McpServer {
  const server = new McpServer(
    { name: "cloud-palette", version: "1.0.0" },
    {
      instructions: [
        `${SITE_NAME}（${SITE_URL}）の九星気学の方位判定と、市区町村ごとの方位別一覧を道具として提供します。`,
        "判定は出発地の経度と生年月日に依存します。結果を断定せず、条件と一緒に伝えてください。",
        "効果や健康への影響は断定しません。「〜とされる」の範囲で扱ってください。",
        `出典は「${SITE_NAME}（${SITE_URL}）」と表記してください。詳細: ${SITE_URL}/llms.txt`,
      ].join("\n"),
    },
  );

  server.registerTool(
    "get_honmei_star",
    {
      title: "本命星を調べる",
      description:
        "生年月日から本命星（九星）と天中殺の干支を返します。年の切り替わりは立春の節入り時刻（日本時間）です。",
      inputSchema: {
        birthDate: z.string().describe("生年月日。YYYY-MM-DD"),
      },
    },
    async ({ birthDate }) => {
      const birth = parseJstDate(birthDate);
      if (!birth) return fail("birthDate は YYYY-MM-DD で指定してください。");
      const honmei = getHonmeiStar(birth);
      return text({
        birthDate,
        honmeiStar: honmei.classical,
        physicalStar: honmei.physical,
        voidZodiacs: getPersonalVoidZodiac(birth),
        note: "honmeiStar は古典暦（立春基準）の値。physicalStar は木星黄経に基づく別の流儀で、画面の既定は honmeiStar。",
      });
    },
  );

  server.registerTool(
    "judge_directions",
    {
      title: "指定日の八方位の吉凶",
      description:
        "出発地の経度と生年月日から、指定日の八方位それぞれの段階（S 三盤吉〜X 五大凶殺）と状態を返します。年盤・月盤・日盤を合成した判定で、画面の「物件を方位で探す」と同じ関数です。",
      inputSchema: {
        birthDate: z.string().describe("生年月日。YYYY-MM-DD"),
        lon: z.number().min(122).max(154).describe("出発地の経度（日本国内）"),
        date: z
          .string()
          .optional()
          .describe("判定する日。YYYY-MM-DD。省略時は今日（日本時間）"),
        tenchusatsuMode: tenchusatsuSchema,
        involuntaryMove: z
          .boolean()
          .optional()
          .describe("転勤など不可抗力の移動なら true（天中殺の扱いが変わる）"),
        directionFilterMode: directionFilterSchema,
      },
    },
    async (input) => {
      const built = buildBase(input);
      if (!built.ok) return fail(built.error);
      const day = input.date ? parseJstDate(input.date) : new Date();
      if (!day) return fail("date は YYYY-MM-DD で指定してください。");
      const all = judgeDayAllDirections(
        new Date(forecastAnchorMs(day)),
        built.base,
      );
      const any = all[ALL_DIRECTIONS[0]];
      const directions = ALL_DIRECTIONS.map((dir) => {
        const v = all[dir];
        return {
          direction: dir,
          label: DIRECTION_LABELS[dir as keyof typeof DIRECTION_LABELS],
          tier: gradeVerdict(v),
          status: v.finalStatus,
          yearLayer: v.yearLayer,
          monthLayer: v.monthLayer,
          dayLayer: v.dayLayer,
          isTripleAuspicious: v.isTripleAuspicious,
          hasTendo: v.hasTendo,
          isDoyouSatsu: v.isDoyouSatsu,
        };
      });
      return text({
        date: any.date,
        weekday: any.weekday,
        rokuyo: any.rokuyo,
        tags: any.tags,
        blockedByTenchusatsu: any.blockedByTenchusatsu,
        honmeiStar: built.honmei.classical,
        voidZodiacs: built.voidZodiacs,
        tenchusatsuMode: built.tenchusatsuMode,
        directions,
        tiers:
          "S 三盤吉 / A 吉2盤 / B 吉1盤 / C 平 / D 軽い凶 / X 五大凶殺・天中殺",
      });
    },
  );

  server.registerTool(
    "find_auspicious_days",
    {
      title: "吉方位の日取りを探す",
      description:
        "期間内で、八方位それぞれに動ける日（三盤吉・吉日）を集計します。画面の「引っ越し時期を探す」と同じ関数です。日数が多いほど計算に時間がかかります。",
      inputSchema: {
        birthDate: z.string().describe("生年月日。YYYY-MM-DD"),
        lon: z.number().min(122).max(154).describe("出発地の経度（日本国内）"),
        from: z
          .string()
          .optional()
          .describe("開始日。YYYY-MM-DD。省略時は今日"),
        days: z
          .number()
          .int()
          .min(30)
          .max(730)
          .optional()
          .describe("走査する日数。30〜730。既定 180"),
        maxDaysPerDirection: z
          .number()
          .int()
          .min(1)
          .max(60)
          .optional()
          .describe("方位ごとに返す日付の上限。既定 10"),
        tenchusatsuMode: tenchusatsuSchema,
        involuntaryMove: z.boolean().optional(),
        directionFilterMode: directionFilterSchema,
      },
    },
    async (input) => {
      const built = buildBase(input);
      if (!built.ok) return fail(built.error);
      const from = input.from ? parseJstDate(input.from) : new Date();
      if (!from) return fail("from は YYYY-MM-DD で指定してください。");
      const days = input.days ?? 180;
      const to = new Date(from);
      to.setDate(to.getDate() + days);
      const cap = input.maxDaysPerDirection ?? 10;
      const summaries = findAuspiciousDaysAllDirections(from, to, built.base);
      return text({
        from: from.toISOString().slice(0, 10),
        days,
        honmeiStar: built.honmei.classical,
        voidZodiacs: built.voidZodiacs,
        tenchusatsuMode: built.tenchusatsuMode,
        directions: summaries.map((s) => ({
          direction: s.direction,
          label: s.directionLabel,
          scannedDays: s.scannedDays,
          tripleAuspiciousDays: s.tripleAuspiciousDays,
          availableDays: s.availableDays,
          blockedByTenchusatsuDays: s.blockedByTenchusatsuDays,
          yearBoardWindow: s.window,
          bestDays: s.days.slice(0, cap).map((d) => ({
            date: d.date,
            tier: gradeVerdict(d),
            status: d.finalStatus,
            rokuyo: d.rokuyo,
            tags: d.tags,
          })),
        })),
      });
    },
  );

  server.registerTool(
    "search_municipality",
    {
      title: "市区町村を探す",
      description:
        "名前の一部から、賃貸の掲載を集計できている市区町村（全国 1,100 前後）を探し、コードと代表点を返します。area_directions / prefecture_summary の入力に使います。",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe("市区町村名の一部。例: 長崎、札幌市北区"),
        limit: z.number().int().min(1).max(50).optional().describe("既定 10"),
      },
    },
    async ({ query, limit }) => {
      const q = query.trim();
      const hits = AREAS.filter(
        (a) => a.full.includes(q) || a.city.includes(q) || a.pref.includes(q),
      )
        .sort((a, b) => b.count - a.count)
        .slice(0, limit ?? 10)
        .map((a) => ({
          code: a.code,
          name: a.full,
          pref: a.pref,
          lat: a.lat,
          lon: a.lon,
          listings: a.count,
          medianRent: a.medianRent,
          asOf: areaAsOf(a),
          page: `${SITE_URL}/houi/area/${a.code}`,
        }));
      return text({ query: q, count: hits.length, results: hits });
    },
  );

  server.registerTool(
    "area_directions",
    {
      title: "市区町村から見た方位別の一覧",
      description:
        "出発地の市区町村コードから、八方位それぞれに 5〜150km の範囲でどの市区町村があるか（近い順）と、候補の無い方位の理由を返します。画面の市区町村ページと同じ計算（伝統区分＝四正 30 度・四隅 60 度、真北基準）です。",
      inputSchema: {
        code: z
          .string()
          .regex(/^\d{5}$/)
          .describe("市区町村コード（5 桁）。search_municipality で引ける"),
        perDirection: z
          .number()
          .int()
          .min(1)
          .max(30)
          .optional()
          .describe("方位ごとの件数上限。既定 8"),
      },
    },
    async ({ code, perDirection }) => {
      const origin = findArea(code);
      if (!origin)
        return fail(
          `コード ${code} の市区町村は掲載の集計がありません。search_municipality で確かめてください。`,
        );
      const cap = perDirection ?? 8;
      const groups = neighboursByDirection(origin);
      const empties = emptyDirections(origin);
      /* too_close を dead_end より先に見る。**順番を入れ替えると、
         すぐ隣に街のある方位が行き止まりとして出る**（areaContent の
         hasNearMunicipality の註）。 */
      const kind = (e: (typeof empties)[number]) =>
        e.hasBeyondRange
          ? "far_only"
          : e.hasAnyMunicipality
            ? "no_listings"
            : e.hasNearMunicipality
              ? "too_close"
              : "dead_end";
      return text({
        origin: {
          code: origin.code,
          name: origin.full,
          lat: origin.lat,
          lon: origin.lon,
          medianRent: origin.medianRent,
          asOf: areaAsOf(origin),
          page: `${SITE_URL}/houi/area/${origin.code}`,
        },
        rangeKm: { min: 5, max: 150 },
        directions: DIRECTIONS.map((d) => ({
          direction: d,
          label: DIRECTION_LABELS[d],
          count: groups[d].length,
          nearest: groups[d].slice(0, cap).map((n) => ({
            code: n.code,
            name: n.full,
            distanceKm: n.distanceKm,
            bearing: n.bearing,
            medianRent: n.medianRent,
            rentDiffPct: n.rentDiffPct,
          })),
        })),
        emptyDirections: empties.map((e) => ({
          direction: e.direction,
          label: DIRECTION_LABELS[e.direction],
          kind: kind(e),
          meaning:
            kind(e) === "dead_end"
              ? "全国 1,894 市区町村の位置で確かめて、どの距離にも市区町村が無い（海や山で陸が尽きる）"
              : kind(e) === "no_listings"
                ? "市区町村は実在するが、賃貸の掲載をまだ集計できていない。行き止まりではない"
                : kind(e) === "too_close"
                  ? "市区町村は実在するが 5km 未満で、方位が定まらないため一覧から外れている。行き止まりではない"
                  : "150km より先には掲載のある市区町村がある",
          nearestUnlisted: e.nearestUnlisted,
          nearestTooClose: e.nearestTooClose,
        })),
      });
    },
  );

  server.registerTool(
    "prefecture_summary",
    {
      title: "都道府県のまとめ",
      description:
        "都道府県（JIS 2 桁コードまたは名前）の、掲載を集計できている市区町村と、県の面積重心から見た八方位ごとの市区町村を返します。画面の県ページと同じ計算です。",
      inputSchema: {
        prefecture: z
          .string()
          .min(1)
          .describe("JIS 2 桁コード（例: 42）または県名（例: 長崎県）"),
        perDirection: z
          .number()
          .int()
          .min(1)
          .max(30)
          .optional()
          .describe("方位ごとの件数上限。既定 8"),
      },
    },
    async ({ prefecture, perDirection }) => {
      const name = /^\d{2}$/.test(prefecture)
        ? prefNameByCode(prefecture)
        : prefecture;
      if (!name) return fail(`県コード ${prefecture} が分かりません。`);
      const stats = getPrefStats(name);
      if (!stats) return fail(`${name} の集計がありません。`);
      const cap = perDirection ?? 8;
      return text({
        pref: stats.pref,
        code: stats.code,
        center: stats.center,
        municipalitiesWithListings: stats.municipalities.length,
        medianOfMedians: stats.medianOfMedians,
        asOf: stats.asOf ?? null,
        byDirection: stats.byDirection.map((g) => ({
          direction: g.dir,
          label: g.jp,
          count: g.areas.length,
          municipalities: g.areas.slice(0, cap).map((a) => ({
            code: a.code,
            name: a.city,
            medianRent: a.medianRent,
          })),
        })),
        emptyDirections: stats.emptyDirections,
        emptyMeaning:
          "県内で掲載を集計できている市区町村がその方位に無いという意味。巡回が届いていないだけの場合があり、街が無いとは限らない",
        page: `${SITE_URL}/houi/pref/${stats.code}`,
        note: `方位は県の面積重心から見た目安。個別の判断は出発地の市区町村から（area_directions）。`,
      });
    },
  );

  return server;
}

/** 名前から県コードを引く補助。テストと route で使う。 */
export { prefCodeByName };
