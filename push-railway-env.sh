#!/bin/sh
# Pushes non-empty values from .env.railway to the Railway SURRAG service.
export PATH="/c/Users/prati/AppData/Roaming/npm:$PATH"
args=""
while IFS= read -r line; do
  case "$line" in ''|\#*) continue;; esac
  [ -n "${line#*=}" ] && set -- "$@" "$line"
done < .env.railway
railway variable set --service SURRAG --skip-deploys "$@"
