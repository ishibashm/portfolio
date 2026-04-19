import os
import re
from pathlib import Path

# よくあるAPIキーの正規表現
secret_patterns = {
    'Google API Key': r'AIza[0-9A-Za-z-_]{35}',
    'OpenAI API Key': r'sk-[a-zA-Z0-9]{48}',
    'AWS Access Key ID': r'(A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}',
    'AWS Secret Access Key': r'(?i)aws_secret_access_key\s*=\s*[\'"]?([a-zA-Z0-9/+=]{40})[\'"]?',
    'Slack Token': r'xox[baprs]-[0-9]{12}-[0-9]{12}-[0-9a-zA-Z]{24}',
    'RSA Private Key': r'-----BEGIN RSA PRIVATE KEY-----',
    'Generic Secret': r'(?i)(password|secret|api_key|apikey|token)[\s=:]+[\'"]?([a-zA-Z0-9-_]{16,})[\'"]?'
}

def scan_directory(directory="."):
    ignore_dirs = {'.git', 'node_modules', '__pycache__', 'venv', '.venv', '.next', 'out', 'build', 'dist', 'coverage', 'Katmer_Toolbox'}
    ignore_exts = {'.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.zip', '.gz', '.db', '.sqlite', '.pyc'}
    
    findings = []
    
    print(f"Starting security scan in {os.path.abspath(directory)}...")
    for root, dirs, files in os.walk(directory):
        # 無視するディレクトリを除外
        dirs[:] = [d for d in dirs if d not in ignore_dirs]
        
        for file in files:
            file_path = Path(root) / file
            
            # 拡張子で無視
            if file_path.suffix.lower() in ignore_exts:
                continue
                
            # .gitignore されているかチェックは省略し、とりあえず全スキャンする
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    for name, pattern in secret_patterns.items():
                        matches = re.finditer(pattern, content)
                        for match in matches:
                            # Generic Secret は誤検知が多いため、長さなどを考慮
                            if name == 'Generic Secret':
                                secret_value = match.group(2)
                                if len(secret_value) < 20 or secret_value.isdigit():
                                    continue # 短い文字列や数字のみはスキップ
                                
                            line_num = content[:match.start()].count('\n') + 1
                            findings.append({
                                'file': str(file_path),
                                'line': line_num,
                                'type': name,
                                'match': match.group(0)[:20] + '...' # 全部出さない
                            })
            except UnicodeDecodeError:
                pass # バイナリファイル等
            except Exception as e:
                print(f"Error reading {file_path}: {e}")
                
    return findings

if __name__ == "__main__":
    findings = scan_directory()
    if findings:
        print("\nWARNING: Potential secrets found!")
        print("="*60)
        for f in findings:
            print(f"[{f['type']}] {f['file']}:{f['line']}")
            print(f"  Match: {f['match']}")
            print("-" * 40)
        print("="*60)
        print("Please review these files and add them to .gitignore or remove the secrets.")
    else:
        print("\nOK: No glaring secrets found in plain text files.")
