export const portfolios = [
  {
    id: "1",
    title: "Project Alpha",
    description: "Next.jsで構築された最先端のWebアプリケーション。",
    slug: "project-alpha",
    image: "/images/project-alpha.png",
    content: `
          <h2>プロジェクト概要</h2>
      <p>Project Alphaは、Next.jsとReactサーバーコンポーネントの威力を実証するために設計された包括的なWebアプリケーションです。シームレスなユーザー体験、高性能、モダンなデザインを特徴としています。</p>
      
      <h3>主な特徴</h3>
      <ul>
        <li>最適なSEOのためのサーバーサイドレンダリング</li>
        <li>インタラクティブなUIコンポーネント</li>
        <li>全デバイス対応のレスポンシブデザイン</li>
      </ul>
      
      <h3>デザインコンセプト</h3>
      <p>デザインはミニマリズムと使いやすさに重点を置いています。モダンでテックライクな外観を作り出すために、鮮やかなアクセントカラーを用いたダークモードテーマを採用しました。</p>
    `,
    date: "2025-10-15",
    tags: ["Next.js", "React", "Tailwind CSS"],
  },
  {
    id: "2",
    title: "Project Beta",
    description: "シームレスなユーザー体験を提供するEコマースプラットフォーム。",
    slug: "project-beta",
    image: "/images/project-beta.png",
    content: `
          <h2>プロジェクト概要</h2>
      <p>Project Betaは、シームレスなユーザー体験を提供するEコマースプラットフォームです...</p>
    `,
    date: "2025-11-20",
    tags: ["E-commerce", "Stripe", "Supabase"],
  },
  {
    id: "3",
    title: "Yakumoin Scraper",
    description:
      "Yakumoin.infoからデータアーカイブするためのPythonベースのWebスクレイパー。",
    slug: "yakumoin-scraper",
    image: "/images/yakumoin-scraper.png",
    content: `
      <h2>プロジェクト概要</h2>
      <p>このプロジェクトは、Yakumoinウェブサイトからデータをアーカイブするために設計されたPythonスクリプトです。コンテンツを抽出し、JSONに保存し、ページのスクリーンショットを取得します。</p>
      
      <h3>主な特徴</h3>
      <ul>
        <li>自動データ抽出</li>
        <li>JSONデータ保存</li>
        <li>HTMLスナップショット保存</li>
      </ul>

      <h3>ダウンロード</h3>
      <p>以下からスクレイパーパッケージをダウンロードできます：</p>
      <p>
        <a href="/yakumoin_scraper.zip" class="inline-block px-6 py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-colors">
          ツールをダウンロード (.zip)
        </a>
      </p>
    `,
    date: "2026-01-31",
    tags: ["Python", "Web Scraping", "Automation"],
  },
];
