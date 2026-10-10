import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // `--expose-gc` so the scale test in src/geocode.test.ts can force a collection around the
    // heap samples it compares. Without it `global.gc` is undefined, the samples straddle
    // whatever garbage 10,000 rows left uncollected, and the assertion measures GC timing rather
    // than retention: the same run came back anywhere from 40 MB to 122 MB and reddened the gate
    // about half the time. With it the delta is retained heap, ~5-6 MB, run to run.
    poolOptions: { forks: { execArgv: ["--expose-gc"] } },
  },
});
