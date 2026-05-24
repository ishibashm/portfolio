import os
import json
import glob
from datetime import datetime
import sys

if sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

WORKSPACE_DIR = r"C:\Users\ishib\projects\immediate"
API_GATEWAY_DIR = r"C:\Users\ishib\projects\image\apps\api-gateway"

def main():
    print("=" * 50)
    print(" JSONL -> Markdown 変換ツール (全ポストまとめ版)")
    print("=" * 50)
    
    search_dirs = [
        os.path.join(WORKSPACE_DIR, "jsonl"),
        os.path.join(API_GATEWAY_DIR, "media_output", "jsonl")
    ]
    out_dir = r"C:\Users\ishib\obsidian_vault\00_inbox"
    
    if not os.path.exists(out_dir):
        os.makedirs(out_dir, exist_ok=True)
        print(f"[INFO] 出力ディレクトリを作成しました: {out_dir}")

    jsonl_files = []
    for d in search_dirs:
        if os.path.exists(d):
            jsonl_files.extend(glob.glob(os.path.join(d, "*.jsonl")))
            
    if not jsonl_files:
        print("[ERROR] 以下のディレクトリに .jsonl ファイルが見つかりませんでした。")
        for d in search_dirs:
            print(f"  - {d}")
        try:
            input("\nEnterキーを押して終了します...")
        except EOFError:
            pass
        sys.exit(0)
        
    print(f"[INFO] {len(jsonl_files)} 個の JSONL ファイルを見つけました。1つのMarkdownファイルにまとめます...")
    
    # 既存のバラバラなファイルを削除する（念のため）
    old_md_files = glob.glob(os.path.join(out_dir, "x_post_*.md"))
    if old_md_files:
        print(f"[INFO] 以前のバラバラなMarkdownファイル {len(old_md_files)} 件を削除しています...")
        for f in old_md_files:
            try:
                os.remove(f)
            except Exception:
                pass

    # 出力ファイル (タイムスタンプ付きのファイル名)
    output_filename = f"x_all_posts_extracted_{datetime.now().strftime('%Y%m%d_%H%M%S')}.md"
    out_path = os.path.join(out_dir, output_filename)
    
    count = 0
    error_count = 0
    
    with open(out_path, "w", encoding="utf-8") as out_f:
        out_f.write(f"# X (Twitter) 抽出データ一覧\n\n")
        out_f.write(f"抽出日時: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
        out_f.write("---\n\n")
        
        for file_path in jsonl_files:
            print(f"  処理中: {os.path.basename(file_path)}")
            with open(file_path, "r", encoding="utf-8") as f:
                for line_no, line in enumerate(f, 1):
                    line = line.strip()
                    if not line: continue
                    try:
                        data = json.loads(line)
                        if "text" not in data: continue
                            
                        post_id = data.get("id", f"unknown_id_{line_no}")
                        author = data.get("author_handle", "unknown_user")
                        dt_str = data.get("datetime", "")
                        
                        out_f.write(f"## Post by @{author} ({dt_str})\n\n")
                        if "url" in data:
                            out_f.write(f"**URL:** {data['url']}\n\n")
                        out_f.write(f"**Author:** {data.get('author_display', 'Unknown')}\n\n")
                        out_f.write(f"{data['text']}\n\n")
                        
                        if data.get("quoted_urls"):
                            out_f.write("**Quoted URLs:**\n")
                            for q in data["quoted_urls"]:
                                out_f.write(f"- {q}\n")
                            out_f.write("\n")
                                    
                        if data.get("external_links"):
                            out_f.write("**External Links:**\n")
                            for ext in data["external_links"]:
                                out_f.write(f"- {ext}\n")
                            out_f.write("\n")
                                    
                        if data.get("saved_media"):
                            out_f.write("**Saved Media:**\n")
                            for m in data["saved_media"]:
                                out_f.write(f"- {m}\n")
                            out_f.write("\n")
                        
                        out_f.write("---\n\n")
                        count += 1
                    except Exception as e:
                        error_count += 1

    print("\n" + "=" * 50)
    print(f"変換完了！")
    print(f"✅ 成功: {count} 件のポストを 1 つのMarkdownファイルにまとめました。")
    if error_count > 0:
        print(f"⚠️ エラー: {error_count} 件")
    print(f"📂 保存先: {out_path}")
    print("=" * 50)
    try:
        input("Enterキーを押して終了します...")
    except EOFError:
        pass

if __name__ == "__main__":
    main()
