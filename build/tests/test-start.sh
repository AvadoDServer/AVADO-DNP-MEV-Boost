#!/bin/sh
# Tests for build/start.sh. Runs with plain sh (the image uses /bin/sh), from the repo root:
#   sh build/tests/test-start.sh
# A stub replaces /app/mev-boost (through MEV_BOOST_BIN) and records the arguments it gets.
# Set TEST_SH to run start.sh with another shell, for example TEST_SH=dash.

set -u

TEST_SH=${TEST_SH:-sh}
HERE=$(cd "$(dirname "$0")" && pwd)
START_SH="${HERE}/../start.sh"

TMP=$(mktemp -d "${TMPDIR:-/tmp}/test-start.XXXXXX") || exit 1
trap 'rm -rf "${TMP}"' EXIT INT TERM

STUB="${TMP}/mev-boost"
ARGS="${TMP}/args"
OUT="${TMP}/out"
cat > "${STUB}" <<STUB_EOF
#!/bin/sh
: > "${ARGS}"
for arg in "\$@"; do
  printf '%s\n' "\${arg}" >> "${ARGS}"
done
STUB_EOF
chmod +x "${STUB}"

# A retired host taken from start.sh itself, so the test follows relays.json.
RETIRED_HOST=$(sed -n 's/^DEAD_RELAY_HOSTS="\([^ "]*\).*/\1/p' "${START_SH}")
RETIRED_URL="https://0x8b5d2e73e2a3a55c6c87b8b6eb92e0149a125c852751db1422fa951e42a09b82c142c3ea98d0d9930b056a3bc9896b8f@${RETIRED_HOST}"
LIVE_HOST="relay.example.org"
LIVE_URL="https://0xa1559ace749633b997cb3fdacffb890aeebdb0f5a3b6aaa7eeeaf1a38af0a8fe88b9e4b1f61f236d2e64d95733327a62@${LIVE_HOST}"

FAILED=0
CASE=""

fail() {
  echo "  FAIL: $1"
  FAILED=1
}

# run_start RELAYS EXTRA_OPTS: runs start.sh, sets STATUS; output in $OUT, stub args in $ARGS.
run_start() {
  rm -f "${ARGS}" "${OUT}"
  MEV_BOOST_BIN="${STUB}" NETWORK=mainnet RELAYS="$1" EXTRA_OPTS="$2" \
    "${TEST_SH}" "${START_SH}" > "${OUT}" 2>&1
  STATUS=$?
}

expect_output() {
  grep -qF -- "$1" "${OUT}" || fail "output does not contain \"$1\""
}

# Prints the value after each occurrence of flag $1 in the stub's arguments.
values_of() {
  awk -v flag="$1" 'take { print; take = 0; next } $0 == flag { take = 1 }' "${ARGS}"
}

show_on_failure() {
  if [ "${FAILED}" -ne 0 ]; then
    echo "  --- start.sh output ---"
    sed 's/^/  | /' "${OUT}" 2>/dev/null
    if [ -f "${ARGS}" ]; then
      echo "  --- mev-boost arguments ---"
      sed 's/^/  | /' "${ARGS}"
    fi
  fi
}

begin() {
  CASE=$1
  FAILED_BEFORE=${FAILED}
  FAILED=0
}

end() {
  show_on_failure
  if [ "${FAILED}" -eq 0 ]; then
    echo "ok - ${CASE}"
  else
    echo "not ok - ${CASE}"
  fi
  FAILED=$((FAILED_BEFORE | FAILED))
}

if [ -z "${RETIRED_HOST}" ]; then
  echo "not ok - could not read a retired host from DEAD_RELAY_HOSTS in ${START_SH}"
  exit 1
fi
case " $(sed -n 's/^DEAD_RELAY_HOSTS="\(.*\)"$/\1/p' "${START_SH}") " in
  *" ${LIVE_HOST} "*) echo "not ok - ${LIVE_HOST} is listed as retired in start.sh"; exit 1 ;;
esac

begin "one live and one retired relay, no extra options"
run_start "${LIVE_URL},${RETIRED_URL}" ""
[ "${STATUS}" -eq 0 ] || fail "start.sh exited with ${STATUS}"
if [ -f "${ARGS}" ]; then
  [ "$(grep -cx -- '-relays' "${ARGS}")" -eq 1 ] || fail "mev-boost did not get exactly one -relays flag"
  [ "$(values_of -relays)" = "${LIVE_URL}" ] || fail "-relays value is \"$(values_of -relays)\", expected the live relay only"
  ! grep -qx -- '-min-bid' "${ARGS}" || fail "-min-bid was passed although EXTRA_OPTS is empty"
else
  fail "mev-boost stub was not started"
fi
expect_output "Skipping retired relay: ${RETIRED_HOST}"
expect_output "Relays in use: 1"
end

begin "EXTRA_OPTS=-min-bid 0.05 is passed through"
run_start "${LIVE_URL},${RETIRED_URL}" "-min-bid 0.05"
[ "${STATUS}" -eq 0 ] || fail "start.sh exited with ${STATUS}"
if [ -f "${ARGS}" ]; then
  [ "$(values_of -min-bid)" = "0.05" ] || fail "-min-bid 0.05 was not passed to mev-boost"
  [ "$(values_of -relays)" = "${LIVE_URL}" ] || fail "-relays value is \"$(values_of -relays)\", expected the live relay only"
else
  fail "mev-boost stub was not started"
fi
end

begin "only retired relays stops with an error"
run_start "${RETIRED_URL}" ""
[ "${STATUS}" -eq 1 ] || fail "start.sh exited with ${STATUS}, expected 1"
[ ! -f "${ARGS}" ] || fail "mev-boost was started without usable relays"
expect_output "Skipping retired relay: ${RETIRED_HOST}"
expect_output "Relays in use: 0"
expect_output "no usable relays"
end

if [ "${FAILED}" -ne 0 ]; then
  echo "FAILED"
  exit 1
fi
echo "All start.sh tests passed"
