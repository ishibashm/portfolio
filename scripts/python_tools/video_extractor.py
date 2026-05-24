import tkinter as tk
from tkinter import filedialog, messagebox, ttk
import cv2
import os
import threading
from datetime import datetime

class VideoExtractorApp:
    def __init__(self, root):
        self.root = root
        self.root.title("🎬 動画フレーム抽出ツール")
        self.root.geometry("500x350")
        self.root.resizable(False, False)

        main_frame = ttk.Frame(root, padding="20")
        main_frame.pack(fill=tk.BOTH, expand=True)

        ttk.Label(main_frame, text="動画ファイル(.mp4等)を選択し、\n1秒ごとに画像を抽出します。", justify=tk.CENTER, font=("", 11)).pack(pady=(0, 20))

        self.file_path_var = tk.StringVar()
        file_frame = ttk.Frame(main_frame)
        file_frame.pack(fill=tk.X, pady=(0, 20))
        
        ttk.Entry(file_frame, textvariable=self.file_path_var, state="readonly", width=40).pack(side=tk.LEFT, padx=(0, 10))
        ttk.Button(file_frame, text="ファイル選択", command=self.select_file).pack(side=tk.RIGHT)

        self.output_dir_var = tk.StringVar()
        self.output_dir_var.set("")
        
        dir_frame = ttk.Frame(main_frame)
        dir_frame.pack(fill=tk.X, pady=(0, 20))
        ttk.Label(dir_frame, text="保存先:").pack(side=tk.LEFT)
        ttk.Entry(dir_frame, textvariable=self.output_dir_var, state="readonly", width=45).pack(side=tk.LEFT, padx=(10, 0))

        self.extract_btn = ttk.Button(main_frame, text="▶ フレーム抽出を開始", command=self.start_extraction)
        self.extract_btn.pack(pady=(0, 20), ipady=5, fill=tk.X)

        self.progress = ttk.Progressbar(main_frame, orient=tk.HORIZONTAL, mode='determinate')
        self.progress.pack(fill=tk.X)

        self.status_var = tk.StringVar()
        self.status_var.set("待機中...")
        ttk.Label(main_frame, textvariable=self.status_var).pack(pady=(10, 0))

    def select_file(self):
        filepath = filedialog.askopenfilename(
            title="動画ファイルを選択",
            filetypes=[("動画ファイル", "*.mp4 *.avi *.mov *.mkv"), ("すべてのファイル", "*.*")]
        )
        if filepath:
            self.file_path_var.set(filepath)
            video_dir = os.path.dirname(filepath)
            video_name = os.path.splitext(os.path.basename(filepath))[0]
            out_dir = os.path.join(video_dir, f"{video_name}_frames")
            self.output_dir_var.set(out_dir)

    def start_extraction(self):
        video_path = self.file_path_var.get()
        if not video_path:
            messagebox.showwarning("警告", "動画ファイルを選択してください。")
            return
            
        output_dir = self.output_dir_var.get()
        os.makedirs(output_dir, exist_ok=True)

        self.extract_btn.config(state=tk.DISABLED)
        self.progress['value'] = 0
        self.status_var.set("動画を読み込み中...")

        thread = threading.Thread(target=self.extract_frames, args=(video_path, output_dir))
        thread.daemon = True
        thread.start()

    def extract_frames(self, video_path, output_dir):
        try:
            cap = cv2.VideoCapture(video_path)
            if not cap.isOpened():
                self.root.after(0, lambda: self.on_error("動画ファイルを開けませんでした。"))
                return

            fps = cap.get(cv2.CAP_PROP_FPS)
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            if fps == 0 or fps != fps: fps = 30

            frame_interval = int(fps)
            if frame_interval <= 0: frame_interval = 30

            extracted_count = 0
            video_name = os.path.basename(video_path).split('.')[0]
            ts = datetime.now().strftime("%H%M%S")

            success = True
            current_frame = 0

            self.root.after(0, lambda: self.progress.config(maximum=total_frames))

            while success:
                success, frame = cap.read()
                if not success:
                    break
                    
                if current_frame % frame_interval == 0:
                    second = current_frame // fps
                    out_filename = f"{video_name}_{ts}_sec{int(second):04d}.jpg"
                    out_path = os.path.join(output_dir, out_filename)
                    cv2.imwrite(out_path, frame)
                    extracted_count += 1
                    self.root.after(0, lambda c=current_frame, e=extracted_count: self.update_progress(c, e))
                    
                current_frame += 1

            cap.release()
            self.root.after(0, lambda: self.on_complete(extracted_count, output_dir))

        except Exception as e:
            self.root.after(0, lambda: self.on_error(str(e)))

    def update_progress(self, current_frame, extracted_count):
        self.progress['value'] = current_frame
        self.status_var.set(f"抽出中... ({extracted_count}枚保存しました)")

    def on_error(self, err_msg):
        self.extract_btn.config(state=tk.NORMAL)
        self.status_var.set("エラーが発生しました。")
        messagebox.showerror("エラー", f"抽出中にエラーが発生しました:\n{err_msg}")

    def on_complete(self, count, output_dir):
        self.progress['value'] = self.progress['maximum']
        self.extract_btn.config(state=tk.NORMAL)
        self.status_var.set("完了しました！")
        messagebox.showinfo("抽出完了", f"{count} 枚の画像を保存しました。\n\n保存先:\n{output_dir}")
        os.startfile(output_dir)

if __name__ == "__main__":
    root = tk.Tk()
    style = ttk.Style()
    style.theme_use('clam')
    app = VideoExtractorApp(root)
    root.mainloop()
