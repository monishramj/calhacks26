// Evaluate context (one batch, logits for all) then probe tokens one at a time; write all final-step logits to a file.
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "llama.h"
static char *slurp(const char *p, int *n) { FILE *f = fopen(p, "rb"); fseek(f, 0, SEEK_END); *n = ftell(f); fseek(f, 0, SEEK_SET);
  char *b = malloc(*n + 1); fread(b, 1, *n, f); b[*n] = 0; fclose(f); return b; }
int main(int argc, char **argv) {
  const char *model_path = argv[1], *ctx_path = argv[2], *out_path = argv[3]; int threads = argc > 4 ? atoi(argv[4]) : 2;
  const char *probe = " Water is rising into the school gym on 5th Street, two families on the roof.\n";
  llama_backend_init();
  struct llama_model_params mp = llama_model_default_params(); mp.n_gpu_layers = 0;
  struct llama_model *model = llama_model_load_from_file(model_path, mp);
  if (!model) { fprintf(stderr, "load failed\n"); return 1; }
  struct llama_context_params cp = llama_context_default_params();
  cp.n_ctx = 1024; cp.n_batch = 256; cp.n_threads = threads; cp.n_threads_batch = threads;
  struct llama_context *ctx = llama_init_from_model(model, cp);
  const struct llama_vocab *vocab = llama_model_get_vocab(model); int nv = llama_vocab_n_tokens(vocab);
  int n; char *ctxt = slurp(ctx_path, &n);
  llama_token pre[1024]; int np = llama_tokenize(vocab, ctxt, n, pre, 1024, true, false);
  llama_token body[256]; int nb = llama_tokenize(vocab, probe, strlen(probe), body, 256, false, false);
  FILE *out = fopen(out_path, "wb");
  struct llama_batch b = llama_batch_init(512, 0, 1);
  b.n_tokens = np; for (int i = 0; i < np; i++) { b.token[i] = pre[i]; b.pos[i] = i; b.n_seq_id[i] = 1; b.seq_id[i][0] = 0; b.logits[i] = 1; }
  if (llama_decode(ctx, b)) { fprintf(stderr, "decode failed\n"); return 1; }
  fwrite(llama_get_logits_ith(ctx, np - 1), sizeof(float), nv, out);
  for (int k = 0; k < nb; k++) {
    b.n_tokens = 1; b.token[0] = body[k]; b.pos[0] = np + k; b.n_seq_id[0] = 1; b.seq_id[0][0] = 0; b.logits[0] = 1;
    if (llama_decode(ctx, b)) { fprintf(stderr, "decode failed\n"); return 1; }
    fwrite(llama_get_logits_ith(ctx, 0), sizeof(float), nv, out);
  }
  fclose(out); printf("ctx_tokens=%d probe_tokens=%d vocab=%d\n", np, nb, nv); return 0;
}
