# detmath: glibc 2.39 float math, compiled into the Windows runtime

The codec needs bit-identical logits on every machine. llama.cpp's RoPE calls `sinf`/`cosf`, and the softmax/SiLU
tails call `expf`. Linux takes these from glibc. MinGW's own versions use x87 `fsincos`, which is microcode and can
give different bits on Intel and AMD CPUs, so a MinGW build would disagree with Linux and could disagree between two
Windows laptops.

These files are the glibc 2.39 sources (`sysdeps/ieee754/flt-32`, LGPL-2.1+, unmodified) for sinf, cosf, sincosf,
expf, logf and powf. They are compiled the way glibc compiles its x86-64 FMA variants (`-O2 -mfma -mavx2`, GNU C
contraction) and linked into ggml-base.dll and ggml-cpu.dll, so the Windows DLLs compute these functions exactly as
glibc does on an FMA-capable x86-64 CPU. `shim/` maps the few glibc-internal macros the sources use.

`tools/runtime-build/build_runtime.sh` builds the DLLs; `tools/runtime-build/detmath_check.c` compares every float input against the system glibc.
