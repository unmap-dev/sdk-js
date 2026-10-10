# Working on Unmap SDKs

Read README.md, the relevant package README, and CONTRIBUTING.md before editing. Optimize for a first working map in under 60 seconds and a small integration in the developer's existing stack.

## Commands and layout

- Node.js 24; pnpm 10.29.3, pinned in package.json.
- Fast demo: `node scripts/serve.mjs examples 8080`, then `/basic-map.html`. No install is needed; a browser key is entered in the page.
- SDK development: `pnpm install --frozen-lockfile`; `pnpm check` builds, checks types, and tests all packages without API keys.
- Source lives in `packages/<name>/src`; each package README documents its public API. `fixtures/` contains public registry contracts, not an API backend.
- For a focused change, run the affected package's scripts; before an upstream PR involving source or dependencies, run `pnpm check`.

## Integration rules

- Use published @unmap packages when integrating in another app. Do not require this workspace or a private repository.
- The plain SDK uses `key`; React/Next use `apiKey`. Coordinates are [longitude, latitude].
- Give the map a height, mount after its container exists, import MapLibre CSS once, and configure a matching module worker for bundlers. Remove the map on unmount.
- Keep TypeScript strict; no `any` in public APIs. Preserve API error details without including credentials in logs.
- Load browser keys from the consumer's ignored environment configuration or demo input. Do not read, echo, or commit actual keys. Browser keys need the exact localhost origin allowed; server credentials stay server-side.
- The basemap is worldwide; geocoding and routing cover Canada. Preserve attribution and document add-on requirements when using layers.

## Contributions and forks

This repository receives automated snapshots. Maintainers backport accepted upstream contributions to the product monorepo so later exports retain them; public contributors can submit a PR here. Customize your own fork normally. Do not add an independent npm publishing or Unmap production deploy workflow. Never commit build output or local environment files.

Report changed files, checks run and results, local URL, and any configuration the developer must supply. Do not claim live API verification when you only tested without a key.
