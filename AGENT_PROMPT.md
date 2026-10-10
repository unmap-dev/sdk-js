# Build with an agent

Paste the following into your coding agent in the project you want to change. Replace the bracketed parts with your use case. The agent can prepare the integration without seeing your key; supply it directly in your local environment file or demo input.

```text
Integrate Unmap into my existing app: [describe what I want].

1. Read https://github.com/unmap-dev/sdk-js/blob/main/README.md and the README
   for my framework's package. Inspect my project before choosing a package;
   use published @unmap/sdk, @unmap/next, @unmap/react, @unmap/vue, or @unmap/nuxt.
   Keep my framework, package manager, and design system.
2. Deliver a visible Calgary map first. Give it a height, import MapLibre CSS,
   serve the matching MapLibre module worker if using a bundler, and clean up
   on unmount. Plain SDK coordinates are [longitude, latitude]; React uses
   apiKey rather than key. Follow the package's lifecycle conventions.
3. Then add [search / directions / markers / my feature], using documented
   APIs and the closest runnable example from unmap-dev/examples. Keep the
   change small and typed; handle loading and errors.
4. Put the browser key in ignored configuration using the project's existing
   environment convention. I will supply its value. Never read, print, or
   commit credentials. Tell me the exact localhost origin to allow on it.
5. Run the relevant build/type/test checks and start the app. Verify the page
   locally; if there is no key, say which live behavior remains unverified.
   Report commands, URL, files changed, and remaining setup.
```

A finished integration should have a runnable local URL, a visible map when a valid browser key is supplied, correct attribution, and passing relevant checks. Review the changes before using them in production. For changes to this repository itself, follow [AGENTS.md](AGENTS.md) and [CONTRIBUTING.md](CONTRIBUTING.md).
