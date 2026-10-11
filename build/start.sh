#!/bin/sh

echo "Starting MEV-Boost"

# The binary from the upstream image. The tests point this at a stub.
MEV_BOOST_BIN=${MEV_BOOST_BIN:-/app/mev-boost}

# Drop relays that have been shut down. New installs get the current list from
# dappnode_package.json, but existing installs keep their persisted RELAYS value,
# which still names relays that no longer resolve. Without this, mev-boost logs a
# connection error for each one on every status check.
DEAD_RELAY_HOSTS="bloxroute.max-profit.blxrbdn.com bloxroute.ethical.blxrbdn.com builder-relay-mainnet.blocknative.com mainnet-relay.securerpc.com proof-relay.ponrelay.com"

OLD_IFS=$IFS
IFS=,
set -- ${RELAYS}
IFS=$OLD_IFS

RELAYS_FILTERED=""
for relay in "$@"; do
  [ -z "${relay}" ] && continue
  host=${relay##*@}
  for dead in ${DEAD_RELAY_HOSTS}; do
    if [ "${host}" = "${dead}" ]; then
      echo "Skipping retired relay: ${host}"
      relay=""
      break
    fi
  done
  [ -z "${relay}" ] && continue
  if [ -z "${RELAYS_FILTERED}" ]; then
    RELAYS_FILTERED="${relay}"
  else
    RELAYS_FILTERED="${RELAYS_FILTERED},${relay}"
  fi
done

echo "Relays in use: $(printf '%s' "${RELAYS_FILTERED}" | tr ',' '\n' | grep -c .)"

if [ -z "${RELAYS_FILTERED}" ]; then
  echo "ERROR: no usable relays configured. Set RELAYS to at least one active relay."
  exit 1
fi

echo "Network: ${NETWORK}"
echo "Relays: ${RELAYS_FILTERED}"
echo "Extra opts: ${EXTRA_OPTS}"

exec "${MEV_BOOST_BIN}" -${NETWORK} -addr 0.0.0.0:18550 -relay-check -relays ${RELAYS_FILTERED} ${EXTRA_OPTS}
