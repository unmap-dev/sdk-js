import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { runAdd, writeIfAbsent } from "./add";
import { runCreate } from "./create";
import { runGeocodeCsv } from "./geocode";
import {
  DEMO_CITIES,
  FRAMEWORKS,
  REGISTRY_BLOCKS,
  REGISTRY_ITEMS,
  generateConfig,
  generateInitSnippet,
  keyStatusFromResponse,
  parseArgs,
  parseBatchOptions,
  resolveRegion,
  serializeConfig,
  verifyUrl,
} from "./index";

const HELP = `unmap - Canadian-first maps platform CLI

Usage:
  unmap init --key <key> [--region <city>] [--gateway <url>]
  unmap add <item...> [--framework <name>] [--registry <url>] [--overwrite] [--dry-run] [--yes]
  unmap create <name> [--framework next|vite|nuxt|vue] [--preset <code>] [--only <items>] [--key <key>] [--theme <code>] [--accent theme|system] [--force]
  unmap geocode csv <input.csv> --query-column <name> --output <out.csv> [options]

init options:
  --key <key>        unmap API key (or set UNMAP_KEY)
  --region <city>    ${DEMO_CITIES.join(" | ")} (default: ${DEMO_CITIES[0]})
  --gateway <url>    gateway base URL (default: the public unmap gateway)

add options:
  <item...>          ${REGISTRY_ITEMS.join(" | ")}
  --framework <name> ${FRAMEWORKS.join(" | ")} (default: detected from package.json)
  --registry <url>   registry base URL (default: https://registry.unmap.dev); passing this
                      explicitly rewrites the entry even if @unmap is already configured
  --overwrite        replace files that already exist
  --dry-run          preview without writing; shadcn-vue 2.8 supports neither --dry-run nor
                      --diff, so on the Vue lane this only prints what it would run
  --yes              skip the shadcn CLI's confirmation prompt

create options:
  <name>             directory to create
  --framework <name> next (default) | vite (React) | nuxt | vue (Vite); asked when omitted
  --preset <code>    a shadcn / shadcn-vue preset name or code, passed to init
  --only <items>     comma-separated items instead of map, geocoder, routing-panel, marker-popup
                      No blocks (${REGISTRY_BLOCKS.slice(0, 3).join(", ")},
                      ${REGISTRY_BLOCKS.slice(3).join(", ")}): create the project, then
                      run unmap add <block> in it
  --key <key>        unmap API key (or set UNMAP_KEY); written to the framework's public env file
  --theme <code>     theme code from unmap.dev/create for the demo page
  --accent <which>   theme | system: whose accent markers and routes take (requires --theme)
  --force            scaffold into a non-empty directory

geocode csv options:
  <input.csv>          the file to read; it is never modified
  --query-column <n>   header name of the column holding addresses (required)
  --output <path>      where the annotated copy goes (required)
  --review-output <p>  a second file with only the rows worth a look
  --checkpoint <path>  resume record (default: <output>.checkpoint.json)
  --estimate           count and validate, send nothing, bill nothing
  --sample <n>         stop after n rows with an address; this DOES send requests
  --resume             continue an existing checkpoint
  --overwrite          replace an existing output
  --rate <n>           requests per second, averaged (default 10, max 100)
  --concurrency <n>    requests in flight at once (default 4, max 16)
  --max-attempts <n>   attempts per row including the first (default 4)
  --lang <code>        result language, e.g. fr
  --spreadsheet-safe   neutralise values a spreadsheet would run as a formula
  --key <key>          API key (or set UNMAP_KEY, or use unmap.config.json)
  --gateway <url>      gateway base URL

  -h, --help         show this help

'geocode csv' geocodes a local CSV. The file stays on this machine; only the
mapped address column is sent to the unmap API. Each row that becomes a request
is one API call against your plan's shared allowance, and retries are billed
too, so --estimate reports both the best case and the ceiling. Interrupt it and
re-run with --resume.

'init' verifies the key against the gateway, then writes unmap.config.json and
unmap.init.js into the current directory.

'add' installs registry components the shadcn way. It writes the @unmap registry
entry into components.json itself if needed (both lanes), then runs
\`npx shadcn add @unmap/<item>\` (React) or \`npx shadcn-vue add @unmap/<item>\`
(Vue, Nuxt). Not on shadcn-vue? Use the composables in @unmap/vue or @unmap/nuxt.
Each item's docs, for people and coding agents, are indexed at
https://registry.unmap.dev/llms.txt

'create' runs \`npx shadcn init\` (or \`shadcn-vue init\`) with your template and preset,
writes the @unmap registry entry into components.json, adds the components, writes
your key to .env, and replaces the home page with a working map.
`;

