import sys
import json
import math
import requests
from bs4 import BeautifulSoup
from datetime import datetime
import yfinance as yf
import pandas as pd
import numpy as np
import scipy.stats as stats

def calculate_technical_indicators(df):
    """
    Calculates technical indicators: SMA, Bollinger Bands, RSI, MACD.
    """
    # 1. Simple Moving Averages (SMA)
    df['SMA_25'] = df['Close'].rolling(window=25).mean()
    df['SMA_75'] = df['Close'].rolling(window=75).mean()
    df['SMA_200'] = df['Close'].rolling(window=200).mean()

    # 2. Bollinger Bands (20 period, 2 standard deviations)
    df['BB_Middle'] = df['Close'].rolling(window=20).mean()
    bb_std = df['Close'].rolling(window=20).std()
    df['BB_Upper'] = df['BB_Middle'] + (bb_std * 2)
    df['BB_Lower'] = df['BB_Middle'] - (bb_std * 2)

    # 3. Relative Strength Index (RSI - 14 period)
    delta = df['Close'].diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
    rs = gain / (loss + 1e-9)
    df['RSI_14'] = 100 - (100 / (1 + rs))

    # 4. MACD (12, 26, 9)
    df['EMA_12'] = df['Close'].ewm(span=12, adjust=False).mean()
    df['EMA_26'] = df['Close'].ewm(span=26, adjust=False).mean()
    df['MACD'] = df['EMA_12'] - df['EMA_26']
    df['MACD_Signal'] = df['MACD'].ewm(span=9, adjust=False).mean()
    df['MACD_Hist'] = df['MACD'] - df['MACD_Signal']

    return df

def calculate_quant_metrics(df):
    """
    Computes statistical and risk metrics inspired by gs-quant.
    """
    # Daily returns
    returns = df['Close'].pct_change().dropna()
    
    if len(returns) < 10:
        return {}

    # 1. Annualized Return (Geometric mean)
    num_years = len(df) / 252.0
    total_return = (df['Close'].iloc[-1] / df['Close'].iloc[0]) - 1
    annualized_return = (total_return + 1) ** (1.0 / max(num_years, 0.1)) - 1
    
    # 2. Annualized Volatility
    daily_vol = returns.std()
    annualized_vol = daily_vol * math.sqrt(252)

    # 3. Sharpe Ratio (assuming Risk Free Rate = 0)
    sharpe_ratio = annualized_return / (annualized_vol + 1e-9)

    # 4. Maximum Drawdown
    cum_returns = (1 + returns).cumprod()
    running_max = cum_returns.cummax()
    drawdown = (cum_returns - running_max) / running_max
    max_drawdown = float(drawdown.min())

    # 5. Value at Risk (VaR 95%, 1-day)
    hist_var_95 = float(-np.percentile(returns, 5))
    param_var_95 = float(stats.norm.ppf(0.95) * daily_vol)

    # 6. Skewness and Kurtosis
    skewness = float(stats.skew(returns))
    kurtosis = float(stats.kurtosis(returns))

    return {
        "annualized_return": round(float(annualized_return), 4),
        "annualized_volatility": round(float(annualized_vol), 4),
        "sharpe_ratio": round(float(sharpe_ratio), 4),
        "max_drawdown": round(max_drawdown, 4),
        "var_historical_95": round(hist_var_95, 4),
        "var_parametric_95": round(param_var_95, 4),
        "skewness": round(skewness, 4),
        "kurtosis": round(kurtosis, 4)
    }

def run_monte_carlo_simulation(df, horizon=30, simulations=1000):
    """
    Generates Monte Carlo simulations using GBM.
    """
    returns = df['Close'].pct_change().dropna()
    mu = returns.mean()
    sigma = returns.std()
    
    last_price = float(df['Close'].iloc[-1])
    last_date = df.index[-1]
    
    # Future dates (business days)
    future_dates = pd.date_range(start=last_date + pd.Timedelta(days=1), periods=horizon, freq='B')
    
    dt = 1
    paths = np.zeros((horizon, simulations))
    paths[0] = last_price
    
    for t in range(1, horizon):
        rand = np.random.standard_normal(simulations)
        paths[t] = paths[t-1] * np.exp((mu - 0.5 * sigma**2) * dt + sigma * np.sqrt(dt) * rand)
        
    # Calculate statistics
    mean_path = np.mean(paths, axis=1)
    lower_95 = np.percentile(paths, 2.5, axis=1)
    upper_95 = np.percentile(paths, 97.5, axis=1)
    lower_50 = np.percentile(paths, 25, axis=1)
    upper_50 = np.percentile(paths, 75, axis=1)
    
    simulation_results = []
    for i in range(horizon):
        simulation_results.append({
            "step": i + 1,
            "date": future_dates[i].strftime('%Y-%m-%d'),
            "mean": round(float(mean_path[i]), 2),
            "lower_95": round(float(lower_95[i]), 2),
            "upper_95": round(float(upper_95[i]), 2),
            "lower_50": round(float(lower_50[i]), 2),
            "upper_50": round(float(upper_50[i]), 2)
        })
        
    return simulation_results

