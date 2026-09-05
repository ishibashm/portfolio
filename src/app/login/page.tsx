"use client";

import { useState, useEffect, useRef } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/client";
import Link from "next/link";
import {
  createLoginNonce,
  googleClientId,
  loadGoogleIdentity,
  safeNextPath,
} from "@/lib/googleIdentity";
import { isProfileReady } from "@/lib/profileCompletion";
import { loadSettings } from "@/lib/userSettings";

/**
 * Google Identity Services のボタン。ID トークンを cloud-palette.com の
 * 中で受け取り、Supabase には `signInWithIdToken` で渡す。
 *
 * 従来の `signInWithOAuth` は Google に「Supabase のコールバックへ戻して」
 * と頼むため、Google のアカウント選択画面に supabase.co のドメインが
 * 「〜に移動」として出ていた（利用者の報告）。Google Cloud 側でアプリ名を
 * 変えても、そこに出るのは戻り先のドメインなので変わらない。こちらは
 * Google が見る相手が cloud-palette.com になる。
 *
 * NEXT_PUBLIC_GOOGLE_CLIENT_ID が無いときはこの部品を出さず、従来の
 * ボタンに留まる（本番で変数を入れるまで壊さない）。
 */
function GoogleIdentityButton({
  clientId,
  onCredential,
  onError,
}: {
  clientId: string;
  onCredential: (credential: string, rawNonce: string) => void;
  onError: (message: string) => void;
}) {
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [google, nonce] = await Promise.all([
          loadGoogleIdentity(),
          createLoginNonce(),
        ]);
        if (cancelled || !holder.current) return;
        google.initialize({
          client_id: clientId,
          callback: (res) => onCredential(res.credential, nonce.raw),
          nonce: nonce.hashed,
          auto_select: false,
          ux_mode: "popup",
        });
        /* 器の幅に合わせる。GIS の上限は 400px。 */
        const width = Math.min(400, Math.max(200, holder.current.clientWidth));
        holder.current.replaceChildren();
        google.renderButton(holder.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "signin_with",
          shape: "pill",
          logo_alignment: "center",
          width,
          locale: "ja",
        });
      } catch (e) {
        if (!cancelled) onError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
    /* onCredential / onError はレンダーごとに作り直されるが、GIS の
       initialize を張り直す理由にはならない。nonce も 1 回の表示で 1 つ。 */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  return (
    <div
      ref={holder}
      className="w-full min-h-[44px] flex justify-center"
      aria-label="Google でログイン"
    />
  );
}

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [nextUrl, setNextUrl] = useState("/");
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const clientId = googleClientId();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUser(user);
    });

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const err = params.get("error");
      if (err) {
        setAuthError(decodeURIComponent(err));
      }
      const next = params.get("next");
      if (next) {
        setNextUrl(safeNextPath(next));
      }
    }
  }, []);

  /**
   * ログインしたあとの行き先。
   *
   * 戻り先が明示されている（保護されたページから飛ばされてきた）なら
   * そこへ戻す。そうでない＝自分からログインしに来た場合は、**登録が
   * 済んでいるかで分ける。**初めての人をホームに落とすと、何を入れれば
   * 道具が動くのか分からないまま放り出される（よくある新規登録なら、
   * ここで入力へ案内する）。
   *
   * 済んでいるかはログイン後の `loadSettings()` で見る。クラウドの値も
   * 読むので、別の端末で登録済みの人はホームへ行く。読めないとき
   * （通信の失敗）はホーム。入力を強いるより、いつもの画面を出す。
   */
  const destinationAfterLogin = async (explicitNext: string) => {
    if (explicitNext !== "/") return explicitNext;
    try {
      const { settings } = await loadSettings();
      return isProfileReady(settings) ? "/" : "/profile?welcome=1";
    } catch {
      return "/";
    }
  };

  /**
   * GIS から受け取った ID トークンで Supabase のセッションを作る。
   * ブラウザ側クライアント（@supabase/ssr）は cookie に保存するので、
   * 遷移先のサーバー側でもそのままログイン済みとして見える。
   */
  const handleGoogleCredential = async (
    credential: string,
    rawNonce: string,
  ) => {
    setLoading(true);
    setAuthError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithIdToken({
      provider: "google",
      token: credential,
      nonce: rawNonce,
    });
    if (error) {
      console.error("Error logging in:", error);
      setAuthError(error.message);
      setLoading(false);
      return;
    }
    window.location.assign(await destinationAfterLogin(nextUrl));
  };

  const handleGoogleLogin = async () => {
    /*
      `loading` はボタンの `disabled` に繋がっているのに、**立てる側が
      無かった。**押しても無効にならず、Google の同意画面へ飛ぶまでの
      間に何度でも押せる。受け口だけあって配線が無い状態だったので繋ぐ。

      成功したときは戻さない。この後 OAuth の画面へ遷移するので、
      戻すと一瞬だけ押せる状態に戻ってしまう。
    */
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(
          await destinationAfterLogin(nextUrl),
        )}`,
      },
    });

    if (error) {
      console.error("Error logging in:", error);
      setAuthError(error.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-rose-50/80 via-stone-50 to-amber-50/50 text-stone-800 px-4 font-sans">
      <div className="w-full max-w-md bg-white/80 border border-rose-100/80 rounded-3xl p-8 flex flex-col items-center shadow-xl shadow-rose-100/40 backdrop-blur-xl relative overflow-hidden">
        {/* Top subtle ambient glow */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-rose-200/40 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-amber-200/40 rounded-full blur-3xl"></div>

        <h1 className="text-2xl font-bold mb-1 tracking-wider text-stone-900 font-serif">
          Cloud Palette
        </h1>
        {/* ログインは任意。中核ページは未ログインでも全て使えるので、
            ここで案内するのは「何が増えるか」だけにする。 */}
        <p className="text-stone-500 text-xs text-center mb-6 leading-relaxed">
          ログインすると、生年月日や出発地の設定を
          <br />
          他の端末でも引き継げます。
        </p>
        <p className="text-stone-600 text-[10px] text-center mb-6 leading-relaxed">
          ログインしなくても、方位の判定・物件検索・カレンダーはそのままご利用いただけます。
        </p>

        {/* Logged in User Status */}
        {currentUser && (
          <div className="w-full bg-stone-50 border border-stone-200/80 rounded-xl p-4 mb-6 text-xs text-stone-500 space-y-2">
            <div>現在ログイン中のアカウント:</div>
            <div className="font-semibold text-stone-800 break-all">
              {currentUser.email}
            </div>
            {/* 「権限がありません」と出していたが、一般の利用者にとっては
                ログインは成功しており、設定の同期も使える。管理画面に
                入れないだけなので、失敗のように見せない。 */}
            <div className="font-bold text-emerald-600">
              ログイン済みです。設定は端末をまたいで同期されます。
            </div>
            <button
              type="button"
              onClick={async () => {
                const supabase = createClient();
                await supabase.auth.signOut();
                setCurrentUser(null);
                setAuthError(null);
                window.location.reload();
              }}
              className="mt-2 text-rose-500 hover:text-rose-600 underline font-medium cursor-pointer"
            >
              ログアウトして別のアカウントでログイン
            </button>
          </div>
        )}

        {/* OAuth Provider。クライアント ID があるときは GIS のボタン
            （Google の画面に cloud-palette.com が出る）。無いときは従来の
            Supabase 経由。 */}
        {clientId ? (
          loading ? (
            <div className="w-full min-h-[44px] flex items-center justify-center text-xs text-stone-500">
              ログイン中…
            </div>
          ) : (
            <GoogleIdentityButton
              clientId={clientId}
              onCredential={handleGoogleCredential}
              onError={setAuthError}
            />
          )
        ) : (
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-white text-stone-800 border border-stone-200 px-6 py-2.5 rounded-xl font-medium hover:bg-stone-50 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none shadow-md"
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 15.02 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Googleでログイン
          </button>
        )}

        {/* よくある新規登録と同じく、押す前に規約の在り処を示す。
            チェックボックスは置かない（Google のボタンは押した時点で
            認証が始まるので、押させない状態を作るとボタンが死ぬ）。 */}
        <p className="mt-4 text-center text-[10px] leading-relaxed text-stone-500">
          ログインすると、
          <Link
            href="/terms"
            className="underline hover:text-stone-700"
            target="_blank"
            rel="noopener noreferrer"
          >
            利用規約
          </Link>
          と
          <Link
            href="/privacy"
            className="underline hover:text-stone-700"
            target="_blank"
            rel="noopener noreferrer"
          >
            プライバシーポリシー
          </Link>
          に同意したものとみなします。
          <br />
          保存するのは、方位の判定に使う値（生年月日・場所）とメールアドレスだけです。
        </p>

        {authError && (
          <div className="w-full mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-[11px] leading-relaxed">
            ⚠️ {authError}
          </div>
        )}

        {/* Dev Bypass Section. The cookie is only honoured by the Supabase
            helpers when NODE_ENV is development, so the button has to be gated
            on the same condition or it just renders a dead control in
            production that also discloses the admin address. */}
        {process.env.NODE_ENV === "development" && (
          <div className="w-full mt-4 pt-4 border-t border-rose-100/80 flex flex-col items-center">
            {/* 既定値に実在のアドレスを置かない。
                本番のバンドルからは NODE_ENV のガードごと消えるが、
                公開リポジトリのソースには平文で残る（収集の的になる）。
                ローカルで使うときは .env.local に
                NEXT_PUBLIC_ADMIN_EMAIL を入れる。 */}
            <button
              type="button"
              disabled={!process.env.NEXT_PUBLIC_ADMIN_EMAIL}
              onClick={() => {
                const devUser = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
                if (!devUser) return;
                document.cookie = `dev_bypass_user=${encodeURIComponent(
                  devUser,
                )}; path=/; max-age=31536000`;
                window.location.href = nextUrl;
              }}
              className="w-full bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 font-mono text-[10px] uppercase tracking-wider py-2.5 rounded-xl active:scale-[0.98] transition-all disabled:opacity-40"
            >
              ⚡ 開発用バイパスでログイン
            </button>
            {!process.env.NEXT_PUBLIC_ADMIN_EMAIL && (
              <p className="mt-2 text-[9px] text-stone-600 text-center leading-relaxed">
                .env.local に NEXT_PUBLIC_ADMIN_EMAIL を設定すると使えます。
              </p>
            )}
          </div>
        )}

        <p className="text-[10px] text-stone-600 text-center mt-6 font-mono leading-relaxed max-w-[280px]">
          {process.env.NODE_ENV === "development"
            ? "ローカル開発環境で動作しています。"
            : ""}
        </p>
      </div>
    </div>
  );
}
