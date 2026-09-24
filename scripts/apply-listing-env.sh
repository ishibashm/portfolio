#!/usr/bin/env bash
set -eu
# ENV_FILE は書き込み専用なので、個別設定がある場合だけ末尾へ追記する。
# 値は標準出力へ出さない。未設定で既存値を消さず、false は明示的に反映する。
for key in \
  LISTING_EMAIL_GMAIL_ENABLED \
  LISTING_EMAIL_GOOGLE_CLIENT_ID \
  LISTING_EMAIL_GOOGLE_CLIENT_SECRET \
  LISTING_EMAIL_GOOGLE_REDIRECT_URI \
  LISTING_EMAIL_ENCRYPTION_KEY \
  LISTING_EMAIL_ENCRYPTION_KEY_ID \
  LISTING_CANDIDATE_GSI_ENABLED
do
  if [ -n "${!key:-}" ]; then
    printf '\n%s=%s\n' "$key" "${!key}" >> .env
  fi
done