async function verifyKey(key: string, gateway?: string): Promise<"ok" | "invalid" | "error"> {
  try {
    const res = await fetch(verifyUrl(key, { gateway }), { headers: { accept: "application/json" } });
    return keyStatusFromResponse(res.status);
  } catch {
    return "error";
  }
}

async function runInit(args: ReturnType<typeof parseArgs>): Promise<number> {
  const key = args.key ?? process.env.UNMAP_KEY;
  if (!key) {
    process.stderr.write("error: a key is required. Pass --key <key> or set UNMAP_KEY.\n");
    return 1;
  }

  const region = resolveRegion(args.region);
  process.stdout.write(`Verifying key against ${args.gateway ?? "the default gateway"}...\n`);
  const status = await verifyKey(key, args.gateway);
  if (status === "invalid") {
    process.stderr.write("error: key rejected by the gateway (401/403). Check the key and try again.\n");
    return 1;
  }
  if (status === "error") {
    process.stderr.write("warning: could not reach the gateway to verify the key; continuing anyway.\n");
  } else {
    process.stdout.write("  key ok\n");
  }

  const config = generateConfig({ key, region, gateway: args.gateway });
  const cwd = process.cwd();
  await writeIfAbsent(resolve(cwd, "unmap.config.json"), serializeConfig(config));
  await writeIfAbsent(resolve(cwd, "unmap.init.js"), generateInitSnippet({ key, region, gateway: args.gateway }));

  process.stdout.write(`\nDone. Region '${region}'. Next: install maplibre-gl and import unmap.init.js.\n`);
  return 0;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.command === undefined) {
    process.stdout.write(HELP);
    return args.command === undefined && !args.help ? 1 : 0;
  }
  if (args.command === "init") return runInit(args);
  if (args.command === "add") return runAdd(args);
  if (args.command === "geocode") {
    const sub = args.positionals[0];
    if (sub !== "csv") {
      process.stderr.write("error: the only geocode subcommand is 'csv'.\n\n" + HELP);
      return 1;
    }
    const input = args.positionals[1];
    if (!input) {
      process.stderr.write("error: geocode csv needs an input file.\n");
      return 1;
    }
    if (!args.queryColumn) {
      process.stderr.write("error: --query-column is required: which column holds the addresses?\n");
      return 1;
    }
    // --estimate writes nothing, so it is the one mode that does not need an output path.
    if (!args.output && !args.estimate) {
      process.stderr.write("error: --output is required (or pass --estimate to just count).\n");
      return 1;
    }
    return runGeocodeCsv(
      {
        input,
        queryColumn: args.queryColumn,
        output: args.output ?? "",
        ...(args.reviewOutput ? { reviewOutput: args.reviewOutput } : {}),
        ...(args.checkpoint ? { checkpoint: args.checkpoint } : {}),
        ...(args.key ? { key: args.key } : {}),
        ...(args.gateway ? { gateway: args.gateway } : {}),
        options: parseBatchOptions(args),
        estimateOnly: args.estimate,
        overwrite: args.overwrite,
        resume: args.resume,
      },
      {
        out: (line) => process.stdout.write(`${line}\n`),
        err: (line) => process.stderr.write(`${line}\n`),
      },
    );
  }
  if (args.command === "create") {
    const interactive = process.stdin.isTTY && process.stdout.isTTY;
    const rl = interactive ? createInterface({ input: process.stdin, output: process.stdout }) : null;
    try {
      return await runCreate(args, rl ? { ask: (question) => rl.question(question) } : {});
    } finally {
      rl?.close();
    }
  }

  process.stderr.write(`error: unknown command '${args.command}'.\n\n${HELP}`);
  return 1;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  });
