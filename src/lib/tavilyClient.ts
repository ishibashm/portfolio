export class TavilyClient {
  private apiKey: string;
  private baseUrl = 'https://api.tavily.com';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.TAVILY_API_KEY || '';
  }

  async search(query: string, options?: any) {
    if (!this.apiKey) {
      console.warn('Tavily API Key is not set.');
      return null;
    }
    const res = await fetch(`${this.baseUrl}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: this.apiKey,
        query,
        ...options
      })
    });
    if (!res.ok) {
      throw new Error(`Tavily API error: ${res.statusText}`);
    }
    return res.json();
  }
}
