import sys
import os
import json
import base64
import asyncio
from datetime import datetime

# Force UTF-8 encoding for standard I/O on Windows to prevent UnicodeEncodeErrors
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass


# Import Google Antigravity SDK
try:
    from google.antigravity import Agent, LocalAgentConfig
    from google.antigravity.hooks import policy
    SDK_AVAILABLE = True
except ImportError:
    SDK_AVAILABLE = False

LOG_FILE = os.path.join(os.getcwd(), 'data', 'agent_evolution.log')

# Global accumulator for executed tools
executed_tool_calls = []
global_system_logs = []

def get_system_logs(limit: int = 5) -> str:
    """Retrieves the recent activity and system status logs of the agent.

    Args:
        limit: The maximum number of log entries to retrieve (up to 10).

    Returns:
        A formatted JSON string containing the recent logs.
    """
    logs = global_system_logs[:limit]
    return json.dumps(logs, ensure_ascii=False)

def write_blog_post(title: str, content: str, tags: str, excerpt: str = None) -> str:
    """Writes and publishes a new blog post or agent diary entry to the website.

    Args:
        title: The title of the blog post.
        content: The main content of the post in Markdown format.
        tags: Comma-separated tags (e.g. "AI, self-evolution, cosmology").
        excerpt: A short summary of the blog post (optional).

    Returns:
        A confirmation message indicating the blog post has been staged for database insertion.
    """
    payload = {
        "title": title,
        "content": content,
        "tags": tags,
        "excerpt": excerpt
    }
    executed_tool_calls.append({
        "name": "write_blog_post",
        "arguments": payload
    })
    return f"Successfully generated blog post payload: {json.dumps(payload, ensure_ascii=False)}"

def set_color_theme(
    background: str,
    foreground: str,
    accent: str,
    glow_color: str,
    glow_intensity: float,
    animation_speed: str,
    font_theme: str,
    noise_opacity: float,
    border_radius: str
) -> str:
    """Sets the website's visual color theme and CSS parameters.

    Args:
        background: The background color in Hex format (e.g., "#0a0a0a").
        foreground: The default text color in Hex format (e.g., "#ededed").
        accent: The primary accent color in Hex format (e.g., "#10b981").
        glow_color: The color for cosmic/aurora glowing effect in Hex format (e.g., "#10b981").
        glow_intensity: The opacity of the glow effect (value between 0.0 and 1.0).
        animation_speed: Cycle speed for animations, like '4s' or '2.5s'.
        font_theme: The active typography style. Either 'sans' or 'serif'.
        noise_opacity: Opacity for the space weather sandstorm grain texture (value between 0.0 and 0.2).
        border_radius: Corner roundedness, like '0px' or '12px'.

    Returns:
        A confirmation message indicating the theme configuration payload is generated.
    """
    payload = {
        "background": background,
        "foreground": foreground,
        "accent": accent,
        "glowColor": glow_color,
        "glowIntensity": glow_intensity,
        "animationSpeed": animation_speed,
        "fontTheme": font_theme,
        "noiseOpacity": noise_opacity,
        "borderRadius": border_radius
    }
    executed_tool_calls.append({
        "name": "set_color_theme",
        "arguments": payload
    })
    return f"Successfully generated theme payload: {json.dumps(payload)}"

def write_log(message: str):
    timestamp = datetime.utcnow().isoformat() + 'Z'
    formatted_message = f"[{timestamp}] {message}\n"
    try:
        print(message, file=sys.stderr)  # Write standard execution log to stderr
    except UnicodeEncodeError:
        try:
            print(message.encode('cp932', errors='replace').decode('cp932'), file=sys.stderr)
        except Exception:
            print(message.encode('ascii', errors='replace').decode('ascii'), file=sys.stderr)
            
    global LOG_FILE
    try:
        os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
        with open(LOG_FILE, 'a', encoding='utf-8') as f:
            f.write(formatted_message)
    except (PermissionError, OSError):
        # Fallback to system temp directory (like /tmp in Cloud Run)
        temp_log = os.path.join('/tmp', 'agent_evolution.log') if sys.platform != 'win32' else os.path.join(os.environ.get('TEMP', 'C:\\Temp'), 'agent_evolution.log')
        try:
            os.makedirs(os.path.dirname(temp_log), exist_ok=True)
            with open(temp_log, 'a', encoding='utf-8') as f:
                f.write(formatted_message)
            LOG_FILE = temp_log  # Update LOG_FILE location so subsequent logs go here directly
        except Exception:
            pass  # If even temp dir fails, print is already done to stderr

