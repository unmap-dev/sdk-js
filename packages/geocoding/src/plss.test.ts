import { describe, expect, it } from "vitest";
import { parseLegalLand, toLegalLandDetails } from "./legal-land";
import {
  NON_PLSS_STATE_NAMES,
  PLSS_MERIDIANS,
  PLSS_STATE_NAMES,
  aliquotQuarterQuarters,
  parsePlss,
  plssSectionId,
  plssTownshipId,
} from "./plss";

type Fixture = {
  input: string;
  unit: "twp" | "sec" | "aliquot" | "lot";
  canonical: string;
  components: Record<string, string>;
};

const MT = { state: "MT", meridian: "20", meridianName: "Principal Meridian Montana" };

const fixtures: Fixture[] = [
  // The three forms the issue names.
  {
    input: "NW1/4 SE1/4 Sec 12 T2N R3W PMM",
    unit: "aliquot",
    canonical: "NW1/4 SE1/4 Sec 12, T2N, R3W, Principal Meridian Montana",
    components: { ...MT, township: "2", townshipDir: "N", range: "3", rangeDir: "W", section: "12", aliquot: "NWSE" },
  },
  {
    input: "Section 12, Township 2 North, Range 3 West, Principal Meridian Montana",
    unit: "sec",
    canonical: "Sec 12, T2N, R3W, Principal Meridian Montana",
    components: { ...MT, section: "12", township: "2", townshipDir: "N", range: "3", rangeDir: "W" },
  },
  {
    input: "Lot 3 Sec 5 T10S R22E, Montana",
    unit: "lot",
    canonical: "Lot 3 Sec 5, T10S, R22E, Principal Meridian Montana",
    components: { ...MT, lot: "3", section: "5", township: "10", townshipDir: "S", range: "22", rangeDir: "E" },
  },
  // Spelling variants of the same description.
  { input: "NW¼SE¼ Sec. 12, T. 2 N., R. 3 W., P.M.M.", unit: "aliquot", canonical: "NW1/4 SE1/4 Sec 12, T2N, R3W, Principal Meridian Montana", components: { aliquot: "NWSE" } },
  { input: "NWSE 12 T2N R3W MT", unit: "aliquot", canonical: "NW1/4 SE1/4 Sec 12, T2N, R3W, Principal Meridian Montana", components: { aliquot: "NWSE", section: "12" } },
  { input: "nw/4 se/4 sec 12 t02n r03w montana", unit: "aliquot", canonical: "NW1/4 SE1/4 Sec 12, T2N, R3W, Principal Meridian Montana", components: { aliquot: "NWSE" } },
  { input: "NW 1/4 of the SE 1/4 of Section 12, T2N, R3W, Montana Meridian", unit: "aliquot", canonical: "NW1/4 SE1/4 Sec 12, T2N, R3W, Principal Meridian Montana", components: { aliquot: "NWSE" } },
  { input: "T2N R3W Sec 12 NW1/4 SE1/4 MPM", unit: "aliquot", canonical: "NW1/4 SE1/4 Sec 12, T2N, R3W, Principal Meridian Montana", components: { aliquot: "NWSE" } },
  { input: "12-2N-3W Montana", unit: "sec", canonical: "Sec 12, T2N, R3W, Principal Meridian Montana", components: { section: "12", township: "2", range: "3" } },
  { input: "S12 T2N R3W MT", unit: "sec", canonical: "Sec 12, T2N, R3W, Principal Meridian Montana", components: { section: "12" } },
  { input: "T2N R3W PMM", unit: "twp", canonical: "T2N, R3W, Principal Meridian Montana", components: { township: "2", range: "3" } },
  { input: "Township 2 North Range 3 West Montana", unit: "twp", canonical: "T2N, R3W, Principal Meridian Montana", components: { township: "2" } },
  { input: "Gov Lot 3 Sec 5 T10S R22E PMM", unit: "lot", canonical: "Lot 3 Sec 5, T10S, R22E, Principal Meridian Montana", components: { lot: "3" } },
  { input: "Government Lot 3, Section 5, T10S, R22E, Carbon County, Montana", unit: "lot", canonical: "Lot 3 Sec 5, T10S, R22E, Principal Meridian Montana", components: { lot: "3", county: "Carbon" } },
  { input: "Gallatin County NE1/4 Sec 3 T2N R3W MT", unit: "aliquot", canonical: "NE1/4 Sec 3, T2N, R3W, Principal Meridian Montana", components: { aliquot: "NE", county: "Gallatin" } },
  { input: "Sec 12 T2N R3W Lewis and Clark County MT", unit: "sec", canonical: "Sec 12, T2N, R3W, Principal Meridian Montana", components: { county: "Lewis And Clark" } },
  // Halves and halves of quarters.
  { input: "N1/2 NE1/4 Sec 3 T2N R3W PMM", unit: "aliquot", canonical: "N1/2 NE1/4 Sec 3, T2N, R3W, Principal Meridian Montana", components: { aliquot: "N2NE" } },
  { input: "N2NE 3 T2N R3W MT", unit: "aliquot", canonical: "N1/2 NE1/4 Sec 3, T2N, R3W, Principal Meridian Montana", components: { aliquot: "N2NE" } },
  { input: "S1/2 Sec 12 T2N R3W PMM", unit: "aliquot", canonical: "S1/2 Sec 12, T2N, R3W, Principal Meridian Montana", components: { aliquot: "S2", section: "12" } },
  { input: "E½ Sec 12 T2N R3W PMM", unit: "aliquot", canonical: "E1/2 Sec 12, T2N, R3W, Principal Meridian Montana", components: { aliquot: "E2" } },
  // Other meridians resolve the same way; there are no lookup rows for them.
  { input: "Sec 12 T2N R3W Willamette Meridian, Oregon", unit: "sec", canonical: "Sec 12, T2N, R3W, Willamette Meridian, OR", components: { meridian: "33", state: "OR" } },
  { input: "Sec 12 T2N R3W 6th PM, Wyoming", unit: "sec", canonical: "Sec 12, T2N, R3W, Sixth Principal Meridian, WY", components: { meridian: "06", state: "WY" } },
  { input: "Sec 12 T2N R3W Idaho", unit: "sec", canonical: "Sec 12, T2N, R3W, Boise Meridian", components: { meridian: "08", state: "ID" } },
];

