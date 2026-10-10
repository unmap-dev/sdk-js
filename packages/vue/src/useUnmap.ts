import { ref, shallowRef, onMounted, onBeforeUnmount, type Ref, type ShallowRef } from "vue";
import { Geocoder, Router, type Map as UnmapMap, type UnmapOptions } from "@unmap/sdk";

export interface UseUnmapReturn {
  /** Bind to the element the map should mount into: `<div ref="mapContainer" />`. */
  mapContainer: Ref<HTMLElement | null>;
  /** The MapLibre map, populated on the client after mount. */
  map: ShallowRef<UnmapMap | null>;
  geocoder: Geocoder;
  router: Router;
  /** True once the client-side map has been created. */
  ready: Ref<boolean>;
}

/**
 * Create an unmap map bound to a template ref, plus the always-available
 * geocoder and router. SSR-safe: the map is created only on the client (guarded
 * by `onMounted` and `typeof window`), and `map.remove()` runs on unmount.
 *
 *   const { mapContainer, map, ready } = useUnmap({ key: "um_live_...", center: [-114.07, 51.05] });
 *   // template: <div ref="mapContainer" style="height: 400px" />
 */
export function useUnmap(options: Omit<UnmapOptions, "container">): UseUnmapReturn {
  const mapContainer = ref<HTMLElement | null>(null);
  const map = shallowRef<UnmapMap | null>(null);
  const ready = ref(false);

  // Geocoder and router never touch the DOM, so build them eagerly (SSR-safe).
  const geocoder = new Geocoder(options);
  const router = new Router(options);

  onMounted(async () => {
    if (typeof window === "undefined" || !mapContainer.value) return;
    // Import the SDK map factory lazily so the maplibre-gl bundle only loads on
    // the client, keeping this composable importable during SSR.
    const { Unmap } = await import("@unmap/sdk");
    const instance = new Unmap({ ...options, container: mapContainer.value });
    map.value = instance.map ?? null;
    ready.value = true;
  });

  onBeforeUnmount(() => {
    map.value?.remove();
    map.value = null;
    ready.value = false;
  });

  return { mapContainer, map, geocoder, router, ready };
}
