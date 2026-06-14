This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Local LLM Setup (Ollama)

This project uses Ollama as the primary LLM provider instead of cloud APIs like Gemini, ensuring privacy and local execution as specified in the Omni-Terminal architecture.

1. Install [Ollama](https://ollama.ai) and run it locally.
2. Pull your desired model, for example: `ollama run coder` or `ollama run llama3`.
3. Ensure Ollama is running on the default port (`http://localhost:11434`).
4. (Optional) Set the `OLLAMA_MODEL` environment variable in your `.env` file to change the default model (defaults to "coder").

```env
OLLAMA_MODEL=coder
```

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Cloud Run へのデプロイと既存アプリ (`cloud-palette.com`) との統合

この Knowledge Base は単体の Cloud Run サービスとしてデプロイし、既存のポートフォリオアプリのサブパス（例: `/knowledge-base`）として「リバースプロキシ」で合体させることが推奨されています。

### 1. デプロイ後の確認

GitHub Actions (`.github/workflows/deploy.yml`) によって自動デプロイが成功すると、GCP コンソール（または Actions のログ）に新しい Cloud Run サービスの URL が発行されます。
例: `https://knowledge-base-app-xxxxx-uc.a.run.app`

### 2. 既存アプリへのリバースプロキシ (Rewrites) の設定

既存のアプリケーション（例: `cloud-palette.com` をホストしているメインリポジトリ）の `next.config.js` （または `.ts`, `.mjs`）を開き、以下のように `rewrites` の設定を追加してください。

```javascript
// portfolio/my-portfolio/next.config.js の設定例
module.exports = {
  // その他の設定...
  async rewrites() {
    return [
      {
        // ユーザーがアクセスするURL (cloud-palette.com/knowledge-base)
        source: "/knowledge-base",
        // 先ほど発行された Cloud Run の新しいURLに書き換える
        destination: "https://[発行されたCloud RunのURL]/knowledge-base",
      },
      {
        // 配下のパス (/knowledge-base/123 など) もすべて転送する
        source: "/knowledge-base/:path*",
        destination: "https://[発行されたCloud RunのURL]/knowledge-base/:path*",
      },
    ];
  },
};
```

### 3. メインアプリをデプロイする

`rewrites` 設定を追加したメインアプリをデプロイすれば統合は完了です。
ユーザーが `https://cloud-palette.com/knowledge-base` にアクセスすると、URLはそのままで裏側ではこの Knowledge Base アプリが動作するようになります！

---
