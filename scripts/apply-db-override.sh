#!/bin/bash
# 書き出した .env の DATABASE_URL / DIRECT_URL を、Secret DATABASE_URL_OVERRIDE で
# 置き換える。ENV_FILE 本体には触らない。
#
# ENV_FILE は 20 以上のキーを持つ .env 全体で、Secret は後から読み出せない。
# 移行のために作り直すと、そこに入っている他のキー（広告・地図・サイト認証など）を
# 取りこぼす。実際、手元の .env は本番より 15 キー少なかった。
# だから ENV_FILE は触らず、書き出した後の .env だけを差し替える。
#
# 空なら何もしない。切り戻しは Secret を消して再デプロイするだけで済む。
set -euo pipefail

if [ ! -f .env ]; then
  echo "::error::.env が無い。ENV_FILE の書き出しより後で呼ぶこと。"
  exit 1
fi

if [ -z "${DATABASE_URL_OVERRIDE:-}" ]; then
  echo "DB の上書きは未設定。ENV_FILE の接続先をそのまま使う。"
  exit 0
fi

# 既存の行を消してから足す。同じキーが 2 度現れる .env を作らない。
sed -i '/^DATABASE_URL=/d; /^DIRECT_URL=/d' .env
printf 'DATABASE_URL=%s\nDIRECT_URL=%s\n' \
  "$DATABASE_URL_OVERRIDE" "$DATABASE_URL_OVERRIDE" >> .env

# どこを向いたかはログに残したい。ただし資格情報は出さないので、
# host だけを取り出す。取り出せなければ何も出さない（-n と /p の組み合わせ）。
HOST=$(printf '%s' "$DATABASE_URL_OVERRIDE" \
  | sed -nE 's|^[a-z]+://[^@]*@([^:/?]+).*|\1|p')
echo "DB の接続先を上書きした（ホスト: ${HOST:-不明}）"
