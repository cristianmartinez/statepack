#!/bin/sh
set -eu
cd "$(dirname "$0")"
ZIG_BIN=${ZIG:-zig}
mkdir -p zig-out/bin
if [ "$(uname -s)" = Darwin ]; then
  # The system linker also supports macOS SDK versions newer than Zig's linker.
  "$ZIG_BIN" build-obj src/main.zig -fcompiler-rt -femit-bin=zig-out/runtime.o
  clang zig-out/runtime.o -o zig-out/bin/statepack-zig
else
  "$ZIG_BIN" build
fi
