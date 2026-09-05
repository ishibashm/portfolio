"use client";

import React, { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
// Supabase クライアントは静的に import しない。サイドバーは全ページに出るため、
// ここで import すると認証ライブラリが共有バンドルに入り、ログインと無関係な
// 記事ページ（/houi 配下の 470 ページ以上）でも gzip で 60KB 前後を配ることになる。
// 実測でも共有チャンクの 5536 と 44530001 が丸ごとこれだった。
// 用途はログイン状態の表示とログアウトだけなので、必要になった時点で読み込む。
const loadSupabase = () =>
  import("@/utils/supabase/client").then((m) => m.createClient());

/** ログイン済みの手がかり。開発時は疑似ログイン（client.ts）があるので常に真。 */
const hasAuthCookie = () =>
  process.env.NODE_ENV === "development" ||
  /(?:^|;\s*)sb-[^=;]*-auth-token(?:\.\d+)?=/.test(document.cookie);

/*
  cookie の変化を知らせる仕組みは無い。ログイン/ログアウトはどちらも
  /login への遷移を伴い layout ごと描き直るので、購読は要らない。
  useSyncExternalStore の形に合わせるための空の口。
*/
const subscribeAuthCookie = () => () => {};
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import {
  Clock,
  Map,
  Compass,
  Menu,
  X,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  TrendingUp,
  LogOut,
  LogIn,
  Route,
  Calendar,
  CalendarRange,
  BarChart3,
  BookOpen,
  Newspaper,
  Rss,
  MapPin,
  UserRound,
  Home,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { activeNavHref, CORE_ROUTES, ROUTE_GROUPS } from "@/lib/siteStructure";
import {
  MENU_SERVER_SNAPSHOT,
  closeMenu,
  menuIsOpen,
  subscribeMenu,
} from "@/lib/menuOpenState";

// 使い方ガイドは引越しを決める道具そのものではないので、
// 「引越しを決める」の並びには入れず、ホームと同じ上段に置く。
const PUBLIC_ITEMS = [
  { href: "/", icon: Clock, label: "ホーム" },
  /*
    生年月日と場所の登録。**道具より先に来る。**どの道具も出発地と
    生年月日が入っていないと何も出ないのに、入れる場所がホームの
    設定バーの中だけで、ナビからは辿れなかった（利用者の指摘、
    2026-09-04）。風水（/houi/fengshui）で踏んだのと同じ失敗なので、
    作った頁にナビの行を与える。
  */
  { href: "/profile", icon: UserRound, label: "生年月日と場所を登録" },
  { href: "/guide", icon: BookOpen, label: "使い方ガイド" },
  { href: "/blog", icon: Newspaper, label: "引越しの読みもの" },
  { href: "/news", icon: Rss, label: "不動産・建築の情報" },
];

// ナビは src/lib/siteStructure.ts の中核ルートに合わせる。
// 以前は英語の機能名（Oracle Hub / Tech & Trends など）が並び、
// 引越しと関係ないものが同列に混ざっていて、何のサイトか読み取れなかった。
// 表示順・表示名は「引越しを決めるまでの順序」にしてある。
const CORE_ICONS: Record<string, LucideIcon> = {
  "/relocation/arbitrage": TrendingUp,
  "/relocation/timing": CalendarRange,
  "/relocation/market": BarChart3,
  "/relocation/simulator": Route,
  "/relocation/wealth": Map,
  "/houi": Compass,
  "/houi/fengshui": Home,
  "/houi/area": MapPin,
  "/calendar": Calendar,
};

interface NavItem {
  href: string;
  icon: LucideIcon;
  label: string;
}

/*
  10 本をフラットに並べると、似た名前（「引越し時期を分析する」と
  「引越しの日取りを選ぶ」など）の区別が付かない。意思決定の 3 つの
  問い（どこへ・いつ・いくら）で群にする。群は siteStructure が唯一の
  定義元で、ホームの札も同じ群で並ぶ。
*/
const GROUPED_ITEMS: { heading: string; items: NavItem[] }[] = ROUTE_GROUPS.map(
  (g) => ({
    heading: g.label,
    items: CORE_ROUTES.filter((r) => r.group === g.key).map((r) => ({
      href: r.href,
      icon: CORE_ICONS[r.href] ?? Compass,
      label: r.label,
    })),
  }),
);

export function GlobalSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  /*
    開いているかは `<html data-menu>` が持つ。React の state にすると、
    hydration が終わるまでボタンが効かない（実測で 4.6〜8.7 秒、押しても
    何も起きなかった）。切り替えは layout.tsx の素のスクリプトがやり、
    ここは読むだけ。詳しくは lib/menuOpenState。
  */
  const isOpen = useSyncExternalStore(
    subscribeMenu,
    menuIsOpen,
    () => MENU_SERVER_SNAPSHOT,
  );
  const [isCollapsed, setIsCollapsed] = useState(false); // For desktop

  // ログイン状態は表示しないと分からない。トップページ("/")は保護対象外なので、
  // 未ログインでもサイドバーは全項目を出せてしまい、ログイン済みに見えてしまう。
  // undefined = 確認中（この間はログイン/ログアウトのどちらも出さない）
  const [email, setEmail] = useState<string | null | undefined>(undefined);

  /*
    **ログインの入口が出ない不具合があった**（2026-09-05、利用者の報告
    「ログインどこからするか、消えちゃった？」）。

    下の効果は速度のために「認証 cookie が無ければ supabase を読まない」
    という早期 return を持つ。そのとき email は undefined のままで、
    描画側はそれを**確認中**と読んでログインもログアウトも出さない。
    つまり**一度もログインしていない端末では、入口が永久に出なかった。**

    cookie が無いのは「確認できない」ではなく**「未ログインだと確認
    できた」**。なので email を待たずに、ここで先に決める。

    効果の中で setEmail(null) を呼ぶ手もあるが、それは
    react-hooks/set-state-in-effect を 1 件増やす（CLAUDE.md 4 節：
    新しく書くコードで増やさない）。cookie は購読するものが無いので、
    サーバーでは false、クライアントでは実物を読む形にする。
  */
  const maybeLoggedIn = useSyncExternalStore(
    subscribeAuthCookie,
    hasAuthCookie,
    () => false,
  );

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    /*
      ログインしていない端末では supabase を読まない。@supabase/ssr の
      ブラウザ側はセッションを `sb-<ref>-auth-token` の cookie に持つ
      （分割されると `.0` `.1` が付く）。それが無ければ getUser() は
      必ず null で、gzip 60 KB を読む意味が無い。ログインすると
      /login から戻ってきて layout ごと描き直るので、ここも走り直す。
    */
    if (!hasAuthCookie()) return;

    loadSupabase().then((supabase) => {
      // 読み込みが終わる前にアンマウントされていたら購読しない。
      if (!active) return;

      supabase.auth.getUser().then(({ data }) => {
        if (active) setEmail(data.user?.email ?? null);
      });

      const { data: sub } = supabase.auth.onAuthStateChange(
        (event, session) => {
          // INITIAL_SESSION は購読直後に必ず発火する初期通知で、上の getUser() と
          // 内容が重複する。こちらを採用すると getUser() の結果を打ち消してしまう。
          if (event === "INITIAL_SESSION") return;
          setEmail(session?.user?.email ?? null);
        },
      );
      unsubscribe = () => sub.subscription.unsubscribe();
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  const closeSidebar = closeMenu;
  const toggleCollapse = () => setIsCollapsed(!isCollapsed);

  /*
    「畳み」はデスクトップ（lg 以上）だけの概念。ラベルの表示を
    `{!isCollapsed && …}` の JS 分岐で消すと、**広い画面で畳んだまま
    狭い画面の開閉メニューを開いたとき**に、幅は全開（w-64）なのに
    文字が出ずアイコンだけになる（実際に起きていた。畳みの state は
    画面幅を見ていない）。表示の有無は CSS のレスポンシブで決める:
    狭い画面では常に出し、lg 以上でだけ畳みが効く。
  */
  const hideWhenCollapsed = isCollapsed ? "lg:hidden" : "";
  const centerWhenCollapsed = isCollapsed ? "lg:justify-center" : "";

  const handleLogout = async () => {
    const supabase = await loadSupabase();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const sidebarWidth = isCollapsed ? "lg:w-20" : "lg:w-64";

  /*
    点灯させる 1 つを、ナビ全体の中から先に決める。

    **以前は項目ごとに前方一致で見ていて、2 つ点いていた**（利用者の
    報告：タブが 2 つ選ばれてるのはバグ？）。/houi/fengshui は /houi で
    始まるので、「本命星と吉方位を調べる」と「風水（八宅）で吉方位を
    調べる」が両方赤くなる。/houi/area/13101 でも同じことが起きていた。

    項目を 1 つずつ見ている限り「自分より長く一致する項目が他にあるか」は
    分からないので、判定はナビ全体を見る側へ寄せる（siteStructure の
    activeNavHref）。
  */
  const activeHref = activeNavHref(pathname, [
    ...PUBLIC_ITEMS.map((i) => i.href),
    ...GROUPED_ITEMS.flatMap((g) => g.items.map((i) => i.href)),
  ]);

  // ここが扱うのはサイト内のリンクだけ。外部リンクは中核ナビから外し、
  // 下部で個別に描いている。
  const renderNavItem = (item: NavItem) => {
    const isActive = item.href === activeHref;
    const Icon = item.icon;

    return (
      <Link
        key={item.href}
        href={item.href}
        /* 画面内の経路を先読みしない。既定だと開いた直後に道具 15 頁ぶんの
           JS（暦エンジン・グラフを含めて gzip 500 KB 前後）を裏で取りに
           行き、遅い回線ではいま見ている頁の地図と判定の帯域を奪う
           （backlog 17 節に実測）。移動は押した時に読む。 */
        prefetch={false}
        onClick={closeSidebar}
        title={isCollapsed ? item.label : undefined}
        className={`
          flex items-center justify-between px-3.5 py-2.5 rounded-2xl transition-all group font-medium text-xs
          ${
            isActive
              ? "bg-rose-500 text-white shadow-md shadow-rose-200"
              : "text-stone-600 hover:bg-rose-50 hover:text-stone-900"
          }
          ${centerWhenCollapsed}
        `}
      >
        <div className="flex items-center gap-3">
          <Icon
            size={18}
            className={`shrink-0 ${isActive ? "text-white" : "text-stone-600 group-hover:text-rose-500 transition-colors"}`}
          />
          <span className={`whitespace-nowrap ${hideWhenCollapsed}`}>
            {item.label}
          </span>
        </div>
        {isActive && (
          <ChevronRight
            size={16}
            className={`text-white/70 shrink-0 ${hideWhenCollapsed}`}
          />
        )}
      </Link>
    );
  };

  return (
    <>
      {/* Mobile Toggle Button */}
      {/*
        重なり順（この 3 つは 45 / 46 / 47 で 1 組）。
        頁の中の帯（arbitrage の「地図 / 一覧・条件」、ホームのタブ）が
        sticky z-40 で、メニューも z-40 だった。同じ数なら後に書いたほうが
        前に出るので、頁のほうが勝ってメニューが帯の下に隠れていた
        （Android の実機報告）。帯より上、モーダル（z-50）より下に置く。
        モーダルより下なのは意図で、全画面の覆いが出ているあいだは
        メニューの開閉ボタンも隠れるのが正しい。
        地図の中身が z-[1000] で頁全体に出てくる件は、地図の器の側を
        入れ物にして塞いである（ArbitrageMapInner の isolate）。
      */}
      {/*
        中身が図形だけのボタンには名前を付ける。Lighthouse の
        「Buttons do not have an accessible name」がこれ。読み上げでは
        「ボタン」としか読まれず、何をするのか分からない。
        開いているかどうかも aria-expanded で伝える。
      */}
      {/*
        押したときの切り替えは data-menu-toggle を見る素のスクリプト
        （layout.tsx）がやる。ここに onClick を置くと二重に切り替わる。
        名前は開閉で変えない（変えると、hydration の前後で読み上げが
        食い違う）。開いているかは aria-expanded で伝える。
        アイコンも両方描いて CSS で切り替える。React で出し分けると、
        hydration 前に開いたときに三本線のままになる。
      */}
      <button
        type="button"
        data-menu-toggle
        aria-label="メニュー"
        aria-expanded={isOpen}
        aria-controls="global-sidebar"
        className="lg:hidden fixed top-4 left-4 z-[47] p-2.5 bg-white border border-rose-100 rounded-xl text-stone-500 hover:text-rose-500 active:bg-rose-50 active:scale-95 transition-transform shadow-md shadow-rose-100/40"
      >
        <span data-menu-icon="open" className="block">
          <Menu size={24} />
        </span>
        <span data-menu-icon="close" className="block">
          <X size={24} />
        </span>
      </button>

      {/* Mobile Overlay。開いていないときは CSS で消す（React の分岐に
          すると hydration 前に開いても出ない）。 */}
      <div
        data-menu-overlay
        data-menu-close
        aria-hidden="true"
        className="lg:hidden fixed inset-0 bg-stone-900/30 z-[45]"
      />

      {/* Sidebar Container */}
      {/*
        出ている位置は `<html data-menu>` を見た globals.css が決める。
        React の分岐（`isOpen ? …`）にすると hydration まで動かない。

        transition は transform と width だけに絞る。`transition-all` は
        backdrop-filter まで動かす対象にしていて、開くたびに背景を毎フレーム
        ぼかし直していた（実測 30fps。カク付きの実体）。

        ぼかしは外して、地色を不透明にした。`bg-white/95` はぼかしと
        組で成り立っていて、ぼかしだけ外すと**後ろの文字がそのまま
        透けて読めなくなる**（実機の写しで確認した）。5% の透けは
        ぼかしが無いと見た目の得が無いので、不透明にするほうが速くて
        読みやすい。
      */}
      <aside
        id="global-sidebar"
        data-menu-panel
        className={`
          fixed top-0 left-0 h-full z-[46]
          bg-white border-r border-rose-100/80 shadow-2xl shadow-rose-100/40
          w-64 ${sidebarWidth} transition-[transform,width] duration-300 ease-in-out
          flex flex-col overflow-y-auto
          -translate-x-full lg:translate-x-0
        `}
      >
        {/* Logo Area */}
        <div
          className={`h-20 shrink-0 flex items-center border-b border-rose-100/60 transition-all duration-300 px-6 ${isCollapsed ? "lg:justify-center lg:px-0" : ""}`}
        >
          <div className="flex items-center gap-3 text-stone-900">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-rose-500 to-pink-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-rose-200">
              <Compass className="w-5 h-5" />
            </div>
            <span
              className={`font-serif font-bold text-lg tracking-tight text-stone-900 whitespace-nowrap overflow-hidden transition-all ${hideWhenCollapsed}`}
            >
              Cloud Palette
            </span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="shrink-0 py-4 px-3 space-y-1 overflow-x-hidden">
          {PUBLIC_ITEMS.map(renderNavItem)}

          {/* 見出しは "Public Space" / "Secure Engines" だった。中核ページは
              匿名で開けるようにしたので "Secure" は事実と違い、ログインが
              要るように見えてしまう。日本語の見出しに合わせる。 */}
          {GROUPED_ITEMS.map((g) => (
            <div key={g.heading}>
              <div className="my-3 border-t border-rose-100/60" />
              <div
                className={`px-3 mb-1 text-[10px] font-semibold tracking-wider text-stone-600 ${hideWhenCollapsed}`}
              >
                {g.heading}
              </div>
              {g.items.map(renderNavItem)}
            </div>
          ))}
        </nav>

        {/* Footer Area */}
        <div className="mt-auto p-3 border-t border-rose-100/60 bg-white/95 z-10 shrink-0 flex flex-col gap-1.5">
          {/* PWA App Install Widget */}
          <div className={hideWhenCollapsed}>
            <PWAInstallPrompt />
          </div>

          {/* 誰でログインしているのか（していないのか）を必ず出す */}
          {email && (
            <div
              className={`px-2 text-[10px] font-mono text-stone-500 truncate ${hideWhenCollapsed}`}
              title={email}
            >
              {email}
            </div>
          )}

          {/* cookie が無い＝未ログインと分かっているので、確認を待たない。
              cookie があるあいだだけ email の確認中（undefined）を待つ。 */}
          {maybeLoggedIn && email === undefined ? null : email ? (
            <button
              onClick={handleLogout}
              className={`flex items-center justify-start gap-3 text-rose-500 hover:text-rose-600 hover:bg-rose-50 p-2 rounded-xl transition-colors ${centerWhenCollapsed}`}
              title={email}
            >
              <LogOut size={18} />
              <span
                className={`text-sm font-medium whitespace-nowrap ${hideWhenCollapsed}`}
              >
                ログアウト
              </span>
            </button>
          ) : (
            <Link
              href={`/login?next=${encodeURIComponent(pathname || "/")}`}
              prefetch={false}
              onClick={closeSidebar}
              className={`flex items-center justify-start gap-3 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 p-2 rounded-xl transition-colors ${centerWhenCollapsed}`}
              title="ログイン"
            >
              <LogIn size={18} />
              <span
                className={`text-sm font-medium whitespace-nowrap ${hideWhenCollapsed}`}
              >
                ログイン
              </span>
            </Link>
          )}

          {/*
            Collapse Toggle for Desktop

            「メニューを閉じる」と名乗っていたが、**閉じない。**押すと
            アイコンだけの細い列になる（isCollapsed）。同じ名前を上の
            開閉ボタンにも付けたところ、読み上げ上まったく同じ名前の
            ボタンが 2 つ並ぶ形になって取り違えが起きた。
            やることに合わせて「畳む / 広げる」にする。
          */}
          <button
            onClick={toggleCollapse}
            aria-label={isCollapsed ? "メニューを広げる" : "メニューを畳む"}
            aria-expanded={!isCollapsed}
            className={`hidden lg:flex items-center text-stone-600 hover:text-stone-700 p-2 rounded-xl hover:bg-stone-100/80 transition-colors ${isCollapsed ? "justify-center" : "justify-start gap-3"}`}
            title={isCollapsed ? "メニューを広げる" : "メニューを畳む"}
          >
            {isCollapsed ? (
              <PanelLeftOpen size={18} />
            ) : (
              <PanelLeftClose size={18} />
            )}
            {!isCollapsed && (
              <span className="text-sm font-medium whitespace-nowrap">
                メニューを畳む
              </span>
            )}
          </button>

          {/* Status */}
          <div
            className={`px-3 py-3 rounded-xl bg-emerald-50/80 border border-emerald-100 flex items-center gap-3 ${centerWhenCollapsed}`}
            title="システム稼働中"
          >
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span
              className={`text-[10px] text-emerald-700 font-medium tracking-widest uppercase whitespace-nowrap ${hideWhenCollapsed}`}
            >
              システム稼働中
            </span>
          </div>

          {/* Creator Signature */}
          <div
            className={`text-[9px] text-stone-600 font-mono text-center tracking-wider mt-1 select-none ${hideWhenCollapsed}`}
          >
            {/* 署名は略記にする。運営者としての正式な表記は /about の
                「運営」に置いてあり、そちらは短くしない（誰が運営して
                いるかを確かめに来る人が読む欄なので）。 */}
            Engineered by{" "}
            <span className="text-stone-500 font-medium hover:text-rose-500 transition-colors">
              M. Ishi
            </span>
          </div>
        </div>
      </aside>

      {/* Invisible Spacer for Layout (Desktop Only) */}
      <div
        className={`hidden lg:block shrink-0 transition-[width] duration-300 ease-in-out ${isCollapsed ? "w-20" : "w-64"}`}
      />
    </>
  );
}
