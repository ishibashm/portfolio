# My Portfolio & AI Asset Builder Hub

This repository serves as a unified **Workspace Hub** integrating a modern Next.js portfolio, a custom web scraper (Yakumoin.info), and a quantitative artificial intelligence research pipeline designed for **Asset Formation (資産形成)**.

## 🚀 Key Features

### 1. 📊 AI Quant Researcher (Asset Builder)
A quantitative finance research pipeline integrating alternative and financial data.
- **Data Sources:** EDINET, J-Quants V2 API.
- **Tools:** Supports Agent-Reach for internet browsing (SNS, YouTube trends).
- **Execution:** Run analysis via `npm run research -- <ticker>`.

### 2. 📝 KatmerCode Obsidian Integration
A secure, integrated version of the KatmerCode Obsidian plugin (`packages/katmer-code`) running as a sub-package.
- **Purpose**: Connects your local Obsidian Vault to the AI Asset Builder backend.
- **Custom Skill (`/quant-research`)**: Run quantitative analysis scripts directly from Obsidian and generate interactive HTML financial reports inside the editor.
- **Academic Skills**: Built-in support for `/peer-review`, `/cite-verify`, and literature searches.

### 3. 🛠 Yakumoin Scraper
A built-in tool to archive daily direction checks from `yakumoin.info`.
- Automated scraping via Playwright, saving screenshots and structured HTML/Text data.

### 4. 🎨 Modern Portfolio Aesthetics
- **Dynamic Backgrounds**: Floating orbs with noise texture overlays.
- **Smooth Animations**: Powered by `framer-motion`.
- **Glassmorphism**: Premium UI elements with blur and transparency.

## 🏗 Tech Stack & Architecture

- **Workspace Manager:** `pnpm` Monorepo (supporting `packages/*`)
- **Frontend / Core Hub**: Next.js 15 (App Router), React, Tailwind CSS, Framer Motion.
- **Obsidian / AI App**: @anthropic-ai/claude-agent-sdk, CodeMirror, KatmerCode.
- **Backend / Scraper**: Node.js/TypeScript (tsx), Python 3, Playwright, Supabase/Prisma (PostgreSQL).

## 🚀 Getting Started

### 1. Install Dependencies

```bash
# Workspace setup
pnpm install

# Scraper dependencies
pip install -r src/scripts/yakumoin-scraper/requirements.txt
playwright install
```

### 2. Set Up KatmerCode (Obsidian Plugin)

```bash
# Build the plugin
cd packages/katmer-code
pnpm run build

# Copy to your Obsidian Vault
mkdir -p <your-vault>/.obsidian/plugins/katmer-code
cp main.js manifest.json styles.css <your-vault>/.obsidian/plugins/katmer-code/
```
*(After copying, enable KatmerCode and allow the `/quant-research` skill in the plugin settings).*

### 3. Run Development Server

```bash
pnpm run dev
```

Visit [http://localhost:3000](http://localhost:3000).