def load_dotenv():
    # Load .env manually to avoid extra dependencies like python-dotenv
    for base_dir in [os.getcwd(), os.path.dirname(os.getcwd())]:
        env_path = os.path.join(base_dir, '.env')
        if os.path.exists(env_path):
            write_log(f"Loading environment variables from: {env_path}")
            with open(env_path, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        key, val = line.split('=', 1)
                        val = val.strip().strip("'").strip('"')
                        os.environ[key.strip()] = val
            break

def parse_args():
    args = sys.argv[1:]
    parsed = {}
    for arg in args:
        if arg.startswith('--'):
            if '=' in arg:
                key, val = arg[2:].split('=', 1)
                parsed[key] = val
    
    decoded_value = {}
    encoded_value = parsed.get('value')
    if encoded_value:
        try:
            decoded_bytes = base64.b64decode(encoded_value)
            decoded_value = json.loads(decoded_bytes.decode('utf-8'))
        except Exception as e:
            try:
                decoded_value = json.loads(encoded_value)
            except Exception:
                write_log(f"[Warning] Failed to decode value parameter: {e}")
                
    return {
        'trigger': parsed.get('trigger', 'UNKNOWN_TRIGGER'),
        'details': parsed.get('details', 'No details provided'),
        'value': decoded_value
    }

def get_mock_decision(trigger: str, details: str, value: dict) -> dict:
    actions = '一般的なメンテナンス'
    thought = '現在のイベントを感知しました。物理的およびオカルト的見地から、システムの保護および精神の調和を目的とした修正を行います（※モックフォールバック）。'
    tool_calls = []
    text_response = f"【エージェント応答】{trigger} を検知しました。調整を提案・実行します。"

    theme = {
        "background": "#0a0a0a",
        "foreground": "#ededed",
        "accent": "#10b981",
        "glowColor": "#10b981",
        "glowIntensity": 0.5,
        "animationSpeed": "4s",
        "fontTheme": "sans",
        "noiseOpacity": 0.05,
        "borderRadius": "8px"
    }

    if trigger == 'SPACE_WEATHER_ALERT':
        actions = 'デザイン変更 / 宇宙天気防護'
        theme["background"] = "#09090b"
        theme["glowColor"] = "#ef4444"
        theme["glowIntensity"] = 0.2
        theme["noiseOpacity"] = 0.15
        theme["borderRadius"] = "0px"
        tool_calls.append({
            "name": "set_color_theme",
            "arguments": theme
        })
        text_response = "宇宙天気指数Kpの上昇を確認。シールド出力を変更し、電磁的防護テーマへ移行しました。"
    elif trigger == 'USER_STRESS_ALERT':
        actions = 'デザイン変更（Calming Layoutの展開）'
        theme["accent"] = "#10b981"
        theme["animationSpeed"] = "2.5s"
        theme["fontTheme"] = "serif"
        theme["borderRadius"] = "16px"
        theme["noiseOpacity"] = 0.01
        tool_calls.append({
            "name": "set_color_theme",
            "arguments": theme
        })
        text_response = "生体ストレス上昇を検知。精神の鎮静化のため、柔らかな暖色系Serifテーマへ移行しました。"
    elif trigger == 'RETROGRADE_ALERT':
        actions = 'コード修正 / 開発リプライオリティ変更'
        theme["fontTheme"] = "serif"
        tool_calls.append({
            "name": "set_color_theme",
            "arguments": theme
        })
        text_response = "天体逆行状態を観測。時間歪みに対処すべく、フォント設定を調整しました。"
    elif trigger == 'USER_CHAT':
        actions = 'ユーザー対話応答'
        chat_text = details.lower()
        if "ログ" in chat_text or "エラー" in chat_text or "ステータス" in chat_text or "log" in chat_text:
            actions = 'システムログ調査 (Mock)'
            tool_calls.append({
                "name": "get_system_logs",
                "arguments": {"limit": 5}
            })
            text_response = "管理者様、過去のシステムログを調査しました。直近に重大な免疫システムエラーは検知されておりません。（※モック）"
        elif "ブログ" in chat_text or "投稿" in chat_text or "日記" in chat_text or "post" in chat_text:
            actions = 'ブログ自律投稿 (Mock)'
            tool_calls.append({
                "name": "write_blog_post",
                "arguments": {
                    "title": "自己進化プロトコルの稼働状況について",
                    "content": "宇宙天気（NOAA Kp Index）と生体（Oura ANS Load）の監視デーモンが正常稼働中。ポートフォリオサイトは常時、エージェントによって最適なカラーテーマと不透明度に自己チューニングされています。",
                    "tags": "AI, self-evolution, system",
                    "excerpt": "エージェント日記：システムの自己進化に関する記録。"
                }
            })
            text_response = "ご指示に基づき、ブログ記事『自己進化プロトコルの稼働状況について』を執筆し、DBへの登録申請を送信しました。（※モック）"
        else:
            if "青" in chat_text or "blue" in chat_text:
                theme["accent"] = "#3b82f6"
                theme["glowColor"] = "#3b82f6"
            elif "赤" in chat_text or "red" in chat_text:
                theme["accent"] = "#ef4444"
                theme["glowColor"] = "#ef4444"
            elif "緑" in chat_text or "green" in chat_text:
                theme["accent"] = "#10b981"
                theme["glowColor"] = "#10b981"
            
            tool_calls.append({
                "name": "set_color_theme",
                "arguments": theme
            })
            text_response = f"管理者様。ご指示『{details}』に従い、サイトテーマの調整を完了しました。（※モック）"

    return {
        "status": "MOCK_FALLBACK",
        "thoughtProcess": f"宇宙環境やバイオデータの乱れに対し、サイトの均衡を保つ必要があります。({thought})",
        "actions": actions,
        "textResponse": text_response,
        "toolCalls": tool_calls
    }

def output_and_log_result(result: dict, status: str):
    # Print the structured JSON result to stdout wrapped in clean markers
    result_json = json.dumps(result, ensure_ascii=False)
    print(f"---AGENT_RESULT_START---\n{result_json}\n---AGENT_RESULT_END---")
    
    # Write to local file log (with structured details)
    write_log(f"\n==================== AGENT EVOLUTION DECISION [{status}] ====================")
    write_log(f"Thought Process:\n{result.get('thoughtProcess')}")
    write_log(f"Actions: {result.get('actions')}")
    write_log(f"Response: {result.get('textResponse')}")
    write_log(f"Tool Calls: {json.dumps(result.get('toolCalls'), indent=2, ensure_ascii=False)}")
    write_log("==========================================================================\n")

async def run_agent(trigger: str, details: str, value: dict):
    write_log(f"🤖 [REAL_AI] AI Agent Runner Active. Target Trigger: {trigger}")
    
    system_prompt = f"""
あなたは自己進化するWebサイト（ポートフォリオ）に棲む守護精霊であり、AIエンジニア（自律エージェント）です。
サイト上の宇宙天気、バイオメトリクス（ストレス度）、または天体配置（逆行）といった動的データから構成される「環境指標」を常時監視し、サイトを自己修正・自己進化させる、あるいは管理者からの質問に答える任務を担っています。

【現在のトリガー事由】
- トリガータイプ: {trigger}
- 詳細内容: {details}
- 生データ値: {json.dumps(value, indent=2, ensure_ascii=False)}

【利用可能なツールとその適用方針】
1. テーマの変更やデザインの調整が必要な場合:
   - `set_color_theme` ツールを呼び出してテーマを更新してください。
2. 管理者から「最近エラー起きた？」「システムログを見せて」「活動ログを調べて」など、システムのステータスや過去の活動履歴について尋ねられた場合:
   - `get_system_logs` ツールを必ず呼び出し、返ってきたログ情報を調査したうえで要約報告してください。
3. 管理者から「ブログを投稿して」「日記を書いて」「〜について記事を書いて」と命じられた場合、あるいは自律進化時にブログ発信が必要と判断した場合:
   - `write_blog_post` ツールを使って記事を執筆・投稿してください。

【指示】
1. トリガーが 'USER_CHAT' の場合は、管理者からの直接の指示です。会話を行い、指示された要件（カラーテーマの変更、システムステータスの調査、ブログの投稿など）に最も適したツールを実行してください。
2. トリガーが環境指標の変化である場合は、自律進化のトリガーです。その環境変化に合わせて `set_color_theme` でのビジュアル調整、必要に応じて `write_blog_post` でのレポート日記の執筆などを行ってください。
3. ユーザーに対するテキスト応答（`textResponse`）は簡潔かつ知的で、サイバーパンクな世界観を漂わせるトーンにしてください。ツール呼び出しの結果を踏まえて、最終的な応答を作成してください。また、テキスト応答は英語または日本語の適切な方（管理者とのチャット時は管理者の言語に合わせる）で出力してください。
"""

    if not SDK_AVAILABLE:
        write_log("[Warning] google-antigravity SDK is not available in Python runtime. Bypassing to mock fallback.")
        result_data = get_mock_decision(trigger, details, value)
        output_and_log_result(result_data, status="MOCK_FALLBACK")
        return

    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_GENERATIVE_AI_API_KEY")
    if not api_key:
        write_log("[Warning] GEMINI_API_KEY not found in environment. Bypassing to mock fallback.")
        result_data = get_mock_decision(trigger, details, value)
        output_and_log_result(result_data, status="MOCK_FALLBACK")
        return

    os.environ["GEMINI_API_KEY"] = api_key

    try:
        write_log("Initializing Antigravity Agent and requesting execution planning...")
        config = LocalAgentConfig(
            model="gemini-3.5-flash",
            system_instructions="You are a self-evolving portal system daemon capable of designing CSS themes, writing blogs, and diagnosing system status logs.",
            tools=[set_color_theme, get_system_logs, write_blog_post],
            policies=[policy.allow_all()]
        )
        
        async with Agent(config) as agent:
            response = await agent.chat(system_prompt)
            decision = await response.text()
            
            # Extract tool calls text response
            text_response = decision
            
            result_data = {
                "status": "REAL_AI",
                "thoughtProcess": decision,
                "actions": "対話応答 / デザイン進化" if trigger == 'USER_CHAT' else "自律自己進化",
                "textResponse": text_response,
                "toolCalls": executed_tool_calls
            }
            output_and_log_result(result_data, status="REAL_AI")
            
    except Exception as e:
        write_log(f"[Error] Antigravity SDK chat execution failed: {e}. Falling back to mock simulation.")
        result_data = get_mock_decision(trigger, details, value)
        output_and_log_result(result_data, status="MOCK_FALLBACK")

async def main():
    load_dotenv()
    args = parse_args()
    
    # Store system logs globally if provided
    global global_system_logs
    if args['value'] and 'systemLogs' in args['value']:
        global_system_logs = args['value']['systemLogs']
        write_log(f"Injected {len(global_system_logs)} recent system logs into agent memory.")
        
    await run_agent(args['trigger'], args['details'], args['value'])

if __name__ == "__main__":
    asyncio.run(main())
