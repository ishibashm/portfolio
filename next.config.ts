import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standaloneモードを削除（過去のエラー: MODULE_NOT_FOUNDを回避するため）
  // 代わりに、通常のビルド + サーバー側でnpm installを実行する方法を使用
  /* config options here */
};

export default nextConfig;
