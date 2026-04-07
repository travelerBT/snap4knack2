import { DlpServiceClient, protos as dlpProtos } from "@google-cloud/dlp";

const dlpClient = new DlpServiceClient();
const PROJECT_ID = "snap4knack2";

// HIPAA infoTypes — must match the set in index.ts
export const HIPAA_INFO_TYPES: dlpProtos.google.privacy.dlp.v2.IInfoType[] = [
  { name: "PERSON_NAME" },
  { name: "DATE_OF_BIRTH" },
  { name: "US_SOCIAL_SECURITY_NUMBER" },
  { name: "PHONE_NUMBER" },
  { name: "EMAIL_ADDRESS" },
  { name: "MEDICAL_RECORD_NUMBER" },
  { name: "US_HEALTHCARE_NPI" },
  { name: "STREET_ADDRESS" },
  { name: "US_DEA_NUMBER" },
  { name: "US_DRIVERS_LICENSE_NUMBER" },
  { name: "PASSPORT" },
  { name: "US_BANK_ROUTING_MICR" },
  { name: "IBAN_CODE" },
  { name: "CREDIT_CARD_NUMBER" },
  { name: "IP_ADDRESS" },
];

export const HIPAA_CUSTOM_INFO_TYPES: dlpProtos.google.privacy.dlp.v2.ICustomInfoType[] = [
  {
    infoType: { name: "PHONE_NUMBER_REDACTED" },
    likelihood: dlpProtos.google.privacy.dlp.v2.Likelihood.VERY_LIKELY,
    regex: { pattern: "(\\([0-9]{3}\\)[ .-]?[0-9]{3}[.-][0-9]{4}|[0-9]{3}[ .-][0-9]{3}[ .-][0-9]{4})" },
  },
  {
    infoType: { name: "SSN_REDACTED" },
    likelihood: dlpProtos.google.privacy.dlp.v2.Likelihood.VERY_LIKELY,
    regex: { pattern: "[0-9]{3}[-. ][0-9]{2}[-. ][0-9]{4}" },
  },
];

export const DLP_REPLACEMENTS: Array<{ infoTypes: { name: string }[]; label: string }> = [
  { infoTypes: [{ name: "PHONE_NUMBER" }, { name: "PHONE_NUMBER_REDACTED" }],          label: "[PHONE_REDACTED]" },
  { infoTypes: [{ name: "US_SOCIAL_SECURITY_NUMBER" }, { name: "SSN_REDACTED" }],      label: "[SSN_REDACTED]" },
  { infoTypes: [{ name: "EMAIL_ADDRESS" }],                                             label: "[EMAIL_REDACTED]" },
  { infoTypes: [{ name: "PERSON_NAME" }],                                               label: "[NAME_REDACTED]" },
  { infoTypes: [{ name: "DATE_OF_BIRTH" }],                                             label: "[DOB_REDACTED]" },
  { infoTypes: [{ name: "STREET_ADDRESS" }],                                            label: "[ADDRESS_REDACTED]" },
  { infoTypes: [{ name: "MEDICAL_RECORD_NUMBER" }],                                     label: "[MRN_REDACTED]" },
  { infoTypes: [{ name: "US_HEALTHCARE_NPI" }],                                         label: "[NPI_REDACTED]" },
  { infoTypes: [{ name: "US_DEA_NUMBER" }],                                             label: "[DEA_REDACTED]" },
  { infoTypes: [{ name: "US_DRIVERS_LICENSE_NUMBER" }],                                 label: "[LICENSE_REDACTED]" },
  { infoTypes: [{ name: "PASSPORT" }],                                                  label: "[PASSPORT_REDACTED]" },
  { infoTypes: [{ name: "US_BANK_ROUTING_MICR" }, { name: "IBAN_CODE" }],              label: "[BANK_REDACTED]" },
  { infoTypes: [{ name: "CREDIT_CARD_NUMBER" }],                                        label: "[CARD_REDACTED]" },
  { infoTypes: [{ name: "IP_ADDRESS" }],                                                label: "[IP_REDACTED]" },
];

/** DLP text redaction — replaces PHI tokens inline with [TYPE] placeholders. Fail-closed. */
export async function dlpRedactText(text: string): Promise<string> {
  if (!text || text.length < 3) return text;
  try {
    const [response] = await dlpClient.deidentifyContent({
      parent: `projects/${PROJECT_ID}/locations/global`,
      inspectConfig: {
        infoTypes: HIPAA_INFO_TYPES,
        customInfoTypes: HIPAA_CUSTOM_INFO_TYPES,
        minLikelihood: dlpProtos.google.privacy.dlp.v2.Likelihood.POSSIBLE,
      },
      deidentifyConfig: {
        infoTypeTransformations: {
          transformations: DLP_REPLACEMENTS.map(({ infoTypes, label }) => ({
            infoTypes,
            primitiveTransformation: { replaceConfig: { newValue: { stringValue: label } } },
          })),
        },
      },
      item: { value: text },
    });
    return response.item?.value ?? text;
  } catch (e) {
    console.error("[DLP] Text redaction error:", e);
    throw e; // fail-closed: don't store unredacted PHI
  }
}

/** Strip query parameters from a URL string (HIPAA safe). */
export function stripQueryParams(url: string): string {
  try {
    const u = new URL(url);
    u.search = "";
    return u.toString();
  } catch {
    return url;
  }
}