describe("parsePlss", () => {
  it.each(fixtures)("$input → $canonical", ({ input, unit, canonical, components }) => {
    const parsed = parsePlss(input);
    expect(parsed, input).not.toBeNull();
    expect(parsed!.unit).toBe(unit);
    expect(parsed!.canonical).toBe(canonical);
    expect(parsed!.components).toMatchObject(components);
    expect(parsed!.disambiguation).toBeUndefined();
  });

  it("asks for a meridian when a township and range name neither a meridian nor a state", () => {
    for (const input of ["Sec 12 T2N R3W", "Lot 3 Sec 5 T10S R22E", "NW1/4 SE1/4 Sec 12 T2N R3W", "T2N R3W"]) {
      const parsed = parsePlss(input)!;
      expect(parsed, input).not.toBeNull();
      expect(parsed.disambiguation?.reason, input).toBe("meridian_required");
      expect(parsed.components.meridian, input).toBeUndefined();
      expect(parsed.disambiguation!.candidates.map((m) => m.code)).toContain("20");
      expect(parsed.disambiguation!.candidates.length).toBe(PLSS_MERIDIANS.length);
    }
  });

  it("asks which meridian when the state has several, and never picks one", () => {
    const parsed = parsePlss("Sec 12 T2N R3W, Colorado")!;
    expect(parsed.disambiguation?.reason).toBe("state_has_several_meridians");
    expect(parsed.components.state).toBe("CO");
    expect(parsed.components.meridian).toBeUndefined();
    expect(parsed.disambiguation!.candidates.map((m) => m.code)).toEqual(["06", "23", "31"]);
  });

  it("flags a meridian that has no townships in the named state", () => {
    const parsed = parsePlss("Sec 12 T2N R3W PMM, Wyoming")!;
    expect(parsed.disambiguation?.reason).toBe("meridian_not_in_state");
    expect(parsed.disambiguation!.candidates.map((m) => m.code)).toEqual(["06", "34"]);
  });

  it("flags two meridians or two states rather than choosing", () => {
    expect(parsePlss("Sec 12 T2N R3W PMM Willamette Meridian")!.disambiguation?.reason).toBe("conflicting_context");
    expect(parsePlss("Sec 12 T2N R3W Montana Idaho")!.disambiguation?.reason).toBe("conflicting_context");
  });

  it("refuses Texas and the other non-PLSS states instead of folding them in", () => {
    const texas = parsePlss("Sec 12 T2N R3W Texas")!;
    expect(texas.disambiguation?.reason).toBe("not_plss_state");
    expect(texas.disambiguation!.message).toMatch(/abstract, block and survey/);
    expect(texas.disambiguation!.candidates).toEqual([]);
    expect(parsePlss("Sec 12 T2N R3W, Kentucky")!.disambiguation?.reason).toBe("not_plss_state");
  });

  it("reads a trailing NE as Nebraska, not a quarter, unless it carries a fraction", () => {
    const nebraska = parsePlss("Sec 12 T2N R3W NE")!;
    expect(nebraska.components.state).toBe("NE");
    expect(nebraska.components.aliquot).toBeUndefined();
    expect(nebraska.unit).toBe("sec");
    expect(parsePlss("Sec 12 T2N R3W NE1/4 PMM")!.components.aliquot).toBe("NE");
  });

  it("does not read the S1 of S1/2 as Section 1", () => {
    const parsed = parsePlss("S1/2 Sec 12 T2N R3W PMM")!;
    expect(parsed.components.section).toBe("12");
    expect(parsed.components.aliquot).toBe("S2");
  });

  it.each([
    "Calgary",
    "123 Main Street Helena MT",
    "T2N",
    "R3W",
    "Sec 12",
    "T2N R3W Main Street",
    "NW1/4 SE1/4 T2N R3W PMM",
    "Lot 3 T10S R22E PMM",
    "Lot 3 NE1/4 Sec 5 T10S R22E PMM",
    "Sec 37 T2N R3W PMM",
    "Sec 0 T2N R3W PMM",
    "T0N R3W PMM",
    "XYZ Sec 12 T2N R3W PMM",
    "Sec 12 T2N R3W PMM; DROP TABLE plss; --",
    "NW-25-24-1-W5",
    "10-36-42-3-W5",
    "00/01-01-001-01W4/0",
    "Lot 10 Con 1 Adjala",
    "F 48 60-20 N 100-30 W",
  ])("returns null for %s", (input) => {
    expect(parsePlss(input)).toBeNull();
  });
});

