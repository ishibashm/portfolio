import sys
import os
import asyncio
import argparse

if sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

base_dir = r"C:\Users\ishib\projects\image\apps\api-gateway"
if base_dir not in sys.path:
    sys.path.insert(0, base_dir)

try:
    from app.core.scraper.manager import scraper_manager
    from app.core.scraper.x_collector import XCollector
except ImportError as e:
    print(f"モジュールのインポートに失敗しました。api-gatewayの環境が正しく設定されていない可能性があります。")
    print(f"詳細: {e}")
    sys.exit(1)

async def main():
    parser = argparse.ArgumentParser(description="X (Twitter) データ抽出ツール")
    parser.add_argument("--url", type=str, required=True, help="抽出したいXのURL (例: https://x.com/search?q=...)")
    parser.add_argument("--scrolls", type=int, default=10, help="最大スクロール回数 (デフォルト 10)")
    args = parser.parse_args()

    target_url = args.url
    max_scrolls = args.scrolls

    print("=" * 50)
    print(" X (Twitter) データ抽出ツール")
    print(f" Target URL: {target_url}")
    print(f" Max Scrolls: {max_scrolls}")
    print("=" * 50)
    
    print("\n[INFO] ブラウザを起動しています...")
    success = scraper_manager.launch_browser(target_url)
    if not success:
        print("[ERROR] ブラウザの起動に失敗しました。")
        return
        
    print("\n[INFO] ブラウザが起動しました。自動抽出を開始します...")

    driver = scraper_manager.get_driver()
    if driver is None:
        print("[ERROR] ブラウザが利用できません。")
        return
        
    collector = XCollector(driver=driver, max_scrolls=max_scrolls)
    
    async def dummy_callback(msg, is_error=False, event_type="progress"):
        prefix = "[ERROR]" if is_error else f"[{event_type.upper()}]"
        print(f"{prefix} {msg}")
        sys.stdout.flush() # Ensure logs stream immediately
        
    print("\n[INFO] スクレイピングを開始します...")
    try:
        await collector.run(callback=dummy_callback)
        print("\n[SUCCESS] スクレイピングが完了しました！")
    except Exception as e:
        print(f"\n[ERROR] エラー発生: {e}")
    finally:
        print("ブラウザを閉じます...")
        scraper_manager.close_browser()

if __name__ == "__main__":
    asyncio.run(main())
