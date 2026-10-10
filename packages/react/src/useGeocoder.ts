import { useCallback, useMemo, useState } from "react";
import {
  Geocoder,
  type GeocoderOptions,
  type GeocodeResult,
  type SearchOptions,
  type NearbyOptions,
  type ReverseOptions,
  type TreatyOptions,
} from "@unmap/sdk";
import { useResolvedOptions, type WithApiKey } from "./provider";

export type UseGeocoderOptions = WithApiKey<GeocoderOptions>;

export interface UseGeocoderReturn {
  /** `include: ["treaties"]` adds treaty context to each result (see TreatyContext). */
  search: (q: string, opts?: SearchOptions & TreatyOptions) => Promise<GeocodeResult[]>;
  autocomplete: (q: string, opts?: SearchOptions) => Promise<GeocodeResult[]>;
  /** Category search: POIs near a point (or a bbox's centre), sorted by distance. */
  nearby: (category: string | string[], opts?: NearbyOptions) => Promise<GeocodeResult[]>;
  /** With `include: ["treaties"]`, every result carries treaty context for this coordinate. */
  reverse: (lng: number, lat: number, opts?: ReverseOptions) => Promise<GeocodeResult[]>;
  results: GeocodeResult[];
  loading: boolean;
  error: Error | null;
}

/**
 * Stateful wrapper over the unmap Geocoder. `results`, `loading`, and `error` track the most
 * recent call. Isomorphic: no map or browser API is touched, so it renders on the server.
 * Pass `{ fetch }` to inject a fetch implementation in tests.
 */
export function useGeocoder(options: UseGeocoderOptions): UseGeocoderReturn {
  const { key, gateway, fetch: fetchImpl } = useResolvedOptions<GeocoderOptions>(options);
  const geocoder = useMemo(
    () => new Geocoder({ key, gateway, fetch: fetchImpl }),
    [key, gateway, fetchImpl],
  );
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const run = useCallback(async (op: () => Promise<GeocodeResult[]>) => {
    setLoading(true);
    setError(null);
    try {
      const out = await op();
      setResults(out);
      return out;
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const search = useCallback<UseGeocoderReturn["search"]>(
    (q, opts) => run(() => geocoder.search(q, opts)),
    [run, geocoder],
  );
  const autocomplete = useCallback<UseGeocoderReturn["autocomplete"]>(
    (q, opts) => run(() => geocoder.autocomplete(q, opts)),
    [run, geocoder],
  );
  const nearby = useCallback<UseGeocoderReturn["nearby"]>(
    (category, opts) => run(() => geocoder.nearby(category, opts)),
    [run, geocoder],
  );
  const reverse = useCallback<UseGeocoderReturn["reverse"]>(
    (lng, lat, opts) => run(() => geocoder.reverse(lng, lat, opts)),
    [run, geocoder],
  );

  return { search, autocomplete, nearby, reverse, results, loading, error };
}
