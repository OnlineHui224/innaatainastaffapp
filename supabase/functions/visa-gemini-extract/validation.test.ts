/**
 * VISA EXTRACTION — validation checks
 * ===================================
 *
 * Deliberately framework-free: the checks run at module load and throw at the
 * end if any failed, so the same file executes under Deno (`deno run
 * validation.test.ts`) and under Node once transpiled. No test runner has to be
 * added to the repository for these to be runnable.
 *
 * What is being defended here is one rule: HajjERP must never surface an
 * identifier that the document did not actually contain. Most of these cases
 * are ways a model can dress up "I could not read this" as an answer.
 */

import {
  base64ByteLength,
  isEmptyExtraction,
  MAX_BYTES,
  normaliseConfidence,
  normaliseValue,
  validateBody,
  validateFields,
} from "./validation.ts";

let passed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean): void {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL  ${label}`);
  }
}

function eq(label: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  check(label, ok);
}

console.log("\n═══ VALUE NORMALISATION — nothing is invented ═══");
eq("plain value is kept", normaliseValue("A01234567"), "A01234567");
eq("surrounding space is trimmed", normaliseValue("  A01234567 "), "A01234567");
eq("internal whitespace collapses", normaliseValue("Zainab   Tukur\nMuhammad"), "Zainab Tukur Muhammad");
eq("non-string becomes null", normaliseValue(12345), null);
eq("undefined becomes null", normaliseValue(undefined), null);
eq("empty string becomes null", normaliseValue(""), null);
eq("whitespace-only becomes null", normaliseValue("   "), null);

/* A model asked for a string will often write a placeholder rather than admit
   defeat. Each of these must reach the officer as a blank field to type, not as
   a passport number reading "N/A". */
for (const placeholder of ["N/A", "n/a", "NA", "none", "NULL", "Unknown", "not visible", "not legible", "illegible", "-", "--", "not found"]) {
  eq(`placeholder ${JSON.stringify(placeholder)} becomes null`, normaliseValue(placeholder), null);
}

/* Prose where an identifier belongs means the model answered a different
   question. Surfacing a paragraph as a passport number would be worse than
   surfacing nothing. */
eq("over-long prose becomes null", normaliseValue("x".repeat(121)), null);
check("a value at the length limit survives", normaliseValue("y".repeat(120)) !== null);

console.log("\n═══ CONFIDENCE — degrades, never upgrades ═══");
eq("high is preserved", normaliseConfidence("high", true), "high");
eq("medium is preserved", normaliseConfidence("medium", true), "medium");
eq("low is preserved", normaliseConfidence("low", true), "low");
eq("unknown confidence degrades to low", normaliseConfidence("certain", true), "low");
eq("missing confidence degrades to low", normaliseConfidence(undefined, true), "low");
eq("a null value is always low confidence", normaliseConfidence("high", false), "low");

console.log("\n═══ FIELD VALIDATION ═══");
const good = validateFields({
  travellerName: { value: "Zainab Tukur Muhammad", confidence: "high" },
  passportNumber: { value: "A01234567", confidence: "high" },
  visaNumber: { value: "V-55512", confidence: "medium" },
  nationality: { value: "Nigerian", confidence: "high" },
});
check("a well-formed response validates", good !== null);
eq("traveller name survives", good?.travellerName.value, "Zainab Tukur Muhammad");
eq("medium confidence survives", good?.visaNumber.confidence, "medium");

const partial = validateFields({
  travellerName: { value: "Habib Yaru", confidence: "high" },
  passportNumber: { value: null, confidence: "high" },
  visaNumber: { value: "N/A", confidence: "high" },
  nationality: {},
});
eq("an unreadable passport stays null", partial?.passportNumber.value, null);
eq("a placeholder visa number stays null", partial?.visaNumber.value, null);
eq("a missing field becomes null", partial?.nationality.value, null);
eq("null passport is reported low confidence", partial?.passportNumber.confidence, "low");
check("a partial response still validates", partial !== null);

/* Missing keys must not become `undefined` in the review screen. */
const empty = validateFields({});
check("an empty object still yields all four fields", empty !== null);
eq("every field is null", [empty?.travellerName.value, empty?.passportNumber.value, empty?.visaNumber.value, empty?.nationality.value], [null, null, null, null]);
check("all-null is detected as an empty extraction", empty !== null && isEmptyExtraction(empty));
check("a partial extraction is NOT empty", partial !== null && !isEmptyExtraction(partial));

eq("a JSON array is rejected", validateFields([{ travellerName: "x" }]), null);
eq("a bare string is rejected", validateFields("passport A01234567"), null);
eq("null is rejected", validateFields(null), null);

console.log("\n═══ BASE64 SIZE ACCOUNTING ═══");
eq("no padding", base64ByteLength("AAAA"), 3);
eq("one pad character", base64ByteLength("AAA="), 2);
eq("two pad characters", base64ByteLength("AA=="), 1);

console.log("\n═══ REQUEST BODY ═══");
const pdf = { mimeType: "application/pdf", dataBase64: "AAAA" };
check("a valid PDF is accepted", validateBody(pdf).ok);
check("a valid PNG is accepted", validateBody({ ...pdf, mimeType: "image/png" }).ok);
check("a valid JPEG is accepted", validateBody({ ...pdf, mimeType: "image/jpeg" }).ok);
check("uppercase MIME is accepted", validateBody({ ...pdf, mimeType: "Application/PDF" }).ok);

/* Browsers sometimes report this non-standard type, and UploadVisaCard accepts
   it. Rejecting it server-side would break a real officer's upload. */
const alias = validateBody({ ...pdf, mimeType: "image/jpg" });
check("image/jpg is accepted", alias.ok);
eq("image/jpg is normalised for the provider", alias.ok ? alias.body.mimeType : null, "image/jpeg");

const wrongType = validateBody({ ...pdf, mimeType: "application/zip" });
check("an unsupported type is rejected", !wrongType.ok);
eq("rejected with unsupported_type", wrongType.ok ? null : wrongType.code, "unsupported_type");
eq("rejected with HTTP 415", wrongType.ok ? null : wrongType.status, 415);

for (const [label, value] of [["missing", undefined], ["empty", ""], ["a number", 4]] as const) {
  const bad = validateBody({ mimeType: "application/pdf", dataBase64: value });
  check(`${label} document data is rejected`, !bad.ok);
}
eq(
  "non-base64 data is rejected",
  (() => { const r = validateBody({ mimeType: "application/pdf", dataBase64: "not base64!!" }); return r.ok ? null : r.code; })(),
  "invalid_request",
);
check("a non-object body is rejected", !validateBody("hello").ok);
check("an array body is rejected", !validateBody([]).ok);
check("null body is rejected", !validateBody(null).ok);

/* The server limit is the one that counts — a caller that skips the browser
   entirely still cannot push 10 MB+ through. */
const oversized = validateBody({
  mimeType: "application/pdf",
  dataBase64: "A".repeat(Math.ceil(((MAX_BYTES + 1024) * 4) / 3)),
});
check("a document over 10 MB is rejected", !oversized.ok);
eq("rejected with too_large", oversized.ok ? null : oversized.code, "too_large");
eq("rejected with HTTP 413", oversized.ok ? null : oversized.status, 413);

const atLimit = validateBody({
  mimeType: "application/pdf",
  dataBase64: "A".repeat(Math.floor((MAX_BYTES * 4) / 3 / 4) * 4),
});
check("a document just under the limit is accepted", atLimit.ok);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  throw new Error(`Validation checks failed:\n  - ${failures.join("\n  - ")}`);
}
