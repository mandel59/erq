#!/bin/sh
set -eux

tmpdir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmpdir"
}
trap cleanup EXIT INT TERM

export NPM_CONFIG_CACHE="$tmpdir/npm-cache"
export npm_config_cache="$NPM_CONFIG_CACHE"

package="$(npm pack --pack-destination "$tmpdir" | tail -n1 | tr -d '\r')"
npm --prefix=erq-ci install --no-save --no-audit --no-fund "$tmpdir/$package"
npm --prefix=erq-ci run test
