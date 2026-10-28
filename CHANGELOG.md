# Changelog

## 0.1.1 - 2026-10-28

### Security: dependency and Node updates, 2026-10-28

`npm audit` went from 14 findings (2 critical, 9 high, 3 moderate) to 0. Behaviour is unchanged.

- Node: `engines` is now `^22.23.4 || >=24.22.1` (the lines with the October 21 2026 Node.js security release); README
  and a new CI workflow use Node 24. Node 20 is end of life.
- critical: proxy-addr GHSA-jqcg-44mw-7w3h (via express), form-data GHSA-fjxv-7rqg-78g4 and GHSA-hmw2-7cc7-3qxx.
- high: axios (about 40 advisories, SSRF and proxy bypass, prototype pollution, header injection), @modelcontextprotocol/sdk
  (8, e.g. GHSA-345p-7cg4-v4c7), @anthropic-ai/claude-code (22, e.g. GHSA-ph6w-f82w-28w6; it was only in the stale lockfile, never in package.json or the code, so it is gone from the lock),
  body-parser (GHSA-wqch-xfxh-vrr4, GHSA-v422-hmwv-36x6, GHSA-27r3-jxmh-p828), path-to-regexp (GHSA-j3q9-mxjg-w52f,
  GHSA-27v5-c462-wpq7), ws (GHSA-58qx-3vcg-4xpx, GHSA-96hv-2xvq-fx4p), jws GHSA-869p-cjfg-cm3x, zod GHSA-mrhx-c7xc-m3w5.
- moderate: qs (5, e.g. GHSA-w7fw-mjwx-w883), follow-redirects GHSA-r4q5-vmmm-2653, ajv GHSA-2g4f-4pwh-qvx6.
- Code: the agent name and message ids are now URL-encoded in the inbox polling requests.
- CI: new workflow (build, `npm audit --omit=dev`), `permissions: contents: read`, actions pinned to current majors.
