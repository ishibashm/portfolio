import os
import requests
from fastmcp import FastMCP

mcp = FastMCP("Brave Search MCP")

@mcp.tool()
def brave_web_search(query: str, count: int = 5) -> str:
    """Search the web using Brave Search API."""
    api_key = os.getenv("BRAVE_API_KEY")
    if not api_key:
        return "Error: BRAVE_API_KEY environment variable is not set."
    
    url = "https://api.search.brave.com/res/v1/web/search"
    headers = {
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": api_key
    }
    params = {
        "q": query,
        "count": min(count, 20)
    }
    try:
        response = requests.get(url, headers=headers, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        results = data.get("web", {}).get("results", [])
        if not results:
            return "No results found."
        
        output = ""
        for i, item in enumerate(results):
            output += f"{i+1}. {item.get('title')}\n{item.get('description')}\nURL: {item.get('url')}\n\n"
        return output
    except Exception as e:
        return f"Error during Brave Search: {str(e)}"

def main():
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if os.path.exists(env_path):
        try:
            from dotenv import load_dotenv
            load_dotenv(env_path, override=True)
        except ImportError:
            pass

    host = os.getenv("MCP_HOST", "127.0.0.1")
    port = int(os.getenv("MCP_PORT", "8001"))
    
    mcp.run(transport="sse", host=host, port=port)

if __name__ == "__main__":
    main()
