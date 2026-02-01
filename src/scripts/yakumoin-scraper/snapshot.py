import os
import sys
import argparse
from datetime import datetime
from playwright.sync_api import sync_playwright

# Force utf-8 output
sys.stdout.reconfigure(encoding='utf-8')

def save_snapshot(url, output_dir="data", base_name=None, target_date=None):
    try:
        if base_name is None:
            base_name = f"yakumoin_{datetime.now().strftime('%Y-%m-%d')}"
        
        # Ensure directory exists
        os.makedirs(output_dir, exist_ok=True)
        
        html_path = None
        png_path = None
        txt_path = None

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            
            # Go to URL (Birthday Page)
            print(f"Navigating to {url}...")
            page.goto(url, wait_until="networkidle")
            
            # If target_date is provided, submit the form to change date
            if target_date:
                print(f"Switching to target date: {target_date}...")
                
                # Check if we are already on the correct page (optimization)
                # But safer to just submit
                
                # Using page.evaluate to set hidden input and submit form
                # Based on user HTML: <form id="direction_form"> <input id="target_date" ...>
                
                # Note: target_date from route.ts is YYYYMMDD. 
                # The form likely accepts YYYYMMDD based on ch_date function usage.
                
                js_code = f"""() => {{
                    document.getElementById('target_date').value = '{target_date}';
                    document.getElementById('direction_form').submit();
                }}"""
                
                try:
                    with page.expect_navigation(wait_until="networkidle"):
                        page.evaluate(js_code)
                    print(f"Successfully navigated to date: {target_date}")
                except Exception as e:
                    print(f"Form submission failed: {e}")
                    # Try fallback: look for ch_date function if available
                    try:
                        with page.expect_navigation(wait_until="networkidle"):
                            page.evaluate(f"ch_date({target_date})")
                        print("Navigated using ch_date()")
                    except Exception as e2:
                        print(f"ch_date failed too: {e2}")
                        # Continue anyway, maybe we are on right page or it's a static test
            
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
            
        except ImportError:
            print("Warning: beautifulsoup4 not installed. Skipping table dump.")
            
        return html_path, png_path, txt_path

    except Exception as e:
        print(f"Error: {e}")
        return None, None, None

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Yakumoin Scraper')
    parser.add_argument('--url', required=True, help='Target URL to scrape (usually the birthday page)')
    parser.add_argument('--output', required=False, default='data', help='Output directory')
    parser.add_argument('--filename', required=False, help='Base filename (without extension)')
    parser.add_argument('--target-date', required=False, help='Target date in YYYYMMDD format')
    
    args = parser.parse_args()
    
    # Check if filename provided, else use date or timestamp (fallback)
    base_name = args.filename
    if not base_name:
        # If target date provided, use that for filename, else today
        d_str = args.target_date if args.target_date else datetime.now().strftime('%Y-%m-%d')
        base_name = f"yakumoin_{d_str}"
        
    save_snapshot(args.url, args.output, base_name, args.target_date)
