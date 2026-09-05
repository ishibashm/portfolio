/**
 * Google Identity Services（GIS）でログインするための最小限の道具。
 *
 * なぜ Supabase の `signInWithOAuth` から切り替えるか。
 *
 *   `signInWithOAuth` は Google へ「Supabase のコールバック
 *   （https://<project>.supabase.co/auth/v1/callback）へ戻してください」と
 *   頼む。Google のアカウント選択画面は**戻り先のドメイン**を
 *   「〜に移動」として出すので、利用者には supabase.co の乱数のような
 *   ドメインが見える。Google Cloud 側でアプリ名を変えても、ここには
 *   出ない（アプリ名は Google のブランド確認を通した後に出る）。
 *
 *   GIS は cloud-palette.com のページの中で ID トークンを受け取り、
 *   それを `signInWithIdToken` で Supabase に渡す。Google が見る相手は
 *   cloud-palette.com なので、画面にはこちらのドメインが出る。
 *
 * ここには GIS のうち**実際に呼ぶものだけ**を型にしてある。ライブラリ
 * 全体の型を写さない（CLAUDE.md 4 節）。
 */

export const GOOGLE_IDENTITY_SCRIPT_SRC =
  "https://accounts.google.com/gsi/client";

/**
 * Google Cloud の OAuth クライアント ID。ページのソースに出る公開情報
 * なので `NEXT_PUBLIC_`。未設定なら null を返し、ログイン画面は従来の
 * `signInWithOAuth`（Supabase 経由）に留まる。
 */
export function googleClientId(): string | null {
  const id = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim();
  return id ? id : null;
}

/** GIS が callback に渡すもののうち、読むのは ID トークンだけ。 */
export interface GoogleCredentialResponse {
  credential: string;
}

export interface GoogleIdConfiguration {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void;
  /** ID トークンの nonce クレームに入る値。生の nonce の SHA-256（hex）を渡す。 */
  nonce?: string;
  /** 前回選んだアカウントで黙ってログインしない。毎回選ばせる。 */
  auto_select?: boolean;
  /** 同意画面の代わりに戻る先。省略時は callback。 */
  ux_mode?: "popup" | "redirect";
}

export interface GoogleButtonConfiguration {
  type?: "standard" | "icon";
  theme?: "outline" | "filled_blue" | "filled_black";
  size?: "large" | "medium" | "small";
  text?: "signin_with" | "signup_with" | "continue_with" | "signin";
  shape?: "rectangular" | "pill" | "circle" | "square";
  logo_alignment?: "left" | "center";
  /** px。GIS の上限は 400。 */
  width?: number;
  locale?: string;
}

export interface GoogleAccountsId {
  initialize(config: GoogleIdConfiguration): void;
  renderButton(parent: HTMLElement, options: GoogleButtonConfiguration): void;
}

interface GoogleGlobal {
  accounts?: { id?: GoogleAccountsId };
}

function readGoogleGlobal(): GoogleAccountsId | null {
  const g = (window as Window & { google?: GoogleGlobal }).google;
  return g?.accounts?.id ?? null;
}

let loading: Promise<GoogleAccountsId> | null = null;

/**
 * GIS のスクリプトを 1 回だけ読み込み、`google.accounts.id` を返す。
 * 2 回目以降は同じ Promise を返す（ログイン画面を行き来しても
 * script タグを増やさない）。読み込みに失敗したら reject する。
 */
export function loadGoogleIdentity(): Promise<GoogleAccountsId> {
  const already = readGoogleGlobal();
  if (already) return Promise.resolve(already);
  if (loading) return loading;

  loading = new Promise<GoogleAccountsId>((resolve, reject) => {
    const fail = (why: string) => {
      loading = null;
      reject(new Error(why));
    };
    const settle = () => {
      const id = readGoogleGlobal();
      if (id) resolve(id);
      else
        fail(
          "Google Identity Services の読み込み後に google.accounts.id が無い",
        );
    };

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GOOGLE_IDENTITY_SCRIPT_SRC}"]`,
    );
    if (existing) {
      existing.addEventListener("load", settle, { once: true });
      existing.addEventListener(
        "error",
        () => fail("Google Identity Services の読み込みに失敗"),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.src = GOOGLE_IDENTITY_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = settle;
    script.onerror = () => fail("Google Identity Services の読み込みに失敗");
    document.head.appendChild(script);
  });
  return loading;
}

/**
 * ログインの nonce。生の値を Supabase に、SHA-256（hex）を Google に渡す。
 * Supabase は受け取った ID トークンの nonce クレームが「生の値の SHA-256」
 * に一致するかを見る。逆に渡すと `signInWithIdToken` が nonce 不一致で
 * 落ちる。
 */
export interface LoginNonce {
  raw: string;
  hashed: string;
}

export async function createLoginNonce(): Promise<LoginNonce> {
  const raw = crypto.randomUUID();
  return { raw, hashed: await sha256Hex(raw) };
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * ログイン後に戻る先。`?next=` はそのまま `window.location` に渡すので、
 * 同じサイト内のパスだけを通す。`//evil.example` や `https://…` は
 * ブラウザが別サイトとして解釈するため `/` に倒す。
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next) return "/";
  if (!next.startsWith("/")) return "/";
  if (next.startsWith("//")) return "/";
  if (/^\/[\\]/.test(next)) return "/";
  return next;
}
