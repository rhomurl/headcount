#!/usr/bin/env bash
set -euo pipefail
umask 077

if [[ $# != 2 || "$2" != --allow-testnet-transactions ]]; then
  echo 'Usage: SPONSOR_WALLET=0x… HOST_WALLET=0x… scripts/api-test.sh https://explicit-target --allow-testnet-transactions' >&2
  exit 2
fi
target="${1%/}"
[[ "$target" =~ ^https?:// ]] || { echo 'An explicit http(s) target is required.' >&2; exit 2; }
: "${SPONSOR_WALLET:?Set a test sponsor address}" "${HOST_WALLET:?Set a test host address}"
command -v jq >/dev/null
echo 'WARNING: This script creates/funds/checks in/closes a demo campaign using configured operator testnet transactions. Use Base Sepolia mock hUSDC only.' >&2
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

request() {
  local method="$1" path="$2" expected="$3" status
  if [[ "$method" == POST ]]; then
    status=$(curl --silent --show-error --max-time 120 -o "$work/response.json" -w '%{http_code}' -H 'Content-Type: application/json' -X POST --data-binary "@$work/body.json" "$target$path")
  else
    status=$(curl --silent --show-error --max-time 30 -o "$work/response.json" -w '%{http_code}' "$target$path")
  fi
  [[ "$status" == "$expected" ]] || { echo "FAIL $method $path: expected $expected, received $status (response withheld)" >&2; exit 1; }
}

jq -n --arg sponsor "$SPONSOR_WALLET" --arg host "$HOST_WALLET" '{name:"API test demo",sponsorWallet:$sponsor,hostWallet:$host,perHead:1,cap:2}' > "$work/body.json"
request POST /api/campaigns 200
campaign=$(jq -er '.id' "$work/response.json")
host_pin=$(jq -er '.hostPin' "$work/response.json")
sponsor_pin=$(jq -er '.sponsorPin' "$work/response.json")
jq -n --arg pin "$sponsor_pin" '{sponsorPin:$pin}' > "$work/body.json"
request POST "/api/campaigns/$campaign/fund" 200
jq -n '{name:"Test Guest One",contact:"test-one@example.invalid"}' > "$work/body.json"
request POST "/api/campaigns/$campaign/rsvp" 200
ticket=$(jq -er '.ticketId' "$work/response.json")
request GET "/api/tickets/$ticket/qr" 200
code=$(jq -er '.code' "$work/response.json")
jq -n --arg pin 000000 --arg code "$code" '{hostPin:$pin,code:$code}' > "$work/body.json"
# Use a definitely wrong PIN even if the randomly generated PIN happened to be 000000.
[[ "$host_pin" != 000000 ]] || jq '.hostPin="111111"' "$work/body.json" > "$work/replaced.json"
[[ ! -f "$work/replaced.json" ]] || mv "$work/replaced.json" "$work/body.json"
request POST "/api/campaigns/$campaign/checkin" 401
jq -n --arg pin "$host_pin" '{hostPin:$pin,code:"malformed"}' > "$work/body.json"
request POST "/api/campaigns/$campaign/checkin" 400
jq -n --arg pin "$host_pin" --arg code "$code" '{hostPin:$pin,code:$code}' > "$work/body.json"
request POST "/api/campaigns/$campaign/checkin" 200
confirmed=false
for _ in {1..30}; do
  request GET "/api/campaigns/$campaign/stats" 200
  if jq -e '.pendingCount==0 and .failedCount==0 and .paidUi==1' "$work/response.json" >/dev/null; then confirmed=true; break; fi
  sleep 2
done
[[ "$confirmed" == true ]] || { echo 'FAIL payout did not confirm within 60 seconds (response withheld).' >&2; exit 1; }
request GET "/api/tickets/$ticket/qr" 200
code=$(jq -er '.code' "$work/response.json")
jq -n --arg pin "$host_pin" --arg code "$code" '{hostPin:$pin,code:$code}' > "$work/body.json"
request POST "/api/campaigns/$campaign/checkin" 409
jq -e '.error=="already_checked_in"' "$work/response.json" >/dev/null
jq -n '{name:"Test Guest Two",contact:"test-two@example.invalid"}' > "$work/body.json"
request POST "/api/campaigns/$campaign/rsvp" 200
second=$(jq -er '.ticketId' "$work/response.json")
request GET "/api/tickets/$second/qr" 200
code=$(jq -er '.code' "$work/response.json")
sleep 61
jq -n --arg pin "$host_pin" --arg code "$code" '{hostPin:$pin,code:$code}' > "$work/body.json"
request POST "/api/campaigns/$campaign/checkin" 400
jq -e '.error=="expired"' "$work/response.json" >/dev/null
jq -n --arg pin "$sponsor_pin" '{sponsorPin:$pin}' > "$work/body.json"
request POST "/api/campaigns/$campaign/close" 200
request GET "/api/campaigns/$campaign/stats" 200
jq -e '.status=="closed" and .escrowUi==0' "$work/response.json" >/dev/null
jq -n '{name:"Test Guest Three",contact:"test-three@example.invalid"}' > "$work/body.json"
request POST "/api/campaigns/$campaign/rsvp" 409
echo 'PASS create, fund, RSVP, QR, PIN/malformed rejection, confirmed payout, duplicate, expired code, close and closed RSVP.'
