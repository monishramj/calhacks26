#!/usr/bin/env bash
# Rebuild services/codec-radio/runtime/{win-x64,linux-x64} from the pinned llama.cpp source (D-005).
# Needs: cmake, gcc, x86_64-w64-mingw32-gcc-posix (Ubuntu: apt install mingw-w64), patchelf.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd); SVC=$(cd "$HERE/../.." && pwd); WORK=${WORK:-/tmp/meshcodec-build}
mkdir -p "$WORK" && cd "$WORK"
pip download --no-deps --no-binary :all: llama-cpp-python==0.3.36 -d sdist -q
echo "832db0699007f1be95a7e41ef12e88926b02ba836461e36a36372db2760c1a2e  sdist/llama_cpp_python-0.3.36.tar.gz" | sha256sum -c
tar xzf sdist/llama_cpp_python-0.3.36.tar.gz; SRC=$WORK/llama_cpp_python-0.3.36/vendor/llama.cpp
# glibc float math for the Windows DLLs (see third_party/detmath/README.md)
D=$SVC/third_party/detmath; mkdir -p detmath && rm -f detmath/*.o
for f in "$D"/*.c; do x86_64-w64-mingw32-gcc-posix -O2 -mfma -mavx2 -std=gnu11 -frounding-math -I"$D/shim" -I"$D" \
  -include "$D/shim/glibc_compat.h" -DSINF=sinf -DCOSF=cosf -DSINCOSF=sincosf -D__expf=expf -D__logf=logf -D__powf=powf \
  -c "$f" -o "detmath/$(basename "$f" .c).o"; done
x86_64-w64-mingw32-ar rcs detmath/libdetmath.a detmath/*.o
sed "s|\"-ffp-contract=off\"|\"-ffp-contract=off -D_WIN32_WINNT=0x0A00 -include $HERE/mingw_compat.h\"|" "$HERE/llama_opts.cmake" > win_opts.cmake
printf 'set(CMAKE_C_STANDARD_LIBRARIES "%s" CACHE STRING "" FORCE)\nset(CMAKE_CXX_STANDARD_LIBRARIES "%s" CACHE STRING "" FORCE)\n' \
  "$WORK/detmath/libdetmath.a" "$WORK/detmath/libdetmath.a" >> win_opts.cmake
cmake -S "$SRC" -B win -C win_opts.cmake -DCMAKE_TOOLCHAIN_FILE="$HERE/mingw-toolchain.cmake" && cmake --build win -j --target llama
cmake -S "$SRC" -B lin -C "$HERE/llama_opts.cmake" && cmake --build lin -j --target llama
W=$SVC/runtime/win-x64; L=$SVC/runtime/linux-x64
cp win/bin/{libllama.dll,ggml.dll,ggml-base.dll,ggml-cpu.dll} "$W/"; x86_64-w64-mingw32-strip --strip-unneeded "$W"/libllama.dll "$W"/ggml*.dll
for f in libllama.so.0 libggml.so.0 libggml-base.so.0 libggml-cpu.so.0; do dst=$f; [ "$f" = libllama.so.0 ] && dst=libllama.so; cp -L "lin/bin/$f" "$L/$dst"; patchelf --set-rpath '$ORIGIN' "$L/$dst"; done
U=$SVC/third_party/unishox2
x86_64-w64-mingw32-gcc-posix -O2 -shared -DUNISHOX_API_WITH_OUTPUT_LEN=1 -o "$W/unishox2.dll" "$U/unishox2.c" "$U/usx_bounded.c" -static-libgcc
gcc -O2 -shared -fPIC -DUNISHOX_API_WITH_OUTPUT_LEN=1 -o "$L/libunishox2.so" "$U/unishox2.c" "$U/usx_bounded.c"
for d in "$W" "$L"; do (cd "$d" && sha256sum $(find . -maxdepth 1 -type f ! -name SHA256SUMS -printf "%f\n" | sort) > SHA256SUMS); done
echo "Rebuilt. Now run python -m tools.bringup --no-radio on every demo machine and compare fingerprints."
