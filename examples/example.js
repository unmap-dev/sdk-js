let map;
document.querySelector("#example").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button");
  const status = document.querySelector("#status");
  const values = new FormData(form);
  const key = String(values.get("key")).trim();
  button.disabled = true;
  status.textContent = "Loading…";
  try {
    if (!globalThis.unmap) throw new Error("The browser SDK could not load. Check your connection.");
    if (document.body.dataset.example === "basic-map") {
      map?.remove();
      map = new unmap.Unmap({ key, container: "#map", center: [-114.07, 51.05], zoom: 12 }).map;
      map.on("load", () => { status.textContent = "Map loaded."; });
      map.on("error", (event) => { status.textContent = event.error?.message || "The map request failed."; });
    } else {
      const client = new unmap.Unmap({ key });
      const result = document.body.dataset.example === "geocoding"
        ? await client.geocoder.search(String(values.get("query")))
        : await client.router.route([-114.0631, 51.0443], [-114.0703, 51.0552], { mode: "pedestrian" });
      document.querySelector("#result").textContent = JSON.stringify(result, null, 2);
      status.textContent = "Request complete.";
    }
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    button.disabled = false;
  }
});
