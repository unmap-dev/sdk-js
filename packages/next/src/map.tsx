import { useEffect, type CSSProperties, type ReactNode } from "react";
import { useUnmap, type UseUnmapOptions } from "@unmap/react";
import type { Map as UnmapMap } from "@unmap/sdk";

export interface MapProps extends UseUnmapOptions {
  /** Class for the container element. Give it a height, or use `containerStyle`. */
  className?: string;
  /** Inline styles for the container element. `style` is the map style, so this is separate. */
  containerStyle?: CSSProperties;
  /**
   * Called with the MapLibre map once it has loaded. Functions cannot cross the Server
   * Component boundary, so pass this from a Client Component only.
   */
  onReady?: (map: UnmapMap) => void;
  /**
   * Rendered inside the container, above the canvas. Position overlays absolutely; the
   * container is `position: relative`.
   */
  children?: ReactNode;
}

const baseStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
  minHeight: 320,
  overflow: "hidden",
};

/**
 * The unmap map as a Client Component. Because this package is a client boundary, a Server
 * Component page can render it directly with no client file of its own:
 *
 *   // app/page.tsx
 *   import { Map } from "@unmap/next";
 *   export default function Page() {
 *     return <Map apiKey={process.env.NEXT_PUBLIC_UNMAP_KEY!} center={[-114.07, 51.05]} zoom={11} />;
 *   }
 *
 * Wrap the app in `<UnmapProvider apiKey=...>` to omit `apiKey` here. Import
 * `maplibre-gl/dist/maplibre-gl.css` once in your root layout for controls and attribution.
 */
export function Map({ className, containerStyle, onReady, children, ...options }: MapProps) {
  const { mapContainer, map, ready } = useUnmap(options);

  useEffect(() => {
    if (ready && map) onReady?.(map);
  }, [ready, map, onReady]);

  return (
    <div ref={mapContainer} className={className} style={{ ...baseStyle, ...containerStyle }} data-unmap-map="">
      {children}
    </div>
  );
}
