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
            
    os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
    with open(LOG_FILE, 'a', encoding='utf-8') as f:
        f.write(formatted_message)

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
    elif trigger == 'RETROGRADE_ALERT':
        actions = 'コード修正 / 開発リプライオリティ変更'
        theme["fontTheme"] = "serif"
        tool_calls.append({
            "name": "set_color_theme",
            "arguments": theme
        })
    elif trigger == 'USER_CHAT':
        actions = 'ユーザー対話応答'
        chat_text = details.lower()
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

    return {
        "status": "MOCK_FALLBACK",
        "thoughtProcess": f"宇宙環境やバイオデータの乱れに対し、サイトの均衡を保つ必要があります。({thought})",
        "actions": actions,
        "textResponse": f"【エージェント応答】{trigger} を検知しました。調整を提案・実行します。" if trigger != 'USER_CHAT' else f"こんにちは。管理者様。ご指示『{details}』に従い、調整を行います（※モックフォールバックです）。",
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

【指示】
1. トリガーが 'USER_CHAT' の場合は、管理者（あなたを所有する開発者）からの直接の問いかけや指示です。問いかけに対して丁寧にアドバイスを返すとともに、もし「テーマを変えて」「落ち着いた色にして」「角丸を大きくして」といったデザインへの指示があれば、提供されている `set_color_theme` ツールを呼び出してテーマを変更してください。
2. トリガーが宇宙天気やバイオ、天体逆行などの環境指標の変化（例: 'SPACE_WEATHER_ALERT', 'USER_STRESS_ALERT', 'RETROGRADE_ALERT'）である場合は、自律進化のトリガーです。その環境変化に合わせて `set_color_theme` ツールを使って自動的にサイトのビジュアル（背景、テキスト、アクセント、光彩、角丸、ノイズ等）を調整してください。
3. 変更を決定した場合は必ず `set_color_theme` ツールを実行してください。ツールを実行しない場合、ビジュアル変更は適用されません。

ユーザーに対するテキスト応答や、自律進化時の思考の要約を最終的なメッセージとして出力してください。
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
            system_instructions="You are a self-evolving portal system daemon capable of designing CSS themes and executing visual layout operations.",
            tools=[set_color_theme],
            policies=[policy.allow_all()]
        )
        
        async with Agent(config) as agent:
            response = await agent.chat(system_prompt)
            decision = await response.text()
            
            result_data = {
                "status": "REAL_AI",
                "thoughtProcess": decision,
                "actions": "対話応答 / デザイン進化" if trigger == 'USER_CHAT' else "自律自己進化",
                "textResponse": decision,
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
    await run_agent(args['trigger'], args['details'], args['value'])

if __name__ == "__main__":
    asyncio.run(main())
