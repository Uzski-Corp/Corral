import { describe, expect, it } from "vitest";
import {
  DUP_POLICY, MAX_CSV_BYTES, checkCsvFile, checkCsvShape, detectDelimiter, fieldLabel, findDuplicates, guessField, guessMapping, importPlan,
  mappingIssueText, mappingIssues, normDomain, parseCsv, recordOf, rowErrors, type Mapping,
} from "./import";

const csv = (s: string) => parseCsv(s);

describe("parseCsv", () => {
  it("reads quotes, escaped quotes, CRLF, a BOM and drops blank lines", () => {
    const c = csv('\uFEFFCompany,Note\r\n"Kilima, Ltd","said ""yes"""\r\n\r\nPwani,\n');
    expect(c.headers).toEqual(["Company", "Note"]);
    expect(c.rows).toEqual([["Kilima, Ltd", 'said "yes"'], ["Pwani", ""]]);
    expect(c.delimiter).toBe(",");
  });
  it("detects semicolons and tabs, and keeps a last line with no newline", () => {
    expect(detectDelimiter("a;b;c")).toBe(";");
    expect(detectDelimiter("a\tb")).toBe("\t");
    expect(csv("a;b\n1;2").rows).toEqual([["1", "2"]]);
    expect(csv("a,b\n1,\"x\ny\"").rows).toEqual([["1", "x\ny"]]);
    expect(csv("").headers).toEqual([]);
  });
});

describe("file and shape checks", () => {
  it("names the fix for spreadsheets and other formats", () => {
    expect(checkCsvFile({ name: "leads.csv", size: 10 })).toEqual({ ok: true });
    expect(checkCsvFile({ name: "leads.XLSX", size: 10 })).toMatchObject({ ok: false, title: ".xlsx files can't be imported", fix: expect.stringContaining("CSV UTF-8") });
    expect(checkCsvFile({ name: "people.vcf", size: 10 })).toMatchObject({ fix: expect.stringContaining("Contact cards") });
    expect(checkCsvFile({ name: "notes.pdf", size: 10 })).toMatchObject({ fix: expect.stringContaining("Export it as CSV") });
    expect(checkCsvFile({ name: "README", size: 10 })).toMatchObject({ title: "This file has no extension" });
    expect(checkCsvFile({ name: "big.csv", size: MAX_CSV_BYTES + 5 * 1048576 })).toMatchObject({ title: "25 MB is over the 20 MB limit" });
    expect(checkCsvFile({ name: "empty.tsv", size: 0 })).toMatchObject({ title: "This file is empty" });
  });
  it("needs a header, two columns and 1–50,000 rows", () => {
    expect(checkCsvShape(csv("Company\nKilima"))).toMatchObject({ title: "Only one column found" });
    expect(checkCsvShape(csv("Company,Email"))).toMatchObject({ title: "No rows under the header" });
    const big = { headers: ["a", "b"], rows: Array.from({ length: 50_001 }, () => ["1", "2"]), delimiter: "," };
    expect(checkCsvShape(big)).toMatchObject({ title: "50,001 rows is over the 50,000 limit" });
    expect(checkCsvShape(csv("a,b\n1,2"))).toEqual({ ok: true });
  });
});

describe("mapping", () => {
  it("guesses from headers first, then from values", () => {
    expect(guessField("E-mail")).toBe("email");
    expect(guessField("company_name")).toBe("company");
    expect(guessField("Contact", [])).toBe("name");
    expect(guessField("Col 7", ["a@b.co", "c@d.io"])).toBe("email");
    expect(guessField("Col 8", ["https://kilima.co.ke", "www.pwani.com"])).toBe("domain");
    expect(guessField("Lifecycle stage", ["Lead"])).toBe("skip");
  });
  it("takes each field once and reports what blocks the import", () => {
    const c = csv("Associated Company,First Name,Last Name,Full name,Email,Secondary email\nKitale,A,O,A O,a@k.co.ke,a@gmail.com");
    const m = guessMapping(c);
    expect(m).toEqual(["skip", "first", "last", "name", "email", "skip"]);
    const twice: Mapping = [...m]; twice[5] = "email";
    const issues = mappingIssues(twice);
    expect(issues.map((i) => i.kind)).toEqual(["missing-company", "twice", "name-split"]);
    expect(mappingIssueText(issues[0], c.headers)).toContain("Company name or Website");
    expect(mappingIssueText(issues[1], c.headers)).toBe("“Email” and “Secondary email” both map to Work email. Pick one, set the other to Don't import.");
    expect(mappingIssueText(issues[2], c.headers)).toContain("not both");
    expect(mappingIssues(["company", "email"])).toEqual([]);
    expect(fieldLabel("skip")).toBe("Don't import");
    expect(fieldLabel("domain")).toBe("Website");
  });
});

