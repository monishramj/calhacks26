/* Exhaustive check: detmath (dm_*) vs the system glibc libm, every 32-bit float input. Linux x86-64 only. */
#define _GNU_SOURCE
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
float dm_sinf(float), dm_cosf(float), dm_expf(float), dm_logf(float), dm_powf(float, float);
void dm_sincosf(float, float *, float *);
static uint32_t bits(float f) { uint32_t u; memcpy(&u, &f, 4); return u; }
static int same(float a, float b) { return (isnan(a) && isnan(b)) || bits(a) == bits(b); }
int main(int argc, char **argv) {
  uint64_t step = argc > 1 ? strtoull(argv[1], 0, 10) : 1, bad[6] = {0}, n = 0;
  for (uint64_t i = 0; i < (1ull << 32); i += step, n++) {
    uint32_t u = (uint32_t) i; float x; memcpy(&x, &u, 4);
    float s1, c1; dm_sincosf(x, &s1, &c1);
    float s2, c2; sincosf(x, &s2, &c2);
    bad[0] += !same(dm_sinf(x), sinf(x)); bad[1] += !same(dm_cosf(x), cosf(x));
    bad[2] += !same(s1, s2) || !same(c1, c2); bad[3] += !same(dm_expf(x), expf(x)); bad[4] += !same(dm_logf(x), logf(x));
    bad[5] += !same(dm_powf(10000.0f, x), powf(10000.0f, x)) + !same(dm_powf(x, 0.5f), powf(x, 0.5f));
  }
  printf("inputs=%llu mismatches: sinf=%llu cosf=%llu sincosf=%llu expf=%llu logf=%llu powf=%llu\n", (unsigned long long) n,
         (unsigned long long) bad[0], (unsigned long long) bad[1], (unsigned long long) bad[2], (unsigned long long) bad[3],
         (unsigned long long) bad[4], (unsigned long long) bad[5]);
  return (bad[0] | bad[1] | bad[2] | bad[3] | bad[4] | bad[5]) ? 1 : 0;
}
