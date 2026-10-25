// The module runtime has no global URL. ajv's $ref resolution (fast-uri) only calls
// `new URL('http://' + host)` to ASCII-normalize schema hosts, so this covers exactly that:
// plain ASCII hosts. Anything else throws, which fast-uri reports as a malformed host.
// ponytail: host-only shim; swap for a real URL polyfill if module code ever parses full URLs.
if (typeof (globalThis as any).URL === 'undefined') {
  (globalThis as any).URL = class {
    hostname: string;
    username = '';
    password = '';
    port = '';
    pathname = '/';
    search = '';
    hash = '';
    constructor(input: string) {
      const m = /^http:\/\/([A-Za-z0-9.-]+)$/.exec(input);
      if (!m) throw new TypeError(`unsupported URL in module runtime: ${input.slice(0, 80)}`);
      this.hostname = m[1]!.toLowerCase();
    }
  };
}
