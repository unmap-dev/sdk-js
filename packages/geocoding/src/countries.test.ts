import { describe, expect, it } from "vitest";
import {
  COUNTRY_CODES,
  parseCountry,
  parseCountryList,
  parsePostalCode,
  parseSubdivision,
  subdivisionCodes,
  subdivisionForms,
} from "./countries";

describe("countries", () => {
  it("reads ISO codes and en/fr/es names, accent- and case-insensitively", () => {
    for (const s of ["CA", "can", "Canada"]) expect(parseCountry(s)).toBe("CA");
    for (const s of ["US", "USA", "U.S.A.", "United States", "États-Unis", "Estados Unidos", "EE. UU."]) {
      expect(parseCountry(s)).toBe("US");
    }
    for (const s of ["MX", "MEX", "Mexico", "México", "Mexique"]) expect(parseCountry(s)).toBe("MX");
    expect(parseCountry("FR")).toBeUndefined();
    expect(parseCountry("")).toBeUndefined();
  });

  it("parses a country list, keeps order, collapses duplicates, and rejects one bad entry", () => {
    expect(parseCountryList(undefined)).toEqual({});
    expect(parseCountryList("  ")).toEqual({});
    expect(parseCountryList("us,CA,usa")).toEqual({ countries: ["US", "CA"] });
    expect(parseCountryList("CA,FR")).toEqual({ error: 'unknown country "FR". Use CA, US, MX' });
    expect(parseCountryList("CA,")).toHaveProperty("error");
  });

  it("has 13 Canadian, 51 US and 32 Mexican subdivisions", () => {
    expect(COUNTRY_CODES).toEqual(["CA", "US", "MX"]);
    expect(subdivisionCodes("CA")).toHaveLength(13);
    expect(subdivisionCodes("US")).toHaveLength(51);
    expect(subdivisionCodes("MX")).toHaveLength(32);
  });

  it("never reads a subdivision outside its country", () => {
    expect(parseSubdivision("US", "CA")).toBe("CA");
    expect(parseSubdivision("US", "california")).toBe("CA");
    expect(parseSubdivision("CA", "CA")).toBeUndefined();
    expect(parseSubdivision("CA", "Québec")).toBe("QC");
    expect(parseSubdivision("US", "Québec")).toBeUndefined();
    expect(parseSubdivision("US", "Washington, D.C.")).toBe("DC");
    expect(parseSubdivision("US", "Washington")).toBe("WA");
    expect(parseSubdivision("MX", "Ciudad de México")).toBe("CMX");
    expect(parseSubdivision("MX", "CDMX")).toBe("CMX");
    expect(parseSubdivision("MX", "México")).toBe("MEX");
    expect(parseSubdivision("MX", "nuevo leon")).toBe("NLE");
    expect(parseSubdivision("MX", "NL")).toBeUndefined();
  });

  it("lists every corpus spelling of a subdivision for the SQL filter", () => {
    expect(subdivisionForms("US", "CA")).toEqual(["CA", "CALIFORNIA"]);
    expect(subdivisionForms("MX", "CMX")).toEqual(["CMX", "CIUDAD DE MEXICO", "CDMX", "MEXICO CITY"]);
    expect(subdivisionForms("CA", "ON")).toContain("ONTARIO");
  });

  it("checks postal syntax per country and keeps leading zeros", () => {
    expect(parsePostalCode("CA", "m5h 2n2")).toEqual({ postalcode: "M5H2N2" });
    expect(parsePostalCode("US", "02134")).toEqual({ postalcode: "02134" });
    expect(parsePostalCode("US", "02134 1234")).toEqual({ postalcode: "02134-1234" });
    expect(parsePostalCode("US", "2134")).toHaveProperty("error");
    expect(parsePostalCode("US", "02134-12")).toHaveProperty("error");
    expect(parsePostalCode("MX", "01000")).toEqual({ postalcode: "01000" });
    expect(parsePostalCode("MX", "01000-1234")).toHaveProperty("error");
    expect(parsePostalCode("CA", "02134")).toHaveProperty("error");
  });
});
