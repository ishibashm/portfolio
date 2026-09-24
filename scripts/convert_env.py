import os
import json

def main():
    env_vars = {}
    env_path = '.env'
    if os.path.exists(env_path):
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                if '=' in line:
                    key, val = line.split('=', 1)
                    key = key.strip()
                    val = val.strip()
                    # Strip double or single quotes
                    if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
                        val = val[1:-1]
                    env_vars[key] = val

    # ENV_FILE と個別設定を解決した後の値で判定する。任意機能なので配備は止めない。
    # 警告には固定のキー名だけを出し、秘密・URI・値は一切出さない。
    if env_vars.get('LISTING_EMAIL_GMAIL_ENABLED') == 'true':
        required = (
            'LISTING_EMAIL_GOOGLE_CLIENT_ID',
            'LISTING_EMAIL_GOOGLE_CLIENT_SECRET',
            'LISTING_EMAIL_GOOGLE_REDIRECT_URI',
            'LISTING_EMAIL_ENCRYPTION_KEY',
            'LISTING_EMAIL_ENCRYPTION_KEY_ID',
        )
        missing = [key for key in required if not env_vars.get(key)]
        if missing:
            print('::warning::Gmail は有効ですが必須設定が不足しています: ' + ', '.join(missing))

    with open('env.json', 'w', encoding='utf-8') as f:
        json.dump(env_vars, f, indent=2, ensure_ascii=False)

if __name__ == '__main__':
    main()
