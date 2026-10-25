/* Force-included before every glibc source in third_party/detmath: maps glibc-internal macros to nothing. */
#pragma once
#define attribute_hidden
#define hidden_def(x)
#define libm_hidden_def(x)
#define strong_alias(a, b)
#define weak_alias(a, b)
#define versioned_symbol(lib, local, symbol, version)
#define libm_alias_float(from, to)
#define libm_alias_float_other(from, to)
#define libm_alias_finite(from, to)
#define WANT_ERRNO 0
#define __glibc_unlikely(c) __builtin_expect((c), 0)
#define __glibc_likely(c) __builtin_expect((c), 1)
#include <stdbool.h>
#include <stdint.h>
#define NOINLINE __attribute__ ((noinline))
/* glibc's issignaling() for float arguments (only e_powf.c uses it, on a float). */
#define issignaling(x) issignalingf_inline (x)
