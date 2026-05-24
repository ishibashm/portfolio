import tkinter as tk
from tkinter import ttk, messagebox
import webbrowser

def open_chart():
    symbol = symbol_var.get()
    if symbol:
        # TradingViewのティッカーURLを開く
        url = f"https://jp.tradingview.com/chart/?symbol={symbol}"
        webbrowser.open(url)
    else:
        messagebox.showwarning("警告", "ティッカーシンボルや企業名を入力してください")

root = tk.Tk()
root.title("📈 企業業績＆チャート確認")
root.geometry("400x200")

ttk.Label(root, text="確認したい企業のティッカー (例: TSE:6838) を入力", font=("", 11)).pack(pady=20)
symbol_var = tk.StringVar()
ttk.Entry(root, textvariable=symbol_var, width=30).pack(pady=10)
ttk.Button(root, text="チャートを開く", command=open_chart).pack(pady=10)

root.mainloop()
