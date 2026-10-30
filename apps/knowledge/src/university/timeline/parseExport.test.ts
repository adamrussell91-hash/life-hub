import { describe, expect, it } from "vitest";
import { parseUniversityExport } from "./parseExport";

// Synthetic export: invented degrees, institutions and units.
const SAMPLE = `# University degrees

Generated on 2026-01-10T09:00:00+10:00 in Sydney local time.

## 1. Graduate Certificate in Example

### Degree properties

| Property | Value |
|:--|:--|
| Dates | {"end": "2019-12-31", "start": "2018-01-31"} |
| Description | Graduate Certificate in Example Studies from Example University |
| Name | Graduate Certificate in Example |
| Place | {"name": "Example University-North Campus"} |
| Status | Completed |
| Uni Type | Degree |

### Units

#### 1.1 EXMP401 - Foundations of Example

| Property | Value |
|:--|:--|
| Dates | {"end": "2018-06-21", "start": "2018-02-01"} |
| GPA Calculator | 6 |
| Grade Scale | Distinction |
| Name | EXMP401 - Foundations of Example |
| Status | Completed |
| Uni Type | Unit |

##### Assessments

###### 1.1.1 Assessment 1 - Essay

| Property | Value |
|:--|:--|
| Description | An invented essay |
| GPA Calculator | Not recorded |
| Grade Scale | Not recorded |
| Name | Assessment 1 - Essay |
| Status | Completed |
| Uni Type | Assessment |
| Unit Number | EXMP401 |
`;

const OPTIONS = {
  titleOverrides: { "Graduate Certificate in Example|Example University": "Graduate Certificate in Example Studies" },
  excludedProgrammes: ["Graduate Diploma of Sample"],
  placeSuffixes: ["North Campus"],
};

describe("parseUniversityExport", () => {
  it("keeps unit grades plus nested assessments, with no corrections by default", () => {
    const catalogue = parseUniversityExport(SAMPLE);
    expect(catalogue.generated).toBe("2026-01-10T09:00:00+10:00 in Sydney local time.");
    const degree = catalogue.degrees[0]!;
    expect(degree.title).toBe("Graduate Certificate in Example");
    expect(degree.institution).toBe("Example University-North Campus");
    expect(degree.units[0]?.code).toBe("EXMP401");
    expect(degree.units[0]?.gpaPoints).toBe(6);
    expect(degree.units[0]?.grade).toBe("Distinction");
    expect(degree.units[0]?.assessments[0]?.title).toBe("Assessment 1 - Essay");
    expect(degree.units[0]?.assessments[0]?.kind).toBe("assessment");
  });

  it("applies the private title overrides and campus suffixes", () => {
    const degree = parseUniversityExport(SAMPLE, OPTIONS).degrees[0]!;
    expect(degree.institution).toBe("Example University");
    expect(degree.title).toBe("Graduate Certificate in Example Studies");
    expect(
      parseUniversityExport(SAMPLE.replaceAll("Example University", "Sample Institute"), OPTIONS).degrees[0]?.title,
    ).toBe("Graduate Certificate in Example");
  });

  it("drops excluded programmes and recovers unit codes from titles", () => {
    const catalogue = parseUniversityExport(`# University degrees

## 5. Advanced Insights in Example

### Degree properties

| Property | Value |
|:--|:--|
| Name | Advanced Insights in Example |
| Place | {"name": "Sample Institute"} |
| Status | Completed |

### Units

#### 5.1 Academic Resources and Assignments for SMPL9001

| Property | Value |
|:--|:--|
| Name | Academic Resources and Assignments for SMPL9001 |
| Status | Completed |
| Uni Type | Unit |

## 6. Graduate Diploma of Sample

### Degree properties

| Property | Value |
|:--|:--|
| Name | Graduate Diploma of Sample |
| Place | {"name": "Sample Institute"} |
| Status | Withdrawn |
`, OPTIONS);
    expect(catalogue.degrees.map(degree => degree.title)).toEqual(["Advanced Insights in Example"]);
    expect(catalogue.degrees[0]?.institution).toBe("Sample Institute");
    expect(catalogue.degrees[0]?.units[0]?.code).toBe("SMPL9001");
  });
});
