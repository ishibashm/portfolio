export class OuraClient {
  private accessToken: string;
  private baseUrl = "https://api.ouraring.com/v2/usercollection";

  constructor(accessToken?: string) {
    this.accessToken = accessToken || process.env.OURA_ACCESS_TOKEN || "";
  }

  private async fetchOura(
    endpoint: string,
    startDate: string,
    endDate: string,
  ) {
    if (!this.accessToken) {
      console.warn("Oura Access Token is not set.");
      return null;
    }
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
    });
    const res = await fetch(
      `${this.baseUrl}/${endpoint}?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      },
    );
    if (!res.ok) {
      throw new Error(`Oura API error: ${res.statusText}`);
    }
    return res.json();
  }

  async getDailySleep(startDate: string, endDate: string) {
    return this.fetchOura("daily_sleep", startDate, endDate);
  }

  async getDailyReadiness(startDate: string, endDate: string) {
    return this.fetchOura("daily_readiness", startDate, endDate);
  }

  async getDailyStress(startDate: string, endDate: string) {
    return this.fetchOura("daily_stress", startDate, endDate);
  }

  async getDailyResilience(startDate: string, endDate: string) {
    return this.fetchOura("daily_resilience", startDate, endDate);
  }
}
