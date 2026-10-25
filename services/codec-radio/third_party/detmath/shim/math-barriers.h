#pragma once
/* Same definitions as glibc's generic math-barriers.h. */
#define math_opt_barrier(x) ({ __typeof (x) __x = (x); __asm__ ("" : "+m" (__x)); __x; })
#define math_force_eval(x) ({ __typeof (x) __x = (x); __asm__ __volatile__ ("" : : "m" (__x)); })
