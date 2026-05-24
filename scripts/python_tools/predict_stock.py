import sys
import json
import yfinance as yf
import pandas as pd
import numpy as np

def generate_gbm_forecast(hist_data, horizon=30, simulations=1000):
    """
    Generates a realistic stock price forecast using Geometric Brownian Motion (GBM)
    based on the historical drift and volatility of the provided data.
    """
    # Calculate daily returns
    returns = hist_data['Close'].pct_change().dropna()
    
    # Calculate historical drift (mu) and volatility (sigma)
    mu = returns.mean()
    sigma = returns.std()
    
    last_price = hist_data['Close'].iloc[-1]
    last_date = hist_data.index[-1]
    
    # Generate business days for the horizon
    future_dates = pd.date_range(start=last_date + pd.Timedelta(days=1), periods=horizon, freq='B')
    
    # Simulate multiple paths
    dt = 1 # 1 day step
    paths = np.zeros((horizon, simulations))
    paths[0] = last_price
    
    for t in range(1, horizon):
        rand = np.random.standard_normal(simulations)
        paths[t] = paths[t-1] * np.exp((mu - 0.5 * sigma**2) * dt + sigma * np.sqrt(dt) * rand)
        
    # Calculate mean and confidence intervals (95%)
    forecast_mean = np.mean(paths, axis=1)
    forecast_lower = np.percentile(paths, 2.5, axis=1)
    forecast_upper = np.percentile(paths, 97.5, axis=1)
    
    forecast = []
    for i in range(horizon):
        forecast.append({
            "step": i + 1,
            "date": future_dates[i].strftime('%Y-%m-%d'),
            "mean": round(float(forecast_mean[i]), 2),
            "lower_bound_95": round(float(forecast_lower[i]), 2),
            "upper_bound_95": round(float(forecast_upper[i]), 2)
        })
        
    return forecast

def run_prediction(ticker_symbol):
    try:
        stock = yf.Ticker(ticker_symbol)
        # Fetch 1 year of data to calculate reliable volatility
        hist = stock.history(period="1y")
        
        if hist.empty:
            return {"success": False, "error": "No history data found"}
            
        # Run realistic Monte Carlo simulation based on the stock's actual volatility
        forecast = generate_gbm_forecast(hist, horizon=30)
            
        return {
            "success": True,
            "ticker": ticker_symbol,
            "forecast": forecast
        }

    except Exception as e:
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) > 1:
        print(json.dumps(run_prediction(sys.argv[1])))
    else:
        print(json.dumps({"success": False, "error": "No ticker provided"}))

