#!/usr/bin/env bash
#
# staged なファイルのうち、**自分が壊したものだけ**を止める。
#
# ## なぜ素の prettier --check ではだめか
#
# このリポジトリには**元から prettier 非準拠のファイルが 71 個ある**
# （2026-08-22 実測）。素の --check だと、そのうちの 1 つを 1 行直しただけで
# コミットが止まる。
#
# そこで出る案内は「prettier --write を実行してください」だが、**それを
# やると無関係な整形が大量に混ざる。**CLAUDE.md 1 節が繰り返し禁じている
# 操作で、実際に 50 行の巻き添えを出したことがある。
#
# つまり素の --check は、**守れない要求をして回避を強いる**検査だった。
#
# ## どう判定するか
#
# HEAD の版が既に非準拠なら、そのファイルは**見ない**。準拠していた
# ファイルだけを検査する。自分が壊したものだけが止まる。
#
# 新規ファイル（HEAD に無い）は当然すべて検査する。
set -uo pipefail

fail=0
for file in "$@"; do
  # HEAD に無い＝新規。必ず検査する。
  if ! git cat-file -e "HEAD:$file" 2>/dev/null; then
    if ! npx prettier --check "$file" >/dev/null 2>&1; then
      echo "  整形が崩れています（新規）: $file"
      fail=1
    fi
    continue
  fi

  # HEAD の版が既に非準拠なら見ない。元からの負債で止めない。
  if ! git show "HEAD:$file" | npx prettier --check --stdin-filepath "$file" \
      >/dev/null 2>&1; then
    continue
  fi

  # 元は準拠していた。壊していないか見る。
  if ! npx prettier --check "$file" >/dev/null 2>&1; then
    echo "  整形が崩れています: $file"
    fail=1
  fi
done

if [ "$fail" -ne 0 ]; then
  echo
  echo "  触ったファイルだけ整えてください:"
  echo "    npm run format:staged"
  echo
  echo "  npm run format は 71 ファイルを一斉に書き換えるので使わないこと。"
  exit 1
fi
