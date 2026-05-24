import yfinance as yf
import pandas as pd
import json
import sys
import numpy as np

def fetch_data(ticker_symbol):
    try:
        stock = yf.Ticker(ticker_symbol)
        
        # 1. Get History (Last 1 year for chart)
        hist = stock.history(period="1y")
        chart_data = []
        if not hist.empty:
            for index, row in hist.iterrows():
                chart_data.append({
                    "date": index.strftime('%Y-%m-%d'),
                    "open": float(row['Open']),
                    "high": float(row['High']),
                    "low": float(row['Low']),
                    "close": float(row['Close']),
                    "volume": int(row['Volume'])
                })

        # 2. Get Fundamentals (Income Statement & Balance Sheet)
        income_stmt = stock.income_stmt
        balance_sheet = stock.balance_sheet
        
        pl_data = []
        bs_data = []

        if income_stmt is not None and not income_stmt.empty:
            # We want recent 4 periods usually
            cols = income_stmt.columns[:4]
            for col in cols:
                date_str = col.strftime('%Y-%m-%d')
                revenue = float(income_stmt.loc['Total Revenue', col]) if 'Total Revenue' in income_stmt.index and pd.notna(income_stmt.loc['Total Revenue', col]) else 0
                net_income = float(income_stmt.loc['Net Income', col]) if 'Net Income' in income_stmt.index and pd.notna(income_stmt.loc['Net Income', col]) else 0
                gross_profit = float(income_stmt.loc['Gross Profit', col]) if 'Gross Profit' in income_stmt.index and pd.notna(income_stmt.loc['Gross Profit', col]) else 0
                
                pl_data.append({
                    "date": date_str,
                    "revenue": revenue,
                    "netIncome": net_income,
                    "grossProfit": gross_profit
                })

        if balance_sheet is not None and not balance_sheet.empty:
            cols = balance_sheet.columns[:4]
            for col in cols:
                date_str = col.strftime('%Y-%m-%d')
                total_assets = float(balance_sheet.loc['Total Assets', col]) if 'Total Assets' in balance_sheet.index and pd.notna(balance_sheet.loc['Total Assets', col]) else 0
                total_liabilities = float(balance_sheet.loc['Total Liabilities Net Minority Interest', col]) if 'Total Liabilities Net Minority Interest' in balance_sheet.index and pd.notna(balance_sheet.loc['Total Liabilities Net Minority Interest', col]) else 0
                total_equity = float(balance_sheet.loc['Stockholders Equity', col]) if 'Stockholders Equity' in balance_sheet.index and pd.notna(balance_sheet.loc['Stockholders Equity', col]) else 0
                
                bs_data.append({
                    "date": date_str,
                    "totalAssets": total_assets,
                    "totalLiabilities": total_liabilities,
                    "totalEquity": total_equity
                })

        # 3. Get Info (Summary)
        info = stock.info
        summary = {
            "name": info.get("shortName", ticker_symbol),
            "currentPrice": info.get("currentPrice", 0),
            "previousClose": info.get("previousClose", 0),
            "sector": info.get("sector", "Unknown"),
            "industry": info.get("industry", "Unknown"),
            "marketCap": info.get("marketCap", 0)
        }

        return {
            "success": True,
            "ticker": ticker_symbol,
            "summary": summary,
            "chart": chart_data,
            "fundamentals": {
                "pl": pl_data,
                "bs": bs_data
            }
        }

    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

if __name__ == "__main__":
    if len(sys.argv) > 1:
        ticker = sys.argv[1]
        result = fetch_data(ticker)
        print(json.dumps(result))
    else:
        print(json.dumps({"success": False, "error": "No ticker provided"}))