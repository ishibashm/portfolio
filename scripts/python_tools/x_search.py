import tkinter as tk
from tkinter import ttk, messagebox
import webbrowser

def open_x_search():
    query = search_var.get()
    if query:
        url = f"https://x.com/search?q={query}&src=typed_query"
        webbrowser.open(url)
    else:
        messagebox.showwarning("警告", "検索キーワードを入力してください")

root = tk.Tk()
root.title("X 情報収集＆企業名検索")
root.geometry("400x200")

ttk.Label(root, text="X (旧Twitter) で情報や企業名を検索します", font=("", 11)).pack(pady=20)
search_var = tk.StringVar()
ttk.Entry(root, textvariable=search_var, width=40).pack(pady=10)
ttk.Button(root, text="Xで検索する", command=open_x_search).pack(pady=10)

root.mainloop()
