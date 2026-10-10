import { ref, type Ref } from "vue";
import {
  Geocoder,
  type GeocoderOptions,
  type GeocodeResult,
  type SearchOptions,
  type NearbyOptions,
  type ReverseOptions,
  type TreatyOptions,
} from "@unmap/sdk";

export interface UseGeocoderReturn {
  /** `include: ["treaties"]` adds treaty context to each result (see TreatyContext). */
  search: (q: string, opts?: SearchOptions & TreatyOptions) => Promise<GeocodeResult[]>;
  autocomplete: (q: string, opts?: SearchOptions) => Promise<GeocodeResult[]>;
  /** Category search: POIs near a point (or a bbox's centre), sorted by distance. */
  nearby: (category: string | string[], opts?: NearbyOptions) => Promise<GeocodeResult[]>;
  /** With `include: ["treaties"]`, every result carries treaty context for this coordinate. */
  reverse: (lng: number, lat: number, opts?: ReverseOptions) => Promise<GeocodeResult[]>;
  results: Ref<GeocodeResult[]>;
  loading: Ref<boolean>;
  error: Ref<Error | null>;
}

/**
 * Reactive wrapper over the unmap Geocoder. `results`, `loading`, and `error`
 * track the most recent call. Isomorphic: no map or browser API is touched, so
 * it works in SSR. Pass `{ fetch }` to inject a fetch implementation in tests.
 */
export function useGeocoder(options: GeocoderOptions): UseGeocoderReturn {
  const geocoder = new Geocoder(options);
  const results = ref<GeocodeResult[]>([]);
  const loading = ref(false);
  const error = ref<Error | null>(null);

  async function run(op: () => Promise<GeocodeResult[]>): Promise<GeocodeResult[]> {
    loading.value = true;
    error.value = null;
    try {
      const out = await op();
      results.value = out;
      return out;
    } catch (e) {
      error.value = e instanceof Error ? e : new Error(String(e));
      throw e;
    } finally {
      loading.value = false;
    }
  }

  return {
    search: (q, opts) => run(() => geocoder.search(q, opts)),
    autocomplete: (q, opts) => run(() => geocoder.autocomplete(q, opts)),
    nearby: (category, opts) => run(() => geocoder.nearby(category, opts)),
    reverse: (lng, lat, opts) => run(() => geocoder.reverse(lng, lat, opts)),
    results,
    loading,
    error,
  };
}
