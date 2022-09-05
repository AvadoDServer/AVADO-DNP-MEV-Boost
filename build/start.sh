#!/bin/sh

echo "Starting MEV-Boost"
echo "Network: ${NETWORK}"
echo "Relays: ${RELAYS}"

exec /app/mev-boost -${NETWORK} -addr 0.0.0.0:18550 -relay-check -relays ${RELAYS}