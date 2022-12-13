#!/bin/sh

echo "Starting MEV-Boost"
echo "Network: ${NETWORK}"
echo "Relays: ${RELAYS}"
echo "Extra opts: ${EXTRA_OPTS}"

exec /app/mev-boost -${NETWORK} -addr 0.0.0.0:18550 -relay-check -relays ${RELAYS} ${EXTRA_OPTS}