describe("review fixes", () => {
  it("reads 'in' and the other word-like state codes as words unless they are last", () => {
    for (const input of ["Sec 12 T2N R3W in Montana", "Sec 12 T2N R3W in Gallatin County Montana", "NW1/4 SE1/4 of Sec 12 T2N R3W in the PMM"]) {
      const parsed = parsePlss(input)!;
      expect(parsed, input).not.toBeNull();
      expect(parsed.disambiguation, input).toBeUndefined();
      expect(parsed.components.state, input).toBe("MT");
    }
    expect(parsePlss("Sec 12 T2N R3W in Gallatin County Montana")!.components.county).toBe("Gallatin");
    // Last word: the state it spells.
    expect(parsePlss("Sec 12 T2N R3W, IN")!.components.state).toBe("IN");
    expect(parsePlss("Sec 12 T2N R3W OR")!.components.state).toBe("OR");
  });

  it.each(["300 S-200 E", "200 S - 300 E", "123 N-1 W", "5 S-3 W", "2N-3W", "1300 S-200 E Salt Lake City"])(
    "leaves the street-grid lookalike %s to civic search",
    (input) => {
      expect(parsePlss(input)).toBeNull();
      expect(parseLegalLand(input)).toBeNull();
    },
  );

  it("still reads the shorthand with a section or a meridian or state after it", () => {
    expect(parsePlss("2N-3W Montana")!.components).toMatchObject({ township: "2", range: "3", state: "MT" });
    expect(parsePlss("12-2N-3W")!.disambiguation?.reason).toBe("meridian_required");
    expect(parsePlss("5 S-3 W PMM")!.components).toMatchObject({ township: "5", townshipDir: "S", meridian: "20" });
    expect(parsePlss("12-171N-3W Montana")).toBeNull();
    expect(parsePlss("12-2N-111W Montana")).toBeNull();
  });

  it("asks for the state when the named meridian spans several", () => {
    const parsed = parsePlss("Sec 12 T2N R3W Sixth Principal Meridian")!;
    expect(parsed.disambiguation?.reason).toBe("state_required");
    expect(parsed.disambiguation!.candidates.map((m) => m.code)).toEqual(["06"]);
    expect(parsed.disambiguation!.message).toMatch(/Colorado, Kansas, Nebraska, South Dakota, Wyoming/);
    expect(parsePlss("Sec 12 T2N R3W Willamette Meridian")!.disambiguation?.reason).toBe("state_required");
    expect(parsePlss("Sec 12 T2N R3W Willamette Meridian, Washington")!.disambiguation).toBeUndefined();
  });

  it("reads the 4th PM in Wisconsin and Minnesota as the Fourth Principal Meridian Extended", () => {
    expect(parsePlss("Sec 12 T2N R3W 4th PM, Wisconsin")!.components).toMatchObject({ meridian: "46", state: "WI" });
    expect(parsePlss("Sec 12 T2N R3W Fourth Principal Meridian Minnesota")!.components.meridian).toBe("46");
    expect(parsePlss("Sec 12 T2N R3W 4th PM")!.components).toMatchObject({ meridian: "04", state: "IL" });
    expect(parsePlss("Sec 12 T2N R3W 4th PM Iowa")!.disambiguation?.reason).toBe("meridian_not_in_state");
  });
});

