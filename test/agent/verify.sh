#!/bin/bash
# usage: verify.sh <dir containing index.html>   exit 0 = every screen balanced (judged by the tool, not by the agent)
cd "$(dirname "$0")/../.." && node src/cli.js "file://$(cd "$1" && pwd)/index.html" "${@:2}"
