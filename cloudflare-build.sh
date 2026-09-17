#!/usr/bin/env bash
set -euo pipefail
printf 'THE FATHER ANALYTICS v52.1 static production source\n'
node --check common.js
node --check app.js
node --check member.js
node --check owner.js
node --check status.js
node --check live-markets.js
node --check gold-live.js
python -m json.tool vercel.json >/dev/null
printf 'Static source validation passed.\n'
