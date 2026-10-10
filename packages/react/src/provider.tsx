import { createContext, useContext, useMemo, type ReactNode } from "react";

export interface UnmapConfig {
  /** unmap API key (`um_live_...` / `um_test_...`). */
  apiKey?: string;
  /** API base URL. Defaults to `https://api.unmap.dev`. */
  gateway?: string;
}

const UnmapContext = createContext<UnmapConfig | null>(null);

export interface UnmapProviderProps extends UnmapConfig {
  children?: ReactNode;
}

/**
 * Set the key (and optionally the gateway) once, high in the tree, so every hook and
 * component below can omit them. The React analogue of `@unmap/nuxt`'s runtime config.
 *
 *   <UnmapProvider apiKey={process.env.NEXT_PUBLIC_UNMAP_KEY!}>{children}</UnmapProvider>
 *
 * An explicit `apiKey` / `gateway` passed to a hook always wins over the provider.
 */
export function UnmapProvider({ apiKey, gateway, children }: UnmapProviderProps) {
  const value = useMemo<UnmapConfig>(() => ({ apiKey, gateway }), [apiKey, gateway]);
  return <UnmapContext.Provider value={value}>{children}</UnmapContext.Provider>;
}

/** The config from the nearest `UnmapProvider`, or an empty object outside one. */
export function useUnmapConfig(): UnmapConfig {
  return useContext(UnmapContext) ?? {};
}

/**
 * Options shape shared by every hook: the SDK's options with `key` renamed to `apiKey`
 * (React reserves `key` as a JSX prop, and one name across hooks and components beats
 * matching the SDK) and made optional, because it may come from `UnmapProvider`.
 */
export type WithApiKey<T extends { key: string }> = Omit<T, "key"> & { apiKey?: string };

/**
 * Resolve `apiKey` and `gateway` against the provider and hand back the SDK-shaped options.
 * Throws when no key can be found anywhere, because the alternative is a map that silently
 * renders nothing and a wall of 401s in the network tab.
 */
export function useResolvedOptions<T extends { key: string; gateway?: string }>(
  options: WithApiKey<T>,
): T {
  const config = useUnmapConfig();
  const { apiKey, gateway, ...rest } = options;
  const key = apiKey ?? config.apiKey;
  if (!key) {
    throw new Error(
      "unmap: no API key. Pass `apiKey` to the hook or component, or wrap the tree in <UnmapProvider apiKey=\"um_live_...\">.",
    );
  }
  return { ...rest, key, gateway: gateway ?? config.gateway } as T;
}
