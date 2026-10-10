import { useCallback, useMemo, useState } from "react";
import {
  Router,
  type RouterOptions,
  type RouteResult,
  type FeatureCollection,
  type IsochroneOptions,
  type LngLat,
  type RouteOptions,
} from "@unmap/sdk";
import { useResolvedOptions, type WithApiKey } from "./provider";

export type UseDirectionsOptions = WithApiKey<RouterOptions>;

export interface UseDirectionsReturn {
  route: (from: LngLat, to: LngLat, opts?: RouteOptions) => Promise<RouteResult>;
  isochrone: (near: LngLat, opts: IsochroneOptions) => Promise<FeatureCollection>;
  result: RouteResult | FeatureCollection | null;
  loading: boolean;
  error: Error | null;
}

/**
 * Stateful wrapper over the unmap Router. `result`, `loading`, and `error` track the most
 * recent call. Isomorphic (SSR-safe): no browser API is touched. Pass `{ fetch }` to inject a
 * fetch implementation in tests.
 */
export function useDirections(options: UseDirectionsOptions): UseDirectionsReturn {
  const { key, gateway, fetch: fetchImpl } = useResolvedOptions<RouterOptions>(options);
  const router = useMemo(
    () => new Router({ key, gateway, fetch: fetchImpl }),
    [key, gateway, fetchImpl],
  );
  const [result, setResult] = useState<RouteResult | FeatureCollection | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const run = useCallback(async <T extends RouteResult | FeatureCollection>(op: () => Promise<T>) => {
    setLoading(true);
    setError(null);
    try {
      const out = await op();
      setResult(out);
      return out;
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const route = useCallback<UseDirectionsReturn["route"]>(
    (from, to, opts) => run(() => router.route(from, to, opts)),
    [run, router],
  );
  const isochrone = useCallback<UseDirectionsReturn["isochrone"]>(
    (near, opts) => run(() => router.isochrone(near, opts)),
    [run, router],
  );

  return { route, isochrone, result, loading, error };
}