describe("rows, duplicates and the plan", () => {
  const c = csv([
    "Company,Website,First,Last,Email",
    "Kilima Dairies,https://www.kilima.co.ke/about,Wanjiru,Mwangi,WANJIRU@kilima.co.ke", // existing by email
    "Nanyuki Dairies,nanyukidairies.co.ke,Achieng,Otieno,achieng.at.nanyuki",            // bad email
    ",,,,",                                                                              // blank: dropped by the parser
    ",,Nobody,,nobody@x.co",                                                             // no company
    "Kitale Cold,kitalecold.co.ke,Baraka,W,baraka@kitalecold.co.ke",
    "Kitale Cold,kitalecold.co.ke,Baraka,W,baraka@kitalecold.co.ke",                     // repeated in file (email)
    "Ruiru Poultry,ruirupoultry.co.ke,Mercy,N,",                                         // existing by website
    "Embu Fresh,embufresh.co.ke,,,",
    "Embu Fresh again,embufresh.co.ke,,,",                                               // repeated in file (website)
    "Voi Meat,not a site,,,",                                                            // bad website
  ].join("\n"));
  const m: Mapping = ["company", "domain", "first", "last", "email"];
  const existing = [{ id: "kilima", company: "Kilima Dairies", domain: "kilima.co.ke", email: "wanjiru@kilima.co.ke" }, { id: "ruiru", company: "Ruiru Poultry", domain: "ruirupoultry.co.ke" }];

  it("normalises websites and emails, and joins split names", () => {
    expect(normDomain(" HTTPS://www.Kilima.co.ke/about?x=1 ")).toBe("kilima.co.ke");
    expect(recordOf(c.rows[0], m)).toMatchObject({ domain: "kilima.co.ke", email: "wanjiru@kilima.co.ke", name: "Wanjiru Mwangi" });
  });
  it("lists row errors with spreadsheet row numbers", () => {
    expect(rowErrors(c, m)).toEqual([
      { row: 3, field: "email", value: "achieng.at.nanyuki", message: "Not an email address" },
      { row: 4, field: "company", value: "", message: "No company name or website" },
      { row: 10, field: "domain", value: "not a site", message: "Not a website" },
    ]);
  });
  it("finds duplicates by email, then website, in Corral and in the file", () => {
    expect(findDuplicates(c, m, existing)).toEqual([
      { row: 2, kind: "existing", match: "Kilima Dairies", by: "email" },
      { row: 6, kind: "in-file", match: "row 5", by: "email" },
      { row: 7, kind: "existing", match: "Ruiru Poultry", by: "website" },
      { row: 9, kind: "in-file", match: "row 8", by: "website" },
    ]);
  });
  it("plans creates, updates and skips per duplicate policy", () => {
    expect(importPlan(c, m, existing, "fill")).toEqual({ total: 9, create: 2, update: 2, skipped: 2, errors: 3, inFile: 2, existingDup: 2 });
    expect(importPlan(c, m, existing, "skip")).toMatchObject({ create: 2, update: 0, skipped: 4 });
    expect(importPlan(c, m, existing, "overwrite")).toMatchObject({ update: 2 });
    expect(Object.keys(DUP_POLICY)).toEqual(["skip", "fill", "overwrite"]);
  });
});