def scrape_yahoo_finance_jp_valuation(ticker, max_pages=2):
    """
    Scrapes valuation ratios (PER, PBR) from Yahoo Finance Japan's history page.
    """
    valuation_data = {}
    if not ticker.endswith('.T'):
        return valuation_data
        
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    for page in range(1, max_pages + 1):
        url = f"https://finance.yahoo.co.jp/quote/{ticker}/history?page={page}"
        try:
            res = requests.get(url, headers=headers, timeout=5)
            if res.status_code != 200:
                break
                
            soup = BeautifulSoup(res.text, "html.parser")
            tables = soup.find_all("table")
            if not tables:
                break
                
            rows = tables[0].find_all("tr")
            if len(rows) <= 1:
                break
                
            for row in rows[1:]:
                cols = [col.text.strip() for col in row.find_all(["td", "th"])]
                if len(cols) >= 9:
                    date_str = cols[0]
                    per_str = cols[7]
                    pbr_str = cols[8]
                    
                    try:
                        dt = datetime.strptime(date_str, "%Y/%m/%d")
                        formatted_date = dt.strftime("%Y-%m-%d")
                        per = float(per_str.replace(',', '')) if per_str and per_str != '-' else None
                        pbr = float(pbr_str.replace(',', '')) if pbr_str and pbr_str != '-' else None
                        valuation_data[formatted_date] = (per, pbr)
                    except:
                        continue
        except Exception as e:
            break
            
    return valuation_data

