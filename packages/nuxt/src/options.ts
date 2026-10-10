import { DEFAULT_GATEWAY } from "@unmap/core";

export interface ModuleOptions {
  /** unmap API key (um_live_... / um_test_...). */
  key?: string;
  /** API base URL. Defaults to `https://api.unmap.dev`. */
  gateway?: string;
}

export interface NormalizedOptions {
  key: string;
  gateway: string;
}

/**
 * Fold module options into the public runtime-config shape, applying the default
 * gateway and trimming trailing slashes. Pure and Nuxt-free, so it can be unit
 * tested without booting a Nuxt app.
 */
export function normalizeOptions(options: ModuleOptions = {}): NormalizedOptions {
  const gateway = (options.gateway?.trim() || DEFAULT_GATEWAY).replace(/\/+$/, "");
  return { key: options.key?.trim() ?? "", gateway };
}
