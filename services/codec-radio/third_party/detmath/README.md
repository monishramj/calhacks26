# detmath: glibc 2.39 float math, compiled into the Windows runtime

The codec needs bit-identical logits on every machine. llama.cpp's RoPE calls `sinf` and `cosf`. The softmax and SiLU tails call `expf`. Linux takes these functions from glibc. MinGW's own versions use the x87 `fsincos` instruction, which is microcode. It can give different bits on Intel and AMD CPUs. So a MinGW build would disagree with Linux, and it could disagree between two Windows laptops.

These files are the glibc 2.39 sources (`sysdeps/ieee754/flt-32`, LGPL-2.1+, unmodified) for sinf, cosf, sincosf, expf, logf, and powf. They are compiled the way glibc compiles its x86-64 FMA variants (`-O2 -mfma -mavx2`, GNU C contraction). They are linked into ggml-base.dll and ggml-cpu.dll. So the Windows DLLs compute these functions exactly as glibc does on an FMA-capable x86-64 CPU. `shim/` maps the few glibc-internal macros that the sources use.

`tools/runtime-build/build_runtime.sh` builds the DLLs. `tools/runtime-build/detmath_check.c` compares every float input against the system glibc.
