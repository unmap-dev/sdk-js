import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createMap,
  Geocoder,
  Router,
  type Map as UnmapMap,
  type UnmapOptions,
} from "@unmap/sdk";
import { useResolvedOptions, type WithApiKey } from "./provider";

export type UseUnmapOptions = WithApiKey<Omit<UnmapOptions, "container">>;

export interface UseUnmapReturn {
  /** Attach to the element the map should mount into: `<div ref={mapContainer} />`. */
  mapContainer: (el: HTMLElement | null) => void;
  /** The MapLibre map, `null` until the container has mounted on the client. */
  map: UnmapMap | null;
  geocoder: Geocoder;
  router: Router;
  /** True once the map has fired its `load` event. */
  ready: boolean;
}

/**
 * Create an unmap map bound to a ref, plus the always-available geocoder and router.
 * SSR-safe: the map is created in an effect, so nothing touches the DOM during render or on
 * the server, and `map.remove()` runs on unmount.
 *
 *   const { mapContainer, map, ready } = useUnmap({ apiKey: "um_live_...", center: [-114.07, 51.05] });
 *   return <div ref={mapContainer} style={{ height: 400 }} />;
 *
 * `mapContainer` is a callback ref rather than a ref object so the map is created when the
 * element actually appears, which also covers containers that are rendered conditionally.
 * Changing `center` or `zoom` moves the existing map; changing anything else, projection included, recreates it.
 */
export function useUnmap(options: UseUnmapOptions): UseUnmapReturn {
  const { key, gateway, style, mode, lang, theme, projection, center, zoom, controls } =
    useResolvedOptions<Omit<UnmapOptions, "container"> & { key: string }>(options);

  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [map, setMap] = useState<UnmapMap | null>(null);
  const [ready, setReady] = useState(false);
  const mapContainer = useCallback((el: HTMLElement | null) => setContainer(el), []);

  // Geocoder and router never touch the DOM, so build them eagerly (SSR-safe) and keep one
  // instance per key/gateway pair.
  const geocoder = useMemo(() => new Geocoder({ key, gateway }), [key, gateway]);
  const router = useMemo(() => new Router({ key, gateway }), [key, gateway]);

  // Controls are keyed on primitives for the same reason `center` is below: a caller writing
  // `controls={{ position: "bottom-left" }}` inline hands us a new object every render, and an
  // object in the dependency list would tear the map down and rebuild it each time.
  const controlsOff = controls === false;
  const controlsPosition = typeof controls === "object" ? controls.position : undefined;

  // The map is created with whatever viewport was current at the time; later changes are
  // applied with setCenter/setZoom below rather than by tearing the map down.
  const viewportRef = useRef({ center, zoom });
  viewportRef.current = { center, zoom };

  useEffect(() => {
    if (!container) return;
    const { center: c, zoom: z } = viewportRef.current;
    const instance = createMap({
      key,
      gateway,
      container,
      style,
      mode,
      lang,
      theme,
      projection,
      ...(c ? { center: c } : {}),
      ...(z != null ? { zoom: z } : {}),
      controls: controlsOff ? false : controlsPosition ? { position: controlsPosition } : true,
    });
    const onLoad = () => setReady(true);
    instance.on("load", onLoad);
    setMap(instance);
    return () => {
      instance.off("load", onLoad);
      instance.remove();
      setMap(null);
      setReady(false);
    };
  }, [container, key, gateway, style, mode, lang, theme, projection, controlsOff, controlsPosition]);

  // Key on the coordinates rather than the array so a caller who writes `center={[lng, lat]}`
  // inline does not move (or worse, rebuild) the map on every render.
  const lng = center?.[0];
  const lat = center?.[1];
  useEffect(() => {
    if (map && lng != null && lat != null) map.setCenter([lng, lat]);
  }, [map, lng, lat]);

  useEffect(() => {
    if (map && zoom != null) map.setZoom(zoom);
  }, [map, zoom]);

  return { mapContainer, map, geocoder, router, ready };
}
