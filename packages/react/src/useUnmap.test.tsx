import { act, render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Stand in for the SDK so no MapLibre (and therefore no WebGL) is created under jsdom. The
// fake map records `remove()` calls and lets a test fire `load` by hand.
const mocks = vi.hoisted(() => {
  const maps: FakeMap[] = [];
  class FakeMap {
    handlers: Record<string, Array<() => void>> = {};
    removed = false;
    centers: Array<[number, number]> = [];
    zooms: number[] = [];
    constructor(public opts: Record<string, unknown>) {
      maps.push(this);
    }
    on(ev: string, fn: () => void) {
      (this.handlers[ev] ??= []).push(fn);
    }
    off(ev: string, fn: () => void) {
      this.handlers[ev] = (this.handlers[ev] ?? []).filter((h) => h !== fn);
    }
    fire(ev: string) {
      for (const h of this.handlers[ev] ?? []) h();
    }
    remove() {
      this.removed = true;
    }
    setCenter(c: [number, number]) {
      this.centers.push(c);
    }
    setZoom(z: number) {
      this.zooms.push(z);
    }
  }
  return { maps, FakeMap };
});

vi.mock("@unmap/sdk", async (importOriginal) => {
  const real = await importOriginal<typeof import("@unmap/sdk")>();
  return {
    ...real,
    createMap: (opts: Record<string, unknown>) => new mocks.FakeMap(opts),
  };
});

import { useUnmap } from "./useUnmap";
import { UnmapProvider } from "./provider";

function Host(props: Parameters<typeof useUnmap>[0] & { show?: boolean }) {
  const { show = true, ...options } = props;
  const { mapContainer, ready, map } = useUnmap(options);
  return (
    <>
      <output data-testid="ready">{String(ready)}</output>
      <output data-testid="has-map">{String(map !== null)}</output>
      {show ? <div ref={mapContainer} data-testid="container" /> : null}
    </>
  );
}

describe("useUnmap", () => {
  it("creates the map once the container mounts and reports ready on load", () => {
    render(<Host key="a" apiKey="um_test_x" center={[-114.07, 51.05]} zoom={11} style="muted" />);

    const created = mocks.maps.at(-1)!;
    expect(created.opts.container).toBe(screen.getByTestId("container"));
    expect(created.opts).toMatchObject({
      key: "um_test_x",
      center: [-114.07, 51.05],
      zoom: 11,
      style: "muted",
    });
    expect(screen.getByTestId("has-map").textContent).toBe("true");
    expect(screen.getByTestId("ready").textContent).toBe("false");

    act(() => created.fire("load"));
    expect(screen.getByTestId("ready").textContent).toBe("true");
  });

  it("removes the map on unmount", () => {
    const { unmount } = render(<Host apiKey="k" />);
    const created = mocks.maps.at(-1)!;
    expect(created.removed).toBe(false);
    unmount();
    expect(created.removed).toBe(true);
  });

  it("does not create a map until a container exists", () => {
    const before = mocks.maps.length;
    const { rerender } = render(<Host apiKey="k" show={false} />);
    expect(mocks.maps.length).toBe(before);
    expect(screen.getByTestId("has-map").textContent).toBe("false");

    rerender(<Host apiKey="k" show />);
    expect(mocks.maps.length).toBe(before + 1);
    expect(screen.getByTestId("has-map").textContent).toBe("true");
  });

  it("does not recreate the map on an unrelated re-render", () => {
    const { rerender } = render(<Host apiKey="k" center={[-73.57, 45.5]} />);
    const before = mocks.maps.length;
    // A new (but equal) center array must not tear the map down: the effect keys on the
    // coordinates, not the array identity.
    rerender(<Host apiKey="k" center={[-73.57, 45.5]} />);
    expect(mocks.maps.length).toBe(before);
    const created = mocks.maps.at(-1)!;
    expect(created.removed).toBe(false);
    expect(created.centers).toHaveLength(1);

    // A genuinely new viewport moves the existing map instead of rebuilding it.
    rerender(<Host apiKey="k" center={[-114.07, 51.05]} zoom={9} />);
    expect(mocks.maps.length).toBe(before);
    expect(created.centers.at(-1)).toEqual([-114.07, 51.05]);
    expect(created.zooms.at(-1)).toBe(9);
  });

  it("exposes a geocoder and router bound to the same key and gateway", () => {
    const { result } = renderHook(() => useUnmap({ apiKey: "um_test_y", gateway: "https://gw.test/" }));
    expect(result.current.map).toBeNull();
    expect(result.current.ready).toBe(false);
    expect(typeof result.current.geocoder.search).toBe("function");
    expect(typeof result.current.router.route).toBe("function");
  });

  it("falls back to the provider for the key and gateway", () => {
    render(
      <UnmapProvider apiKey="um_live_provider" gateway="https://gw.example.com">
        <Host />
      </UnmapProvider>,
    );
    expect(mocks.maps.at(-1)!.opts).toMatchObject({
      key: "um_live_provider",
      gateway: "https://gw.example.com",
    });
  });

  it("lets an explicit key win over the provider", () => {
    render(
      <UnmapProvider apiKey="um_live_provider">
        <Host apiKey="um_live_explicit" />
      </UnmapProvider>,
    );
    expect(mocks.maps.at(-1)!.opts).toMatchObject({ key: "um_live_explicit" });
  });

  it("throws a clear error when no key is available", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Host />)).toThrow(/apiKey.*UnmapProvider/);
  });
});
