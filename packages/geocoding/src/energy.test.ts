import { describe, expect, it } from "vitest";
import {
  energySearchRequested,
  looksLikeEnergyQuery,
  parseEnergyQuery,
  parseEnergySearchLayers,
} from "./energy";

describe("energy query detect", () => {
  it("accepts AER and Petrinex DLS UWIs", () => {
    expect(parseEnergyQuery("00/01-01-001-01W4/0")).toMatchObject({
      kind: "uwi",
      key: "00/01-01-001-01W4/0",
    });
    expect(parseEnergyQuery("F1/06-06-001-01W4/0")?.kind).toBe("uwi");
    expect(parseEnergyQuery("102/12-03-001-17W4/0")?.kind).toBe("uwi");
    expect(parseEnergyQuery("100/12-03-001-17W4/00")?.kind).toBe("uwi");
    expect(looksLikeEnergyQuery("00/01-01-001-01W4/0")).toBe(true);
  });

  it("accepts a BC NTS UWI before the DLS form", () => {
    expect(parseEnergyQuery("200/B-039-H/094-B-08/00")).toMatchObject({
      kind: "uwi",
      key: "200/B-039-H/094-B-08/00",
    });
  });

  it("accepts a prefixed well licence and rejects bare digits", () => {
    expect(parseEnergyQuery("W0485123")).toEqual({
      kind: "licence",
      raw: "W0485123",
      key: "0485123",
    });
    expect(parseEnergyQuery("LIC 123456")?.kind).toBe("licence");
    expect(parseEnergyQuery("Licence-048512")?.key).toBe("048512");
    expect(looksLikeEnergyQuery("0485123")).toBe(false);
    expect(looksLikeEnergyQuery("123456")).toBe(false);
  });

  it("leaves civic addresses and legal-land strings alone", () => {
    expect(looksLikeEnergyQuery("Calgary")).toBe(false);
    expect(looksLikeEnergyQuery("17 Ave SW, Calgary")).toBe(false);
    expect(looksLikeEnergyQuery("NW-25-24-1-W5")).toBe(false);
    expect(looksLikeEnergyQuery("10-36-42-3-W5")).toBe(false);
    expect(energySearchRequested("Calgary")).toBe(false);
  });

  it("treats generic names as energy only when layers or source ask", () => {
    expect(parseEnergySearchLayers("well,facility")).toEqual(["well", "facility"]);
    expect(energySearchRequested("Kaybob South", { layers: "facility" })).toBe(true);
    expect(energySearchRequested("Kaybob South", { profile: "energy" })).toBe(true);
    expect(energySearchRequested("Kaybob South", { source: "energy" })).toBe(true);
    expect(energySearchRequested("Kaybob South")).toBe(false);
  });
});