describe("parseLegalLand with PLSS", () => {
  it("surfaces a PLSS parse as system PLSS / plss", () => {
    const parsed = parseLegalLand("NW1/4 SE1/4 Sec 12 T2N R3W PMM")!;
    expect(parsed.system).toBe("PLSS");
    expect(parsed.unit).toBe("aliquot");
    const details = toLegalLandDetails(parsed);
    expect(details.system).toBe("plss");
    expect(details.state).toBe("MT");
    expect(details.province).toBeUndefined();
  });

  it("takes a PLSS government lot before the Ontario lot grammar can claim it", () => {
    expect(parseLegalLand("Lot 3 Sec 5 T10S R22E MT")!.system).toBe("PLSS");
    expect(parseLegalLand("Lot 10 Con 1 Adjala")!.system).toBe("GTS");
  });

  it("carries the disambiguation through", () => {
    expect(parseLegalLand("Sec 12 T2N R3W")!.disambiguation?.reason).toBe("meridian_required");
  });
});

describe("CadNSDI identifiers", () => {
  it("builds the PLSSID and FRSTDIVID BLM uses for the same township and section", () => {
    // Read off the BLM service 2026-10-16: PLSSID MT200020N0030W0, FRSTDIVID MT200020N0030W0SN120.
    const c = parsePlss("Sec 12 T2N R3W PMM")!.components;
    expect(plssTownshipId(c)).toBe("MT200020N0030W0");
    expect(plssSectionId(c)).toBe("MT200020N0030W0SN120");
    const lot = parsePlss("Lot 3 Sec 5 T10S R22E MT")!.components;
    expect(plssSectionId(lot)).toBe("MT200100S0220E0SN050");
  });

  it("has no id without a state and meridian", () => {
    expect(plssTownshipId(parsePlss("Sec 12 T2N R3W")!.components)).toBeNull();
  });
});

describe("aliquotQuarterQuarters", () => {
  it("expands quarters, halves and halves of quarters into BLM quarter-quarter labels", () => {
    expect(aliquotQuarterQuarters("NE")).toEqual(["NENE", "NWNE", "SENE", "SWNE"]);
    expect(aliquotQuarterQuarters("N2NE")).toEqual(["NENE", "NWNE"]);
    expect(aliquotQuarterQuarters("E2SW")).toEqual(["NESW", "SESW"]);
    expect(aliquotQuarterQuarters("N2")).toHaveLength(8);
    expect(aliquotQuarterQuarters("N2")).toEqual(["NENE", "NWNE", "SENE", "SWNE", "NENW", "NWNW", "SENW", "SWNW"]);
  });

  it("does not expand a quarter-quarter or anything finer", () => {
    expect(aliquotQuarterQuarters("NWSE")).toBeNull();
    expect(aliquotQuarterQuarters("SENWSE")).toBeNull();
  });
});

describe("meridian and state tables", () => {
  it("never lists a state as both PLSS and non-PLSS", () => {
    for (const code of Object.keys(NON_PLSS_STATE_NAMES)) expect(PLSS_STATE_NAMES[code], code).toBeUndefined();
  });

  it("only lists PLSS states on meridians", () => {
    for (const m of PLSS_MERIDIANS) {
      for (const state of m.states) expect(PLSS_STATE_NAMES[state], `${m.code} ${state}`).toBeDefined();
    }
  });

  it("gives Montana exactly one meridian", () => {
    expect(PLSS_MERIDIANS.filter((m) => m.states.includes("MT")).map((m) => m.code)).toEqual(["20"]);
  });
});
