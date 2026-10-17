import { describe, it, expect } from "vitest";
import { parseStructuredQuery } from "./structured";
import { parseRegion, regionForms } from "./regions";

const ok = (r: ReturnType<typeof parseStructuredQuery>) => {
  if ("error" in r) throw new Error(`expected a query, got: ${r.error}`);
  return r.query;
};
const err = (r: ReturnType<typeof parseStructuredQuery>) => {
  if (!("error" in r)) throw new Error("expected an error");
  return r.error;
};

describe("parseStructuredQuery", () => {
  it("normalises a province to its code from any accepted spelling", () => {
    for (const spelling of ["AB", "ab", "Alberta", "alta", "alta.", "ALTA"]) {
      expect(ok(parseStructuredQuery({ city: "Calgary", region: spelling })).region).toBe("AB");
    }
    expect(ok(parseStructuredQuery({ city: "Montréal", region: "Québec" })).region).toBe("QC");
    expect(ok(parseStructuredQuery({ city: "Montreal", region: "quebec" })).region).toBe("QC");
  });

  it("normalises postal-code spacing and case", () => {
    expect(ok(parseStructuredQuery({ postalcode: "m5h 2n2" })).postalcode).toBe("M5H2N2");
    expect(ok(parseStructuredQuery({ postalcode: "M5H2N2" })).postalcode).toBe("M5H2N2");
  });

  it("rejects a postal code that is not one", () => {
    expect(err(parseStructuredQuery({ postalcode: "90210" }))).toMatch(/postal code/);
  });

  it("rejects an unknown province and names the codes", () => {
    const e = err(parseStructuredQuery({ city: "Buffalo", region: "NY" }));
    expect(e).toMatch(/unknown region/);
    expect(e).toMatch(/AB, BC/);
  });

  it("reads country CA as Canada and rejects a country it cannot name", () => {
    expect(ok(parseStructuredQuery({ city: "Calgary", country: "canada" })).country).toBe("CA");
    expect(err(parseStructuredQuery({ city: "Paris", country: "FR" }))).toMatch(/unknown country "FR". Use CA, US, MX/);
  });

  it("reads region inside the country: CA is California in the US and not a province in Canada", () => {
    expect(ok(parseStructuredQuery({ city: "Sacramento", region: "CA", country: "US" })).region).toBe("CA");
    expect(ok(parseStructuredQuery({ city: "Sacramento", region: "California", country: "USA" })).country).toBe("US");
    expect(err(parseStructuredQuery({ city: "Sacramento", region: "CA" }))).toMatch(/unknown region "CA" in CA/);
    expect(ok(parseStructuredQuery({ city: "Buffalo", region: "NY", country: "US" })).region).toBe("NY");
    expect(ok(parseStructuredQuery({ city: "Monterrey", region: "Nuevo León", country: "México" })).region).toBe("NLE");
    expect(err(parseStructuredQuery({ city: "Calgary", region: "AB", country: "US" }))).toMatch(/unknown region "AB" in US/);
  });

  it("reads postal codes by the country's own syntax and keeps leading zeros", () => {
    expect(ok(parseStructuredQuery({ postalcode: "02134", country: "US" })).postalcode).toBe("02134");
    expect(ok(parseStructuredQuery({ postalcode: "02134-1234", country: "US" })).postalcode).toBe("02134-1234");
    expect(ok(parseStructuredQuery({ postalcode: "021341234", country: "US" })).postalcode).toBe("02134-1234");
    expect(ok(parseStructuredQuery({ postalcode: "01000", country: "MX" })).postalcode).toBe("01000");
    expect(err(parseStructuredQuery({ postalcode: "M5H 2N2", country: "US" }))).toMatch(/US ZIP code/);
    expect(err(parseStructuredQuery({ postalcode: "1000", country: "MX" }))).toMatch(/five-digit Mexican/);
  });

  it("refuses a search that is only a province", () => {
    expect(err(parseStructuredQuery({ region: "AB" }))).toMatch(/at least one of address, city, postalcode/);
    expect(err(parseStructuredQuery({ region: "AB", country: "CA" }))).toMatch(/at least one of/);
  });

  it("refuses an entirely empty query", () => {
    expect(err(parseStructuredQuery({}))).toMatch(/at least one of/);
    expect(err(parseStructuredQuery({ city: "   " }))).toMatch(/at least one of/);
  });

  it("accepts each anchor field on its own", () => {
    expect(ok(parseStructuredQuery({ city: "Iqaluit" })).city).toBe("Iqaluit");
    expect(ok(parseStructuredQuery({ address: "101 17 Ave SW" })).address).toBe("101 17 Ave SW");
    expect(ok(parseStructuredQuery({ postalcode: "X0A0H0" })).postalcode).toBe("X0A0H0");
  });

  it("always reports the country, so a caller never has to infer it", () => {
    expect(ok(parseStructuredQuery({ city: "Calgary" })).country).toBe("CA");
  });
});

describe("regions", () => {
  it("resolves accented and unaccented spellings to the same code", () => {
    expect(parseRegion("Québec")).toBe("QC");
    expect(parseRegion("quebec")).toBe("QC");
    expect(parseRegion("nouvelle-écosse")).toBe("NS");
    expect(parseRegion("nouvelle-ecosse")).toBe("NS");
  });

  it("does not read ordinary words as provinces", () => {
    expect(parseRegion("que")).toBeUndefined();
    expect(parseRegion("man")).toBeUndefined();
    expect(parseRegion("que.")).toBe("QC");
  });

  it("lists every corpus spelling of a code, uppercased", () => {
    const forms = regionForms("ON");
    expect(forms).toContain("ON");
    expect(forms).toContain("ONTARIO");
    expect(forms).toContain("ONT");
  });
});
