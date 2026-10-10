import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

// maplibre-gl registers a worker blob URL at import time, and jsdom has no createObjectURL.
// The tests never create a real map (the SDK's `createMap` is mocked), so a stub is enough
// to let the module load.
if (typeof window !== "undefined" && typeof window.URL.createObjectURL !== "function") {
  window.URL.createObjectURL = () => "blob:unmap-test";
  window.URL.revokeObjectURL = () => {};
}
