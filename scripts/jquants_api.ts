import "dotenv/config";

const JQUANTS_BASE_URL = "https://api.jquants.com/v2";

// Helper to fetch data with API Key
async function fetchWithAuth(endpoint: string, apiKey: string) {
  const response = await fetch(`${JQUANTS_BASE_URL}${endpoint}`, {
    headers: {
      "x-api-key": apiKey,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`JQuants API error on ${endpoint}: ${response.status} ${errorText}`);
  }

  return response.json();
}

// Get OHLCV Quotes for a specific code
export async function getQuotes(code: string, date?: string, from?: string, to?: string, apiKey?: string) {
  if (!apiKey) throw new Error("API Key is required");
  
  let endpoint = `/equities/bars/daily?code=${code}`;
  if (date) endpoint += `&date=${date}`;
  if (from) endpoint += `&from=${from}`;
  if (to) endpoint += `&to=${to}`;

  const responseData = await fetchWithAuth(endpoint, apiKey);
  // V2 API places the array of items under the 'data' key
  return responseData.data || [];
}

// Get Financial Statements (Fins) for a specific code
export async function getFinancialStatements(code: string, date?: string, apiKey?: string) {
  if (!apiKey) throw new Error("API Key is required");

  let endpoint = `/fins/summary?code=${code}`;
  if (date) endpoint += `&date=${date}`;

  const responseData = await fetchWithAuth(endpoint, apiKey);
  // V2 API places the array of items under the 'data' key
  return responseData.data || [];
}
