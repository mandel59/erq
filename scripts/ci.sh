#!/bin/sh
set -eux
package="$(npm pack)"
npm --prefix=erq-ci install "$package"
npm --prefix=erq-ci run test
