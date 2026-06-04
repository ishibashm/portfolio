"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [nextUrl, setNextUrl] = useState("/dashboard");
  const [currentUser, setCurrentUser] = useState<any>(null);

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
        setNextUrl(next);
      }
    }
  }, []);

  const handleGoogleLogin = async () => {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextUrl)}`,
      },
    });

    if (error) {
      console.error("Error logging in:", error);
      setAuthError(error.message);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setAuthError("メールアドレスとパスワードを入力してください。");
      return;
    }

    setLoading(true);
    setAuthError(null);
    setSuccessMessage(null);
    const supabase = createClient();

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setAuthError(error.message);
      } else {
        // Success redirect
        window.location.href = nextUrl;
      }
    } catch (err: any) {
      setAuthError(err.message || "ログイン中にエラーが発生しました。");
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSignUp = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setAuthError("メールアドレスとパスワードを入力してください。");
      return;
    }

    setLoading(true);
    setAuthError(null);
    setSuccessMessage(null);
    const supabase = createClient();

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        setAuthError(error.message);
      } else if (data.user && data.session === null) {
        setSuccessMessage("ユーザー登録を受け付けました。メール認証を完了させるか、そのままログインを試してください。");
      } else {
        setSuccessMessage("登録が完了しました！自動ログインします...");
        setTimeout(() => {
          window.location.href = nextUrl;
        }, 1500);
      }
    } catch (err: any) {
      setAuthError(err.message || "登録中にエラーが発生しました。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white px-4 font-sans">
      <div className="w-full max-w-md bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-8 flex flex-col items-center shadow-2xl backdrop-blur-md relative overflow-hidden">
        {/* Top subtle ambient glow */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl"></div>

        <h1 className="text-2xl font-bold mb-1 tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-zinc-100 via-zinc-200 to-zinc-400">
          不動産アービトラージ・ポータル
        </h1>
        <p className="text-zinc-500 text-xs text-center mb-8 font-mono">
          REAL ESTATE ARBITRAGE & WEALTH PORTAL
        </p>

        {/* Logged in User Status */}
        {currentUser && (
          <div className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 mb-6 text-xs text-zinc-400 space-y-2">
            <div>現在ログイン中のアカウント:</div>
            <div className="font-semibold text-zinc-200 break-all">{currentUser.email}</div>
            <div className={`font-bold ${currentUser.email?.toLowerCase() === "ishibashm@gmail.com" ? "text-emerald-400" : "text-rose-400"}`}>
              {currentUser.email?.toLowerCase() === "ishibashm@gmail.com" ? "管理者として認証されています" : "このアカウントはアクセス権限（管理権限）がありません"}
            </div>
            <button
              type="button"
              onClick={async () => {
                const supabase = createClient();
                await supabase.auth.signOut();
                setCurrentUser(null);
                setAuthError(null);
                setSuccessMessage(null);
                window.location.reload();
              }}
              className="mt-2 text-indigo-400 hover:text-indigo-300 underline font-medium cursor-pointer"
            >
              ログアウトして別のアカウントでログイン
            </button>
          </div>
        )}

        {/* OAuth Provider */}
        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 bg-white text-black px-6 py-2.5 rounded-lg font-medium hover:bg-zinc-200 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none shadow-md"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 15.02 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Googleでログイン
        </button>

        {/* Divider */}
        <div className="w-full flex items-center gap-3 my-6">
          <div className="h-[1px] flex-1 bg-zinc-800"></div>
          <span className="text-[10px] text-zinc-500 font-mono">OR</span>
          <div className="h-[1px] flex-1 bg-zinc-800"></div>
        </div>

        {/* Credentials Form */}
        <form onSubmit={handleEmailLogin} className="w-full space-y-4 font-mono text-xs">
          <div>
            <label className="block text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5">メールアドレス (Email)</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              placeholder="email@example.com"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
            />
          </div>

          <div>
            <label className="block text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5">パスワード (Password)</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              placeholder="••••••••"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
            />
          </div>

          {authError && (
            <div className="p-3 bg-red-950/20 border border-red-900/40 rounded-lg text-red-400 text-[11px] leading-relaxed">
              ⚠️ {authError}
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-emerald-950/20 border border-emerald-900/40 rounded-lg text-emerald-400 text-[11px] leading-relaxed">
              ✅ {successMessage}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 rounded-lg active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none shadow-[0_0_15px_rgba(79,70,229,0.2)]"
            >
              {loading ? "送信中..." : "ログイン"}
            </button>
            <button
              type="button"
              onClick={handleEmailSignUp}
              disabled={loading}
              className="flex-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-750 text-zinc-300 font-semibold py-2.5 rounded-lg active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none"
            >
              新規登録
            </button>
          </div>
        </form>

        {/* Dev Bypass Section */}
        <div className="w-full mt-4 pt-4 border-t border-zinc-800/60 flex flex-col items-center">
          <button
            type="button"
            onClick={() => {
              document.cookie = "dev_bypass_user=ishibashm@gmail.com; path=/; max-age=31536000";
              window.location.href = nextUrl;
            }}
            className="w-full bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-400 font-mono text-[10px] uppercase tracking-wider py-2.5 rounded-lg active:scale-[0.98] transition-all"
          >
            ⚡ 開発用バイパスでログイン (ishibashm@gmail.com)
          </button>
        </div>

        <p className="text-[10px] text-zinc-600 text-center mt-6 font-mono leading-relaxed max-w-[280px]">
          ローカル開発環境で動作しています。管理者アドレス ({process.env.NEXT_PUBLIC_ADMIN_EMAIL || "ishibashm@gmail.com"}) などで登録し利用してください。
        </p>
      </div>
    </div>
  );
}
