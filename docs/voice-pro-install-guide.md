# Voice-Proのインストールガイド

Voice-Proは、YouTube動画のダウンロード、音声分離、翻訳、多言語ダビングを統合したオープンソースツールです。以下に、GitHubリポジトリに基づくインストール手順をまとめます。

## システム要件
- **OS:** Windows 10/11 (64-bit)、Linux、Mac
- **GPU:** NVIDIA with CUDA 12.4 (推奨)
- **VRAM:** 4GB以上 (8GB以上が好ましい)
- **RAM:** 4GB以上
- **ストレージ:** 20GB以上の空き容量
- **インターネット:** 必要

## 依存関係
- Python 3.10.15
- Torch 2.5.1+cu124
- Gradio 5.14.0
- CUDA 12.4 (NVIDIA GPUの場合)
- ffmpeg
- yt-dlp
- spaCy
- Deep-Translator
- Whisper, Faster-Whisper, Whisper-Timestamped, WhisperX
- Edge-TTS, kokoro, F5-TTS, E2-TTS, CosyVoice

## インストール手順

### 1. パッケージの取得
```bash
git clone https://github.com/abus-aikorea/voice-pro.git
```

### 2. インストールと実行

**Windowsの場合:**
1. `configure.bat` を実行
   - git、ffmpeg、CUDA (NVIDIA GPUの場合) をセットアップ
   - 初回は1時間以上かかる場合あり（インターネット接続必要）
   - コマンドウィンドウを閉じない
2. `start.bat` を実行
   - Voice-ProのWebUIを起動
   - 初回は依存関係のインストールで1時間以上かかる場合あり
   - 問題が発生したら、`installer_files` フォルダを削除して再試行

**Mac/Linuxの場合:**
1. `configure.sh` を実行
2. `start.sh` を実行

### 3. 更新
- Windows: `update.bat` を実行
- Mac/Linux: `update.sh` を実行
- Python環境をリフレッシュ（再インストールより高速）

### 4. アンインストール
- Windows: `uninstall.bat` を実行
- Mac/Linux: `uninstall.sh` を実行
- または、フォルダを削除（ポータブルインストール）

## トラブルシューティング
- **ブラウザが自動的に起動しない場合:**
  - コマンドウィンドウを閉じて、`start.bat` を再実行
  - または、ブラウザで直接 `http://127.0.0.1:7870` を開く

- **CUDA Out-Of-Memory エラー:**
  - WindowsタスクマネージャーのパフォーマンスタブでGPUメモリを確認
  - Denoiseレベルを0または1に設定（レベル2は8GB以上のGPUメモリが必要）
  - Compute Typeをintに設定（floatはメモリを多く使うが品質が高い）

- **一般的な問題:**
  - `installer_files` フォルダを削除して、`configure.bat` を実行後、`start.bat` を再実行

## 注意点
- MacとLinuxでの動作は検証されていない
- 初回起動時はCozyVoice2-0.5B (9GB) をダウンロードするため、1時間以上かかる可能性あり
- 無料版はメディアを60秒までサポート
- 有料版はAzure TTSとTranslator、無制限利用を含む
