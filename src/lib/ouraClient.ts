/**
 * Oura の応答のうち、このアプリが読む枝だけ。
 *
 * 応答は日ごとの配列で返るが、こちらが見るのは先頭 1 件だけ。
 * ページ全体を型にしない（CLAUDE.md 4 節。#149 の Building と同じ扱い）。
 */
export interface OuraDailyScore {
  data?: { score?: number }[];
}

/** ストレスは日ごとの要約。数値のことも文字列（"restored" など）のこともある。 */
export interface OuraDailyStress {
  data?: { day_summary?: number | string }[];
}

/** 回復力は段階の名前（"adequate" / "strong" など）。 */
export interface OuraDailyResilience {
  data?: { level?: string }[];
}

export class OuraClient {
  private accessToken: string;
  private baseUrl = "https://api.ouraring.com/v2/usercollection";

  constructor(accessToken?: string) {
    this.accessToken = accessToken || process.env.OURA_ACCESS_TOKEN || "";
  }

  private async fetchOura<T>(
    endpoint: string,
    startDate: string,
    endDate: string,
  ): Promise<T | null> {
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
    return (await res.json()) as T;
  }

  async getDailySleep(startDate: string, endDate: string) {
    return this.fetchOura<OuraDailyScore>("daily_sleep", startDate, endDate);
  }

  async getDailyReadiness(startDate: string, endDate: string) {
    return this.fetchOura<OuraDailyScore>(
      "daily_readiness",
      startDate,
      endDate,
    );
  }

  async getDailyStress(startDate: string, endDate: string) {
    return this.fetchOura<OuraDailyStress>("daily_stress", startDate, endDate);
  }

  async getDailyResilience(startDate: string, endDate: string) {
    return this.fetchOura<OuraDailyResilience>(
      "daily_resilience",
      startDate,
      endDate,
    );
  }
}
