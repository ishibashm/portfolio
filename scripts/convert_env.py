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

    with open('env.json', 'w', encoding='utf-8') as f:
        json.dump(env_vars, f, indent=2, ensure_ascii=False)

if __name__ == '__main__':
    main()
