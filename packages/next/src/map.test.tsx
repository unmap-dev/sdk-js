import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const maps: FakeMap[] = [];
  class FakeMap {
    handlers: Record<string, Array<() => void>> = {};
    removed = false;
    constructor(public opts: Record<string, unknown>) {
      maps.push(this);
    }
    on(ev: string, fn: () => void) {
      (this.handlers[ev] ??= []).push(fn);
    }
    off() {}
    fire(ev: string) {
      for (const h of this.handlers[ev] ?? []) h();
    }
    remove() {
      this.removed = true;
    }
    setCenter() {}
    setZoom() {}
  }
  return { maps, FakeMap };
});

vi.mock("@unmap/sdk", async (importOriginal) => {
  const real = await importOriginal<typeof import("@unmap/sdk")>();
  return { ...real, createMap: (opts: Record<string, unknown>) => new mocks.FakeMap(opts) };
});

import { Map, UnmapProvider } from "./index";

describe("<Map>", () => {
  it("mounts a container, creates the map in it, and calls onReady on load", () => {
    const onReady = vi.fn();
    render(
      <Map apiKey="um_test_x" style="muted" center={[-73.57, 45.5]} zoom={12} onReady={onReady}>
        <span>overlay</span>
      </Map>,
    );
    const container = screen.getByText("overlay").parentElement!;
    expect(container.dataset.unmapMap).toBe("");
    expect(container.style.position).toBe("relative");

    const created = mocks.maps.at(-1)!;
    expect(created.opts.container).toBe(container);
    expect(created.opts).toMatchObject({ key: "um_test_x", style: "muted", zoom: 12 });
    expect(onReady).not.toHaveBeenCalled();

    act(() => created.fire("load"));
    expect(onReady).toHaveBeenCalledWith(created);
  });

  it("takes the key from UnmapProvider and merges container styles", () => {
    render(
      <UnmapProvider apiKey="um_live_p">
        <Map className="hero" containerStyle={{ height: 480 }} />
      </UnmapProvider>,
    );
    const container = document.querySelector("[data-unmap-map]") as HTMLElement;
    expect(container.className).toBe("hero");
    expect(container.style.height).toBe("480px");
    expect(mocks.maps.at(-1)!.opts).toMatchObject({ key: "um_live_p" });
  });

  it("removes the map on unmount", () => {
    const { unmount } = render(<Map apiKey="k" />);
    const created = mocks.maps.at(-1)!;
    unmount();
    expect(created.removed).toBe(true);
  });
});
