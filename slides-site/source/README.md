# スライドのソースファイル

このディレクトリには、プレゼンテーションのソース素材が含まれています。
**これらのファイルは公開されません**（`public/` ディレクトリの外にあります）。

## ファイル一覧

### 最近のあれこれ_v4.pptx
- プレゼンテーションの PowerPoint ファイル（v4）
- BIZ UDPGothic フォントを使用
- 14枚のスライド
- 配信されるのは `public/presentation.pptx` として配置されたコピー

### NOTES.md
- プレゼンテーション全体のノート
- スライドごとの詳細な説明と文脈

### script.txt
- プレゼンテーションの原稿（話す内容）
- スライドごとに整理された台本

### script_tts.txt
- TTS（Text-to-Speech）用に最適化された原稿
- 音声合成用の読みやすい形式

### notes/
- スライド生成用のビルドスクリプトとメタデータ
- 各スライドグループ（g1〜g5）ごとのビルドスクリプト
- v4 用のスクリプト生成スクリプト（`v4_script.py`、`v4_build.py`）
- 旧バージョンの生成スクリプト（`v2-generators/`）

#### notes/ の主なファイル
- `g1_build.py` 〜 `g5_build.py`: 各スライドグループのビルドスクリプト
- `g1.md` 〜 `g5.md`: 各スライドグループのメタデータ
- `v3_lib.py`: v3 で使用していた共通ライブラリ
- `v4_build.py`: v4 用のビルドスクリプト
- `v4_script.py`: v4 用のスクリプト生成スクリプト
- `v2-generators/`: v2 で使用していた生成スクリプト

## セキュリティ

これらのファイルは `slides-site/public/` ディレクトリの外にあるため、
Next.js のビルドでは静的アセットとして配信されません。

ただし、このリポジトリ（ishibashm/portfolio）は**公開リポジトリ**のため、
GitHub 上でこれらのファイルは誰でも閲覧可能です。

## 使用方法

これらのファイルはプレゼンテーションの作成履歴と内容の記録として保管されており、
実際の配信サイト（slides.cloud-palette.com）には含まれません。

スライドの内容を変更する場合は、PowerPoint ファイルを編集した後、
以下の手順で画像を再生成してください:

```bash
# BIZ UDPGothic フォントがインストールされていることを確認
fc-list | grep "BIZ"

# PowerPoint を PDF に変換
libreoffice --headless --convert-to pdf "最近のあれこれ_v4.pptx"

# PDF を PNG 画像に変換（親ディレクトリの public/slides/ に出力）
cd ../public/slides
pdftoppm -png "../../source/最近のあれこれ_v4.pdf" slide

# 変更を確認
ls -lh
```
