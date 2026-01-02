import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(request: NextRequest) {
  // セッションを取得 (secretは環境変数から)
  const token = await getToken({ 
    req: request, 
    secret: process.env.NEXTAUTH_SECRET 
  });

  // ログインしていない場合、ログイン画面へリダイレクト
  if (!token) {
    const url = request.nextUrl.clone();
    url.pathname = '/api/auth/signin';
    // ログイン後の戻り先を指定
    url.searchParams.set('callbackUrl', request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  // 認証OKならそのまま通す
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
