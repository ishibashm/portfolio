import os
from datetime import datetime
import sys
from playwright.sync_api import sync_playwright

# Force utf-8 output
sys.stdout.reconfigure(encoding='utf-8')

def save_snapshot(url, output_dir="data", base_name=None):
    if base_name is None:
        base_name = f"yakumoin_{datetime.now().strftime('%Y-%m-%d')}"
        
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            
            # Go to URL
            page.goto(url, wait_until="networkidle")
            
            # Ensure directory exists
            os.makedirs(output_dir, exist_ok=True)
            today_str = datetime.now().strftime("%Y-%m-%d")
            
            # 1. Save HTML
            html_content = page.content()
            html_filename = f"{base_name}.html"
            html_path = os.path.join(output_dir, html_filename)
            with open(html_path, "w", encoding="utf-8") as f:
                f.write(html_content)
            print(f"Success: HTML saved to {html_path}")

            # 2. Save Screenshot
            png_filename = f"{base_name}.png"
            png_path = os.path.join(output_dir, png_filename)
            page.screenshot(path=png_path, full_page=True)
            print(f"Success: Screenshot saved to {png_path}")
            
            browser.close()

        # 3. Save Table Dump
        try:
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(html_content, "html.parser")
            tables = soup.find_all("table")
            
            txt_filename = f"{base_name}.txt"
            txt_path = os.path.join(output_dir, txt_filename)
            
            with open(txt_path, "w", encoding="utf-8") as dt:
                for i, table in enumerate(tables):
                    dt.write(f"--- Table {i} ---\n")
                    rows = table.find_all("tr")
                    for row in rows:
                        cols = row.find_all(["td", "th"])
                        row_text = [c.get_text(strip=True) for c in cols]
                        dt.write(f"{row_text}\n")
                    dt.write("\n")
            print(f"Success: Table dump saved to {txt_path}")
            return html_path, png_path, txt_path
            
        except ImportError:
            print("Warning: beautifulsoup4 not installed. Skipping table dump.")
            return html_path, png_path, None

    except Exception as e:
        print(f"Error: {e}")
        return None, None, None

    parser = argparse.ArgumentParser(description='Yakumoin Scraper')
    parser.add_argument('--url', required=True, help='Target URL to scrape')
    parser.add_argument('--output', required=False, default='data', help='Output directory')
    parser.add_argument('--filename', required=False, help='Base filename (without extension)')
    
    args = parser.parse_args()
    
    # Check if filename provided, else use date
    base_name = args.filename
    if not base_name:
        base_name = f"yakumoin_{datetime.now().strftime('%Y-%m-%d')}"
        
    save_snapshot(args.url, args.output, base_name)
