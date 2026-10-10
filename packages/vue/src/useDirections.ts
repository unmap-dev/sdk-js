import { ref, type Ref } from "vue";
import {
  Router,
  type RouterOptions,
  type RouteResult,
  type FeatureCollection,
  type IsochroneOptions,
  type LngLat,
  type RouteOptions,
} from "@unmap/sdk";

export interface UseDirectionsReturn {
  route: (from: LngLat, to: LngLat, opts?: RouteOptions) => Promise<RouteResult>;
  isochrone: (near: LngLat, opts: IsochroneOptions) => Promise<FeatureCollection>;
  result: Ref<RouteResult | FeatureCollection | null>;
  loading: Ref<boolean>;
  error: Ref<Error | null>;
}

/**
 * Reactive wrapper over the unmap Router. `result`, `loading`, and `error`
 * track the most recent call. Isomorphic (SSR-safe): no browser API is touched.
 * Pass `{ fetch }` to inject a fetch implementation in tests.
 */
export function useDirections(options: RouterOptions): UseDirectionsReturn {
  const router = new Router(options);
  const result = ref<RouteResult | FeatureCollection | null>(null);
  const loading = ref(false);
  const error = ref<Error | null>(null);

  async function run<T extends RouteResult | FeatureCollection>(op: () => Promise<T>): Promise<T> {
    loading.value = true;
    error.value = null;
    try {
      const out = await op();
      result.value = out;
      return out;
    } catch (e) {
      error.value = e instanceof Error ? e : new Error(String(e));
      throw e;
    } finally {
      loading.value = false;
    }
  }

  return {
    route: (from, to, opts) => run(() => router.route(from, to, opts)),
    isochrone: (near, opts) => run(() => router.isochrone(near, opts)),
    result,
    loading,
    error,
  };
}
