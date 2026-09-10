#!/usr/bin/env bash
#
# GitHub Actions で Playwright の Chromium を入れる。**5 つの巡回ワークフローが
# 同じ手順を写していた**ので、ここに 1 つにした。
#
# ## 上限と再試行（2026-08-19 の大阪）
#
# `npx playwright install --with-deps chromium` が apt の待ちで固まり、
# ジョブの持ち時間 6 時間を丸ごと溶かした実績がある
# （run 32292215100 / job 96195720004）。8 分で切って 3 回やり直す。
#
# ## 同じ手順が「一瞬で 3 回落ちる」ことがある（2026-09-10 の新潟）
#
# `--with-deps` は apt-get update を回す。ランナーに入っている**他社の
# リポジトリ**（packages.microsoft.com）が 403 を返すと、Chromium と
# 無関係なのに update ごと落ちる（exit 100）。同じコマンドを 4 秒で 3 回
# 繰り返して「8 分で終わらなかった」と書いて終わり、**新潟はその晩を
# 丸ごと失った**（run 34408211173）。3 日周期の県なので次は 3 日後。
#
# 直し方は 2 段。
#
# 1. 落ちたら、その他社リポジトリの一覧を退かしてからやり直す。ランナーは
#    使い捨てなので戻す必要は無い。Chromium の依存は Ubuntu 本体の
#    リポジトリにしか無い
# 2. それでも入らなければ、**依存を入れずにブラウザだけ**入れる。
#    ubuntu-latest には Chrome が入っていて共有ライブラリは揃っている。
#    それでも起動できなければ、巡回本体が launch で落ちるので分かる
#
# 何で落ちたかは exit code と経過秒で書く。「8 分で終わらなかった」は
# timeout（124）のときだけ。

set -u

ATTEMPTS=3
MS_LIST=/etc/apt/sources.list.d/microsoft-prod.list

warn() { echo "::warning::$*"; }

for i in $(seq 1 "$ATTEMPTS"); do
  started=$(date +%s)
  if timeout 8m npx playwright install --with-deps chromium; then
    exit 0
  fi
  rc=$?
  elapsed=$(( $(date +%s) - started ))
  if [ "$rc" -eq 124 ]; then
    warn "playwright install が 8 分で終わらなかった（${i} 回目）。やり直す。"
  else
    warn "playwright install が exit ${rc} で落ちた（${i} 回目、${elapsed} 秒）。やり直す。"
  fi
  if [ -f "$MS_LIST" ]; then
    warn "apt の他社リポジトリ（$(basename "$MS_LIST")）を退かしてからやり直す。Chromium の依存には要らない。"
    sudo mv "$MS_LIST" "$MS_LIST.disabled" || true
  fi
done

warn "依存の導入が ${ATTEMPTS} 回とも失敗した。ブラウザだけ入れて続ける（ランナーの Chrome の共有ライブラリに頼る）。"
if timeout 8m npx playwright install chromium; then
  exit 0
fi

echo "::error::playwright install が ${ATTEMPTS} 回と、依存なしの 1 回、すべて失敗した。"
exit 1
