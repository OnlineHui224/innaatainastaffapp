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
  isUuid,
  MAX_BYTES,
  normaliseConfidence,
  normaliseValue,
  validateBody,
  validateDetails,
  validateFields,
} from "./validation.ts";

const CASE_KEY = "0f8fad5b-d9cb-469f-a165-70867728950e";
const AGENT_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

/** A minimal valid Step 1 payload; individual checks override one key at a time. */
const DETAILS = {
  clientSource: "sub_agent",
  subAgentId: AGENT_ID,
  agentName: "Some Agent Ltd",
  visaCompany: "A Visa Company",
  transportPackage: "full_route",
};

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

console.log("\n═══ RESPONSIBILITY INTEGRITY ═══");
/* A record must not contradict itself. These mirror the database CHECK, so a
   contradiction is refused with a readable message instead of surfacing as a
   constraint violation. */
const subAgentOk = validateDetails(DETAILS);
check("a sub-agent client with an agent is accepted", subAgentOk.ok);
eq("the agent id survives", subAgentOk.ok ? subAgentOk.details.subAgentId : null, AGENT_ID);

const subAgentNoId = validateDetails({ ...DETAILS, subAgentId: null });
check("a sub-agent client WITHOUT an agent is rejected", !subAgentNoId.ok);
eq("rejected as invalid_details", subAgentNoId.ok ? null : subAgentNoId.code, "invalid_details");

const directOk = validateDetails({ ...DETAILS, clientSource: "direct", subAgentId: null });
check("a direct client with no agent is accepted", directOk.ok);
eq("a direct client carries no agent", directOk.ok ? directOk.details.subAgentId : "x", null);

const directWithAgent = validateDetails({ ...DETAILS, clientSource: "direct" });
check("a direct client WITH an agent is rejected", !directWithAgent.ok);

const badAgentId = validateDetails({ ...DETAILS, subAgentId: "not-a-uuid" });
check("a non-uuid agent id is rejected, not silently kept", !badAgentId.ok);

console.log("\n═══ OPERATIONAL DETAIL NORMALISATION ═══");
const dated = validateDetails({
  ...DETAILS,
  plannedDepartureDate: "2026-09-01",
  expectedReturnDate: "2026-09-20",
  arrivalPort: "  Jeddah ",
});
eq("a valid date is kept", dated.ok ? dated.details.plannedDepartureDate : null, "2026-09-01");
eq("arrival port is trimmed", dated.ok ? dated.details.arrivalPort : null, "Jeddah");

for (const bad of ["2026-02-31", "01/09/2026", "2026-9-1", "tomorrow", ""]) {
  const r = validateDetails({ ...DETAILS, plannedDepartureDate: bad });
  eq(
    `invalid date ${JSON.stringify(bad)} becomes null`,
    r.ok ? r.details.plannedDepartureDate : "not-ok",
    null,
  );
}

const badPackage = validateDetails({ ...DETAILS, transportPackage: "helicopter" });
check("an unrecognised transport package is rejected", !badPackage.ok);
for (const pkg of ["airport_transfers", "full_route", "no_transport"]) {
  check(`transport package ${pkg} is accepted`, validateDetails({ ...DETAILS, transportPackage: pkg }).ok);
}
check("a null transport package is accepted", validateDetails({ ...DETAILS, transportPackage: null }).ok);

const noDetails = validateDetails(undefined);
check("missing details are rejected", !noDetails.ok);
check("an array of details is rejected", !validateDetails([]).ok);

console.log("\n═══ UUID GUARD ═══");
check("a real uuid is recognised", isUuid(CASE_KEY));
check("a truncated uuid is not", !isUuid(CASE_KEY.slice(0, 20)));
check("a non-string is not", !isUuid(42));
check("empty is not", !isUuid(""));

console.log("\n═══ REQUEST BODY ═══");
const pdf = {
  mimeType: "application/pdf",
  dataBase64: "AAAA",
  caseKey: CASE_KEY,
  details: DETAILS,
};
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
  const bad = validateBody({ ...pdf, dataBase64: value });
  check(`${label} document data is rejected`, !bad.ok);
}
eq(
  "non-base64 data is rejected",
  (() => { const r = validateBody({ ...pdf, dataBase64: "not base64!!" }); return r.ok ? null : r.code; })(),
  "invalid_request",
);
check("a non-object body is rejected", !validateBody("hello").ok);

/* Without a case key an extraction could not be made idempotent, so it is
   refused rather than allowed to create an unbounded number of records. */
check("a body with no case key is rejected", !validateBody({ mimeType: "application/pdf", dataBase64: "AAAA", details: DETAILS }).ok);
check("a body with a bad case key is rejected", !validateBody({ ...pdf, caseKey: "nope" }).ok);
check("a body with contradictory responsibility is rejected", !validateBody({ ...pdf, details: { ...DETAILS, clientSource: "direct" } }).ok);
eq("the case key survives validation", (() => { const r = validateBody(pdf); return r.ok ? r.body.caseKey : null; })(), CASE_KEY);
check("an array body is rejected", !validateBody([]).ok);
check("null body is rejected", !validateBody(null).ok);

/* The server limit is the one that counts — a caller that skips the browser
   entirely still cannot push 10 MB+ through. */
const oversized = validateBody({
  ...pdf,
  dataBase64: "A".repeat(Math.ceil(((MAX_BYTES + 1024) * 4) / 3)),
});
check("a document over 10 MB is rejected", !oversized.ok);
eq("rejected with too_large", oversized.ok ? null : oversized.code, "too_large");
eq("rejected with HTTP 413", oversized.ok ? null : oversized.status, 413);

const atLimit = validateBody({
  ...pdf,
  dataBase64: "A".repeat(Math.floor((MAX_BYTES * 4) / 3 / 4) * 4),
});
check("a document just under the limit is accepted", atLimit.ok);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  throw new Error(`Validation checks failed:\n  - ${failures.join("\n  - ")}`);
}
