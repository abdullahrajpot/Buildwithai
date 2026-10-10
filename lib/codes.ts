// Tiny code lookup (spec section 11). DEMO ONLY.
// ICD-10-CM codes are public. CPT codes belong to the AMA, so only two are listed, with our own
// plain-language descriptions. Verify every code before presenting.

export const ICD10: Record<string, string> = {
  "M25.561": "Pain in right knee",
  "M25.562": "Pain in left knee",
  "M17.11": "Unilateral primary osteoarthritis, right knee",
  "M17.12": "Unilateral primary osteoarthritis, left knee",
  "M54.16": "Radiculopathy, lumbar region",
  "M54.50": "Low back pain, unspecified",
};

export const CPT: Record<string, { name: string; description: string; region: "knee" | "lumbar" }> = {
  "73721": { name: "MRI knee", description: "MRI of a lower-extremity joint (knee) without contrast (demo description)", region: "knee" },
  "72148": { name: "MRI lumbar spine", description: "MRI of the lumbar spine without contrast (demo description)", region: "lumbar" },
};

export const isKnownIcd = (code: string) => code in ICD10;
export const isKnownCpt = (code: string) => code in CPT;
export const procedureName = (code: string) => CPT[code]?.name ?? code;
