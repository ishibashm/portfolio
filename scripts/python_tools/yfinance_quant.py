import sys
import json
import math
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
    # Using 252 trading days
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
    # Historical VaR
    hist_var_95 = float(-np.percentile(returns, 5))
    
    # Parametric VaR (Normal Distribution)
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

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "No ticker provided"}))
        return

    raw_ticker = sys.argv[1]
    
    # Helper: Auto-append .T for Japanese Stock Codes (4 digits)
    ticker = raw_ticker
    if raw_ticker.isdigit() and len(raw_ticker) == 4:
        ticker = f"{raw_ticker}.T"
    
    try:
        stock = yf.Ticker(ticker)
        # Fetch 2 years of history to calculate stable indicators like SMA 200
        df = stock.history(period="2y")
        
        if df.empty:
            print(json.dumps({"success": False, "error": f"No historical data found for symbol: {ticker}"}))
            return
            
        # Add technical analysis indicators
        df = calculate_technical_indicators(df)
        
        # Calculate Risk/Quant metrics
        quant_metrics = calculate_quant_metrics(df)
        
        # Run Monte Carlo Forecast
        forecast = run_monte_carlo_simulation(df, horizon=30)
        
        # Slice df to the last 1 year (approx 252 trading days) to send to UI
        df_recent = df.slice_indexer(start=df.index[-252])
        df_sliced = df.iloc[df_recent]
        
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
            })
            
        # Retrieve Meta Information
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
