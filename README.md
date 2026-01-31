# My Portfolio & Scraper Tool

A modern portfolio website built with Next.js, featuring a custom web scraper for archiving data from Yakumoin.info.
UI Design inspired by **Synecdoche**.

## Features

### 🎨 Modern Aesthetics

- **Dynamic Backgrounds**: Floating orbs with noise texture overlays.
- **Smooth Animations**: Powered by `framer-motion` for professional entrance effects.
- **Glassmorphism**: Premium UI elements with blur and transparency.

### 🛠 Yakumoin Scraper

A built-in tool to archive daily direction checks from `yakumoin.info`.

**How it works:**

1.  **Select a Date**: Choose the target date you want to archive.
2.  **Run Scraper**: The backend launches a headless browser (Playwright).
3.  **View Results**:
    - **Screenshot**: Full-page capture of the target site.
    - **HTML Snapshot**: Interactivable copy of the page.
    - **Text Data**: Structured table data extracted for analysis.

## Tech Stack

- **Frontend**: Next.js 15 (App Router), React, Tailwind CSS, Framer Motion.
- **Backend**: Next.js API Routes.
- **Scraper**: Python 3, Playwright, BeautifulSoup4.
- **Database**: Prisma (PostgreSQL).

## getting Started

1.  **Install Dependencies**:

    ```bash
    npm install
    pip install -r src/scripts/yakumoin-scraper/requirements.txt
    playwright install
    ```

2.  **Run Development Server**:

    ```bash
    npm run dev
    ```

3.  **Open Browser**:
    Visit [http://localhost:3000](http://localhost:3000).
