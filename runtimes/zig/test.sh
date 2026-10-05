#!/bin/sh
set -eu
cd "$(dirname "$0")"
ZIG_BIN=${ZIG:-zig}
mkdir -p zig-out/bin
if [ "$(uname -s)" = Darwin ]; then
  "$ZIG_BIN" test src/runtime.zig -fno-emit-bin -femit-asm=zig-out/tests.s
  ZIG_RUNTIME_LIB=$("$ZIG_BIN" env | sed -n 's/.*"lib_dir": "\(.*\)",/\1/p')
  "$ZIG_BIN" build-obj "$ZIG_RUNTIME_LIB/compiler_rt.zig" -O ReleaseFast -femit-bin=zig-out/compiler_rt.o
  clang zig-out/tests.s zig-out/compiler_rt.o -o zig-out/bin/statepack-zig-tests
  ./zig-out/bin/statepack-zig-tests
else
  "$ZIG_BIN" build test
fi
