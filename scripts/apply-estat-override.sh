#!/bin/bash
# 書き出した .env の ESTAT_APP_ID を、Secret ESTAT_APP_ID で置き換える。
# ENV_FILE 本体には触らない（apply-db-override.sh と同じ考え方）。
#
# 2026-10-17 に e-Stat の appId を入れ替えた。新しい値は Secret ESTAT_APP_ID
# にあり、ENV_FILE の中の古い値は e-Stat 側で消す。ENV_FILE は書き込み専用で
# 中身を読めず、入れ直すと他のキーを取りこぼすので、書き出した後の .env だけを
# 差し替える。
#
# 空なら何もしない（ENV_FILE の値をそのまま使う）。値はログに出さない。
set -euo pipefail

if [ ! -f .env ]; then
  echo "::error::.env が無い。ENV_FILE の書き出しより後で呼ぶこと。"
  exit 1
fi

if [ -z "${ESTAT_APP_ID_OVERRIDE:-}" ]; then
  echo "::warning::Secret ESTAT_APP_ID が未設定。ENV_FILE の ESTAT_APP_ID をそのまま使う。"
  exit 0
fi

# 既存の行を消してから足す。同じキーが 2 度現れる .env を作らない。
sed -i '/^ESTAT_APP_ID=/d; /^export ESTAT_APP_ID=/d' .env
printf 'ESTAT_APP_ID=%s\n' "$ESTAT_APP_ID_OVERRIDE" >> .env
echo "ESTAT_APP_ID を Secret ESTAT_APP_ID の値で上書きした"
