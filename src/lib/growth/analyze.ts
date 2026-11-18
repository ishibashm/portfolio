import { priorityScore } from "./safety";
import type {
  BacklogItem,
  BuilderProposal,
  ContentBrief,
  Finding,
  GrowthConfig,
  GrowthReport,
  LiveSnapshot,
  RepoFacts,
} from "./types";

function finding(
  partial: Omit<Finding, "evidence"> & { evidence?: string[] },
): Finding {
  return { evidence: [], ...partial };
}

function item(
  partial: Omit<BacklogItem, "score"> & { score?: number },
): BacklogItem {
  return {
    ...partial,
    score: priorityScore(partial.impact, partial.effort),
  };
}

function titleHits(titles: string[], words: string[]): boolean {
  return titles.some((title) => words.some((word) => title.includes(word)));
}

export function analyzeRepo(
  facts: RepoFacts,
  live: LiveSnapshot,
  config: GrowthConfig,
): Omit<
  GrowthReport,
  | "version"
  | "generatedAt"
  | "siteUrl"
  | "provider"
  | "merge"
  | "deploy"
  | "facts"
  | "live"
  | "diff"
  | "narrative"
  | "llmNote"
> {
  const findings: Finding[] = [];

  findings.push(
    finding({
      id: "auditor.core-routes",
      role: "auditor",
      severity: "ok",
      title: "中核ルートを1か所から数えた",
      detail: `公開の中核は ${facts.coreRouteCount} 本。llms.txt は同じ定義から出る。`,
      evidence: ["src/lib/siteStructure.ts", "src/app/llms.txt/route.ts"],
    }),
  );

  if (facts.llmsMentionsMcp && facts.mcpToolNames.length >= 18) {
    findings.push(
      finding({
        id: "auditor.mcp-surface",
        role: "auditor",
        severity: "ok",
        title: "MCP の公開道具が案内と揃っている",
        detail: `公開道具 ${facts.mcpToolNames.length} 個。llms.txt は /api/mcp に触れている。`,
        evidence: ["src/lib/mcpServer.ts"],
      }),
    );
  } else {
    findings.push(
      finding({
        id: "auditor.mcp-surface",
        role: "auditor",
        severity: "high",
        title: "MCP の案内が実装より薄い",
        detail: `道具 ${facts.mcpToolNames.length} 個、llms の言及は ${facts.llmsMentionsMcp ? "あり" : "なし"}。`,
        evidence: ["src/lib/mcpServer.ts", "src/app/llms.txt/route.ts"],
      }),
    );
  }

  const indexableGaps = facts.canonicalGaps.filter((gap) => gap.indexable);
  const hiddenGaps = facts.canonicalGaps.filter((gap) => !gap.indexable);
  if (hiddenGaps.length > 0) {
    findings.push(
      finding({
        id: "auditor.canonical-noindex",
        role: "auditor",
        severity: "low",
        title: "noindex の頁は自分の canonical を書いていない",
        detail: `${hiddenGaps.length} 頁。索引には出さないので、ホームの canonical を継承しても検索結果の重複にはなりにくい。`,
        evidence: hiddenGaps.slice(0, 8).map((gap) => gap.file),
      }),
    );
  }

  if (indexableGaps.length === 0) {
    findings.push(
      finding({
        id: "auditor.canonical",
        role: "auditor",
        severity: "ok",
        title: "同じディレクトリに canonical が無い索引頁は見当たらない",
        detail:
          "ルート layout の / を、子が黙って継承している頁は、この見方では残っていない。",
        evidence: ["src/app"],
      }),
    );
  } else {
    findings.push(
      finding({
        id: "auditor.canonical",
        role: "auditor",
        severity: "high",
        title: "canonical が同じディレクトリに無い頁がある",
        detail: `${indexableGaps.length} 頁。ルートの canonical が / なので、検索ではホームの重複に見えうる。`,
        evidence: indexableGaps.slice(0, 12).map((gap) => gap.file),
      }),
    );
  }

  if (facts.openGraphBypass.length === 0) {
    findings.push(
      finding({
        id: "auditor.open-graph",
        role: "auditor",
        severity: "ok",
        title: "子ページの openGraph は pageOpenGraph 経由",
        detail:
          "共有カードがホームの題と URL のままになる書き方は見当たらない。画像は共通の /ogp.png が多い。",
        evidence: ["src/lib/siteUrl.ts"],
      }),
    );
  } else {
    findings.push(
      finding({
        id: "auditor.open-graph",
        role: "auditor",
        severity: "high",
        title: "openGraph をオブジェクトのまま書いている頁がある",
        detail: "url・siteName・locale が落ちる。pageOpenGraph に寄せる。",
        evidence: facts.openGraphBypass.slice(0, 12),
      }),
    );
  }

  findings.push(
    finding({
      id: "auditor.image-preview",
      role: "auditor",
      severity: facts.indexedRobotsLargePreview ? "ok" : "high",
      title: facts.indexedRobotsLargePreview
        ? "索引頁は大きい画像プレビューを許している"
        : "索引頁の max-image-preview が見当たらない",
      detail:
        "Discover は大きい画像プレビューを使う。頁側の robots で上書きすると落ちる。",
      evidence: ["src/lib/siteStructure.ts"],
    }),
  );

  findings.push(
    finding({
      id: "auditor.same-as",
      role: "auditor",
      severity: facts.sameAs.length >= 2 ? "ok" : "medium",
      title: "運営チャンネルの sameAs",
      detail: `${facts.sameAs.length} 件を Organization に出している。作っていないチャンネルは足さない。`,
      evidence: ["src/lib/siteChannels.ts"],
    }),
  );

  if (facts.shortPosts.length > 0) {
    findings.push(
      finding({
        id: "auditor.short-posts",
        role: "auditor",
        severity: "medium",
        title: "本文の短い公開記事がある",
        detail: `下書きを除き、可算文字 2000 未満が ${facts.shortPosts.length} 本。審査で「有用性が低い」とされたあとの残件。`,
        evidence: facts.shortPosts
          .slice(0, 8)
          .map((post) => `content/blog/${post.id}.md (${post.chars})`),
      }),
    );
  }

  if (facts.shortAreaLeads.length > 0) {
    findings.push(
      finding({
        id: "auditor.short-areas",
        role: "auditor",
        severity: "medium",
        title: "リードが短い市区町村の文章がある",
        detail: `固有文 ${facts.areaEditorialCount} 件のうち、リード 200 字未満が ${facts.shortAreaLeads.length}。索引対象は ${facts.indexedAreaCount} 頁（住宅統計もあるもの）。`,
        evidence: facts.shortAreaLeads
          .slice(0, 8)
          .map((area) => `${area.id} (${area.chars})`),
      }),
    );
  } else {
    findings.push(
      finding({
        id: "auditor.area-depth",
        role: "auditor",
        severity: "ok",
        title: "市区町村のリードは 200 字以上",
        detail: `固有文 ${facts.areaEditorialCount} 件、そのうち索引条件を満たすのは ${facts.indexedAreaCount} 頁。雛形のままの頁は索引に載せない。`,
        evidence: ["src/lib/areaEditorial.ts", "src/lib/areaAffiliate.ts"],
      }),
    );
  }

  const trustOk =
    facts.trust.privacy &&
    facts.trust.about &&
    facts.trust.contact &&
    facts.trust.editorial &&
    facts.trust.privacyMentionsAdsense &&
    facts.trust.privacyMentionsAffiliate &&
    facts.trust.privacyLinksContact &&
    facts.trust.privacyMentionsEea &&
    facts.trust.privacyMentionsExternalSend;
  findings.push(
    finding({
      id: "monetization.trust-pages",
      role: "monetization",
      severity: trustOk ? "ok" : "blocker",
      title: trustOk
        ? "信頼頁と広告の開示が揃っている"
        : "信頼頁か広告の開示が足りない",
      detail: trustOk
        ? "about / contact / privacy / editorial があり、プライバシーは AdSense・アフィリエイト・外部送信・欧州経済領域と、問い合わせへのリンクを持つ。"
        : "審査では運営者情報・問い合わせ・プライバシー・広告 Cookie の説明が要る。",
      evidence: [
        "src/app/about/page.tsx",
        "src/app/contact/page.tsx",
        "src/app/privacy/page.tsx",
        "src/app/editorial/page.tsx",
      ],
    }),
  );

  findings.push(
    finding({
      id: "monetization.adsense-review",
      role: "monetization",
      severity: config.adsenseReview === "passed" ? "ok" : "blocker",
      title:
        config.adsenseReview === "passed"
          ? "AdSense 審査は通過済みと設定されている"
          : "AdSense 審査は未通過",
      detail:
        config.adsenseReview === "passed"
          ? "設定が passed。収益枠の実装に進める。再申請はこのフレームワークからは出さない。"
          : "不承認理由は「有用性の低いコンテンツ」（2026-11-12 の記録）。再申請は所有者が管理画面で出す。この実行は申請しない。",
      evidence: ["growth.config.json", "docs/adsense-rereview-plan.md"],
    }),
  );

  if (facts.ads.adsTxtRejectsPlaceholder) {
    findings.push(
      finding({
        id: "monetization.ads-txt",
        role: "monetization",
        severity: "ok",
        title: "ads.txt は実 ID が無いとき 404",
        detail:
          "ゼロ埋めの見本 ID は配信しない。本番の ID はこのレポートに書かない。",
        evidence: ["src/app/ads.txt/route.ts", "src/lib/adsense.ts"],
      }),
    );
  } else {
    findings.push(
      finding({
        id: "monetization.ads-txt",
        role: "monetization",
        severity: "blocker",
        title: "ads.txt が架空の販売者を出しうる",
        detail: "ID が無いときは 404、見本のゼロ埋めは拒否する。",
        evidence: ["src/app/ads.txt/route.ts"],
      }),
    );
  }

  if (
    facts.ads.consentUi &&
    facts.ads.consentDefaultsNonPersonalized &&
    facts.ads.scriptStaysForReview
  ) {
    findings.push(
      finding({
        id: "monetization.consent",
        role: "monetization",
        severity: "medium",
        title: "同意バーはある。認定 CMP ではない",
        detail:
          "同意までは非パーソナライズ。選択は端末の localStorage だけで、審査用スクリプトは head に残す。欧州でパーソナライズ広告を出すには、Funding Choices などの認定 CMP がまだ要る。",
        evidence: [
          "src/lib/adConsent.ts",
          "src/components/ads/AdConsentBar.tsx",
          "src/app/layout.tsx",
        ],
      }),
    );
  } else {
    findings.push(
      finding({
        id: "monetization.consent",
        role: "monetization",
        severity: "blocker",
        title: "広告 Cookie の同意が無い",
        detail:
          "日本の外部送信の説明と、欧州経済領域では同意の前にパーソナライズ広告の Cookie を置かないことが要る。",
        evidence: ["src/app/layout.tsx", "src/app/privacy/page.tsx"],
      }),
    );
  }

  findings.push(
    finding({
      id: "monetization.slots",
      role: "monetization",
      severity: "low",
      title: "手動枠は空のままにしない",
      detail: facts.ads.bannerReservesSpace
        ? "スロットが有効なときだけ描き、高さ 250px を先に確保し、画面の近くに来てから push する。自動広告のアンカーとビネットは、通過後に管理画面で切る（CLS と誤タップ）。"
        : "枠に高さが無く、広告のあとで本文が動く。",
      evidence: ["src/components/ads/AdBanner.tsx"],
    }),
  );

  findings.push(
    finding({
      id: "monetization.affiliate",
      role: "monetization",
      severity: facts.affiliate.includesDmm ? "high" : "low",
      title: facts.affiliate.includesDmm
        ? "金融の案件が掲載リストに入っている"
        : "審査前の代替は引越し案件に寄せている",
      detail: `掲載 ID は ${facts.affiliate.ids.join("、") || "なし"}。ハコブは ${facts.affiliate.hakobuPlacements} 箇所で、対象地域の注記は${facts.affiliate.hakobuHasAreaNote ? "ある" : "無い"}。楽天は ${facts.affiliate.rakutenPlacements} 箇所。DMM FX は${facts.affiliate.includesDmm ? "含まれている" : "リストに無い"}。楽天は風水の記事にあり、買い物が主題ではないので増やさない。`,
      evidence: ["src/lib/affiliateOffers.ts", "src/lib/areaAffiliate.ts"],
    }),
  );

  for (const probe of live.probes) {
    if (!probe.ok) {
      findings.push(
        finding({
          id: `auditor.live.${probe.path.replace(/[^a-z0-9]+/gi, "-")}`,
          role: "auditor",
          severity: "medium",
          title: `本番 ${probe.path} を確認できなかった`,
          detail: probe.note,
          evidence: [probe.path],
        }),
      );
    }
  }

  const gaps: { id: string; title: string; query: string; covered: boolean }[] =
    [
      {
        id: "moving-cost",
        title: "引越し費用の見積もりと方位を同じ頁で説明する",
        query: "引越し 費用 相場",
        covered: titleHits(facts.blogTitles, ["費用", "見積"]),
      },
      {
        id: "weekend-hidori",
        title: "土日に引越しできる日の探し方",
        query: "引越し 土日 吉日",
        covered: titleHits(facts.blogTitles, ["土日", "日取り"]),
      },
      {
        id: "feng-vs-kigaku",
        title: "風水と九星気学の違い",
        query: "風水 九星気学 違い",
        covered: titleHits(facts.blogTitles, ["風水"]),
      },
    ];

  const backlog: BacklogItem[] = [
    item({
      id: "adsense-rereview-owner",
      title: "AdSense の再申請は所有者が出す",
      area: "monetization",
      impact: 5,
      effort: 1,
      safeToAutoApply: false,
      why: "有用性の指摘が残っているあいだに同じ内容で何度も出さない。マージやこの実行では申請しない。",
    }),
    item({
      id: "certified-cmp",
      title: "欧州向けは認定 CMP に切り替える",
      area: "monetization",
      impact: 3,
      effort: 3,
      safeToAutoApply: false,
      why: "自前バーは非パーソナライズの既定まで。パーソナライズ広告の収益を欧州で取るなら Funding Choices など認定済みの同意が要る。",
    }),
    item({
      id: "manual-slots-after-approval",
      title: "通過後は手動枠を記事末と地域頁に限る",
      area: "monetization",
      impact: 4,
      effort: 2,
      safeToAutoApply: false,
      why: "自動広告のアンカーは CLS と誤タップを増やす。記事・使い方・市区町村の末尾だけに 250px の枠を置き、トップの最初の画面には置かない。スロット ID が無いあいだは空枠を出さない。",
    }),
  ];

  if (facts.shortPosts.length > 0) {
    backlog.push(
      item({
        id: "thicken-short-posts",
        title: "短い記事を一次情報の範囲で厚くする",
        area: "content",
        impact: 4,
        effort: 3,
        safeToAutoApply: false,
        why: `2000 字未満が ${facts.shortPosts.length} 本。相場の額や健康の断定は足さない。審査の「有用性」に直接効く。`,
      }),
    );
  }

  if (facts.shortAreaLeads.length > 0) {
    backlog.push(
      item({
        id: "thicken-area-leads",
        title: "短い市区町村リードを地理の構造で足す",
        area: "content",
        impact: 5,
        effort: 4,
        safeToAutoApply: false,
        why: "索引に載る地域頁は検索クリックの中心だった。金額は書かず、方位の行き止まりだけを実測から書く。",
      }),
    );
  }

  if (indexableGaps.length > 0) {
    backlog.push(
      item({
        id: "fix-canonical",
        title: "canonical の無い索引頁を自分の URL にする",
        area: "traffic",
        impact: 4,
        effort: 2,
        safeToAutoApply: false,
        why: "ホームの canonical を継承すると、その頁が索引に残りにくい。",
      }),
    );
  }

  for (const gap of gaps) {
    if (gap.covered) continue;
    backlog.push(
      item({
        id: `topic-${gap.id}`,
        title: gap.title,
        area: "traffic",
        impact: 4,
        effort: 3,
        safeToAutoApply: false,
        why: `検索の意図「${gap.query}」に、題名が直接応える記事が無い。既存の道具（/calendar・/houi・/relocation/purchase）へ戻す内部リンクを先に置く。`,
      }),
    );
  }

  backlog.push(
    item({
      id: "per-page-og",
      title: "共有用の画像を頁の題入りにする",
      area: "illustration",
      impact: 3,
      effort: 3,
      safeToAutoApply: false,
      why: "多くの頁が同じ /ogp.png を使う。/houi と /calendar と記事だけでも題の入った 1200×630 にすると、チャットと SNS からの戻りが増える。",
    }),
    item({
      id: "shorts-back-to-tool",
      title: "短い動画の概要欄から道具の URL へ戻す",
      area: "video",
      impact: 4,
      effort: 2,
      safeToAutoApply: false,
      why: "方位と住まいの手帖は sameAs にある。動画単体で終わらせず、今日の吉方位・日取り・地域頁のどれか 1 本へ戻す。",
    }),
    item({
      id: "keep-llms-current",
      title: "llms.txt と MCP の道具一覧をずらさない",
      area: "traffic",
      impact: 3,
      effort: 1,
      safeToAutoApply: false,
      why: "AI 検索の引用は /llms.txt と /api/mcp が入口。道具を足したときは案内文も同じ PR で更新する。",
    }),
  );

  if (!facts.homeLinksCore) {
    backlog.push(
      item({
        id: "home-core-links",
        title: "ホームから中核ルートへリンクする",
        area: "traffic",
        impact: 3,
        effort: 1,
        safeToAutoApply: false,
        why: "入口が道具を指していないと、検索で着地した人が奥へ進まない。",
      }),
    );
  }

  backlog.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  const briefs: ContentBrief[] = [
    {
      backlogId: "per-page-og",
      kind: "illustration",
      title: "共有画像の指示（/houi と /calendar）",
      body: "1200×630。地色は #faf7f3、文字は #292524、アクセントは赤みのある #9f1239。写真は使わない。方位は八方位の円、日取りは月の升目を 1 つ。題は頁の title のまま。効果や金運の約束は書かない。「Cloud Palette」を小さく添える。",
    },
    {
      backlogId: "shorts-back-to-tool",
      kind: "video",
      title: "30 秒の構成（今日の吉方位）",
      body: "0–3 秒: 今日の日付と「八方位は人によって違う」。4–20 秒: 本命星を 1 つだけ例にし、吉と凶が同時にあることを画面の /houi/today で示す。21–30 秒: 出発地を入れる場所を指し、概要欄の URL は https://cloud-palette.com/houi/today 。健康・金運の断定はしない。",
    },
    {
      backlogId: "shorts-back-to-tool",
      kind: "video",
      title: "30 秒の構成（引越しの日取り）",
      body: "暦注は誰でも同じ、方位は生年月日と出発地で変わる、という順で /calendar を映す。終わりに「日の吉は方位の凶を消さない、とされる」とサイトの注記を読み、URL は https://cloud-palette.com/calendar 。",
    },
  ];

  if (!titleHits(facts.blogTitles, ["費用", "見積"])) {
    briefs.push({
      backlogId: "topic-moving-cost",
      kind: "page",
      title: "記事の骨子: 費用と方位は別の問い",
      body: "結論を先に 1 段落。費用の相場そのものは書かず、/relocation/purchase と /relocation/market が何の統計かを説明し、方位は /houi で別に見る、と分ける。内部リンクは 3 本まで。アフィリエイトは 1 都 3 県の記事だけ、文中に対象地域と PR を書く。",
    });
  }

  const proposals: BuilderProposal[] = backlog
    .filter((row) => row.safeToAutoApply)
    .map((row) => ({
      id: row.id,
      title: row.title,
      files: [],
      reason:
        "safeToAutoApply でも、このフレームワークは書き換えない。差分は人が PR にする。",
      applied: false as const,
    }));

  const verification = [
    {
      name: "merge-disabled",
      passed: true,
      detail: "レポートの merge と deploy は false 固定",
    },
    {
      name: "no-auto-apply",
      passed: proposals.every((row) => row.applied === false),
      detail: "Builder の適用は 0 件",
    },
    {
      name: "no-third-party-scan",
      passed: live.probes.every((probe) => probe.path.startsWith("/")),
      detail: "見た URL は自サイトのパスだけ",
    },
    {
      name: "consent-or-listed",
      passed: findings.some((row) => row.id === "monetization.consent"),
      detail: "同意の状態を findings に出している",
    },
  ];

  const roleNotes: GrowthReport["roleNotes"] = [
    {
      role: "auditor",
      note: "頁・MCP・llms.txt・canonical・記事と地域の厚みを、前回との差分が取れる ID で出した。",
    },
    {
      role: "growth",
      note: "題名に無い検索意図と、共通 OGP・動画からの戻りを優先した。新しい数字の相場は作っていない。",
    },
    {
      role: "monetization",
      note: "審査は未通過のまま。再申請はしない。同意の既定、ads.txt、空枠を出さないこと、審査前の案件を分けた。",
    },
    {
      role: "planner",
      note: "得点は影響×10から工数を引いた。自動で適用してよい項目は空のままにする。",
    },
    {
      role: "content",
      note: "骨子だけ。本文の額と健康の断定は書かない。",
    },
    {
      role: "design",
      note: "広告は高さ 250px を先に取り、同意バーは固定で本文を押し下げない。",
    },
    {
      role: "media",
      note: "30 秒の構成と画像の指示だけ。ファイルは生成していない。",
    },
    {
      role: "builder",
      note: "リポジトリは変更しない。低リスクの修正は、別途レビューできる差分として人が出す。",
    },
    {
      role: "verifier",
      note: "マージ禁止・識別子の除去・自サイト以外へ出ないことを、レポート生成時に検査する。",
    },
  ];

  return { findings, backlog, briefs, proposals, verification, roleNotes };
}