def parse_yfinance_html(html_content):
    """
    Parses a Yahoo Finance Japan history page HTML table.
    Returns a pandas DataFrame.
    """
    soup = BeautifulSoup(html_content, "html.parser")
    tables = soup.find_all("table")
    if not tables:
        # Try finding table by class or ID
        table = soup.find(id="histlist") or soup.find(class_=lambda x: x and 'table' in x.lower())
    else:
        table = tables[0]
        
    if not table:
        raise ValueError("Could not find any tables in the pasted HTML.")
        
    rows = table.find_all("tr")
    data_list = []
    
    for row in rows[1:]: # Skip header
        cols = row.find_all(["td", "th"])
        if len(cols) < 7:
            continue
            
        try:
            date_str = cols[0].text.strip()
            # Try to parse date like YYYY/MM/DD or YYYY-MM-DD
            try:
                dt = datetime.strptime(date_str, "%Y/%m/%d")
            except:
                dt = datetime.strptime(date_str, "%Y-%m-%d")
                
            formatted_date = dt.strftime("%Y-%m-%d")
            
            # Helper to extract value from nested StyledNumber spans or regular text
            def extract_val(cell):
                # Check for lock icon (masked PER/PBR)
                if cell.find(class_=lambda x: x and 'lock' in x.lower()) or 'styles_HistoryContainer__tableData--mask' in str(cell):
                    return None
                    
                val_span = cell.find(class_=lambda x: x and 'value' in x.lower())
                text = val_span.text.strip() if val_span else cell.text.strip()
                
                if not text or text == '-':
                    return None
                return float(text.replace(',', ''))

            open_val = extract_val(cols[1])
            high_val = extract_val(cols[2])
            low_val = extract_val(cols[3])
            close_val = extract_val(cols[4])
            volume_val = extract_val(cols[5])
            adj_close_val = extract_val(cols[6])
            
            per_val = None
            pbr_val = None
            if len(cols) >= 9:
                per_val = extract_val(cols[7])
                pbr_val = extract_val(cols[8])
                
            data_list.append({
                "Date": formatted_date,
                "Open": open_val,
                "High": high_val,
                "Low": low_val,
                "Close": close_val,
                "Volume": volume_val,
                "Adj Close": adj_close_val,
                "PER": per_val,
                "PBR": pbr_val
            })
        except Exception as e:
            continue
            
    if not data_list:
        raise ValueError("No valid rows could be parsed from the HTML table.")
        
    df = pd.DataFrame(data_list)
    df.set_index("Date", inplace=True)
    df.index = pd.to_datetime(df.index)
    df.sort_index(ascending=True, inplace=True)
    
    # Fill missing values using interpolation for technicals if necessary
    df['Close'] = df['Close'].ffill().bfill()
    
    return df

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "No arguments provided"}))
        return

    # Check for --html mode
    html_mode = False
    if sys.argv[1] == "--html":
        html_mode = True
        if len(sys.argv) < 3:
            print(json.dumps({"success": False, "error": "No HTML content provided"}))
            return
        html_source = sys.argv[2]
    else:
        raw_ticker = sys.argv[1]

    try:
        if html_mode:
            # If html_source is a filepath, read it. Otherwise treat as raw html.
            try:
                with open(html_source, 'r', encoding='utf-8') as f:
                    html_content = f.read()
            except:
                html_content = html_source
                
            df = parse_yfinance_html(html_content)
            ticker = "PASTED_HTML"
            meta = {
                "name": "Pasted HTML Stock Data",
                "symbol": "PASTED",
                "currency": "JPY",
                "sector": "Pasted Data",
                "industry": "User Uploaded",
                "website": "",
                "summary": "This stock data was imported from pasted HTML source.",
                "market_cap": None,
                "pe_ratio": None,
                "dividend_yield": None,
            }
        else:
            # Helper: Auto-append .T for Japanese Stock Codes (4 digits)
            ticker = raw_ticker
            if raw_ticker.isdigit() and len(raw_ticker) == 4:
                ticker = f"{raw_ticker}.T"
                
            stock = yf.Ticker(ticker)
            df = stock.history(period="2y")
            
            if df.empty:
                print(json.dumps({"success": False, "error": f"No historical data found for symbol: {ticker}"}))
                return
                
            # Remove timezone information from index to match naive datetimes
            if df.index.tz is not None:
                df.index = df.index.tz_localize(None)

        # Add technical analysis indicators
        df = calculate_technical_indicators(df)
        
        # Calculate Risk/Quant metrics
        quant_metrics = calculate_quant_metrics(df)
        
        # Run Monte Carlo Forecast
        forecast = run_monte_carlo_simulation(df, horizon=30)
        
        # For HTML mode, if PER/PBR columns don't exist, create them
        if 'PER' not in df.columns:
            df['PER'] = np.nan
        if 'PBR' not in df.columns:
            df['PBR'] = np.nan
            
        if not html_mode:
            # Fetch valuation data from Yahoo Finance JP
            val_map = scrape_yahoo_finance_jp_valuation(ticker, max_pages=2)
            for date_str, (per, pbr) in val_map.items():
                try:
                    ts = pd.Timestamp(date_str)
                    if ts in df.index:
                        df.at[ts, 'PER'] = per
                        df.at[ts, 'PBR'] = pbr
                except:
                    pass
                    
        # Slice df to the last 1 year (approx 252 trading days) to send to UI
        df_sliced = df.iloc[-252:]
        
        # Format historical data for UI
        history_list = []
        for index, row in df_sliced.iterrows():
            history_list.append({
                "date": index.strftime('%Y-%m-%d'),
                "open": round(float(row['Open']), 2) if not pd.isna(row['Open']) else None,
                "high": round(float(row['High']), 2) if not pd.isna(row['High']) else None,
                "low": round(float(row['Low']), 2) if not pd.isna(row['Low']) else None,
                "close": round(float(row['Close']), 2) if not pd.isna(row['Close']) else None,
                "volume": int(row['Volume']) if not pd.isna(row['Volume']) else None,
                "sma_25": round(float(row['SMA_25']), 2) if not pd.isna(row['SMA_25']) else None,
                "sma_75": round(float(row['SMA_75']), 2) if not pd.isna(row['SMA_75']) else None,
                "sma_200": round(float(row['SMA_200']), 2) if not pd.isna(row['SMA_200']) else None,
                "bb_upper": round(float(row['BB_Upper']), 2) if not pd.isna(row['BB_Upper']) else None,
                "bb_middle": round(float(row['BB_Middle']), 2) if not pd.isna(row['BB_Middle']) else None,
                "bb_lower": round(float(row['BB_Lower']), 2) if not pd.isna(row['BB_Lower']) else None,
                "rsi_14": round(float(row['RSI_14']), 2) if not pd.isna(row['RSI_14']) else None,
                "macd": round(float(row['MACD']), 4) if not pd.isna(row['MACD']) else None,
                "macd_signal": round(float(row['MACD_Signal']), 4) if not pd.isna(row['MACD_Signal']) else None,
                "macd_hist": round(float(row['MACD_Hist']), 4) if not pd.isna(row['MACD_Hist']) else None,
                "per": round(float(row['PER']), 2) if not pd.isna(row['PER']) else None,
                "pbr": round(float(row['PBR']), 2) if not pd.isna(row['PBR']) else None,
            })
            
        if not html_mode:
            info = stock.info
            meta = {
                "name": info.get("longName", ticker),
                "symbol": ticker,
                "currency": info.get("currency", "JPY"),
                "sector": info.get("sector", "Unknown"),
                "industry": info.get("industry", "Unknown"),
                "website": info.get("website", ""),
                "summary": info.get("longBusinessSummary", ""),
                "market_cap": info.get("marketCap", None),
                "pe_ratio": info.get("trailingPE", None),
                "dividend_yield": info.get("dividendYield", None),
            }
        
        output = {
            "success": True,
            "meta": meta,
            "metrics": quant_metrics,
            "history": history_list,
            "forecast": forecast
        }
        
        print(json.dumps(output))
        
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))

if __name__ == "__main__":
    main()
