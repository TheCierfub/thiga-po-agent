import type { Feedback, MaskedFeedback, PiiKind } from "../schemas";

const STREET_TYPES =
  "rue|avenue|av\\.|boulevard|bd|impasse|allée|allee|chemin|place|quai|route|cours|faubourg|square";

const PATTERNS: { kind: PiiKind; token: string; regex: RegExp }[] = [
  {
    kind: "email",
    token: "[EMAIL]",
    regex: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  },
  {
    kind: "telephone",
    token: "[TÉLÉPHONE]",
    regex: /(?:\+33[\s.-]?|\b0)[1-9](?:[\s.-]?\d{2}){4}\b/g,
  },
  {
    kind: "adresse",
    token: "[ADRESSE]",
    // Numéro + type de voie + nom, avec code postal et ville facultatifs.
    // Pas de virgule entre numéro et voie : « lot R+2, Quai 17 » n'est pas une adresse.
    regex: new RegExp(
      `\\b\\d{1,4}(?:\\s?(?:bis|ter))?\\s+(?:${STREET_TYPES})\\s+[^\\n,.;]{2,60}?(?:,\\s*\\d{5}\\s+[A-ZÀ-Ý][\\p{L}'-]+(?:\\s[A-ZÀ-Ý][\\p{L}'-]+)*)?(?=[,.;\\n]|$)`,
      "giu",
    ),
  },
];

export interface MaskResult {
  text: string;
  pii: { kind: PiiKind; count: number }[];
}

export function maskText(text: string): MaskResult {
  let masked = text;
  const pii: { kind: PiiKind; count: number }[] = [];
  for (const { kind, token, regex } of PATTERNS) {
    let count = 0;
    masked = masked.replace(regex, () => {
      count += 1;
      return token;
    });
    if (count > 0) pii.push({ kind, count });
  }
  return { text: masked, pii };
}

export function maskFeedback(feedback: Feedback): MaskedFeedback {
  const { text, pii } = maskText(feedback.text);
  return { ...feedback, maskedText: text, pii };
}
