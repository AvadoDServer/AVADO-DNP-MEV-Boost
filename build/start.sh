#!/bin/sh

echo "Starting MEV-Boost"

# remove obsolete entr(y/ies)
RELAYS_FILTERED="${RELAYS/https:\/\/0xad0a8bb54565c2211cee576363f3a347089d2f07cf72679d16911d740262694cadb62d7fd7483f27afd714ca0f1b9118@bloxroute.ethical.blxrbdn.com,/}"

echo "Network: ${NETWORK}"
echo "Relays: ${RELAYS_FILTERED}"
echo "Extra opts: ${EXTRA_OPTS}"

exec /app/mev-boost -${NETWORK} -addr 0.0.0.0:18550 -relay-check -relays ${RELAYS_FILTERED} ${EXTRA_OPTS}