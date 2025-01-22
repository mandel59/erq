#!/bin/sh
set -eux
package="$(npm pack | tail -n1)"
npm --prefix=erq-ci install "$package"
npm --prefix=erq-ci run test
