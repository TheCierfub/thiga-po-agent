import type { Account, AuthorMatch, Feedback } from "../schemas";

interface Index {
  byEmail: Map<string, Account>;
  byHandle: Map<string, Account>;
  byDomain: Map<string, Account[]>;
}

const normalizeHandle = (h: string) => h.trim().toLowerCase();
const domainOf = (email: string) => email.split("@")[1]?.toLowerCase() ?? "";

export function buildIdentityIndex(accounts: Account[]): Index {
  const byEmail = new Map<string, Account>();
  const byHandle = new Map<string, Account>();
  const byDomain = new Map<string, Account[]>();
  for (const account of accounts) {
    for (const contact of account.contacts) {
      const email = contact.email.toLowerCase();
      byEmail.set(email, account);
      const domain = domainOf(email);
      const list = byDomain.get(domain) ?? [];
      if (!list.includes(account)) list.push(account);
      byDomain.set(domain, list);
      for (const p of contact.pseudos) byHandle.set(normalizeHandle(p.pseudo), account);
    }
  }
  return { byEmail, byHandle, byDomain };
}

/**
 * Rapprochement avec des identifiants déjà détenus, sans enrichissement.
 * Seule une correspondance exacte (e-mail ou pseudo connu) donne un compte au Reach.
 */
export function matchAuthor(feedback: Feedback, index: Index): AuthorMatch {
  const { author } = feedback;
  const base = { feedbackId: feedback.id, candidateAccountId: null };
  const withDisagreement = (accountId: string | null) =>
    feedback.sourceAccountId !== null && feedback.sourceAccountId !== accountId;

  if (author.email) {
    const account = index.byEmail.get(author.email.toLowerCase());
    if (account) {
      return {
        ...base,
        accountId: account.id,
        confidence: "certaine",
        method: "email",
        explanation: `E-mail présent sur le compte ${account.nom}.`,
        sourceDisagreement: withDisagreement(account.id),
      };
    }
  }

  if (author.handle) {
    const account = index.byHandle.get(normalizeHandle(author.handle));
    if (account) {
      return {
        ...base,
        accountId: account.id,
        confidence: "certaine",
        method: "pseudo",
        explanation: `Pseudo ${author.handle} déjà enregistré sur le compte ${account.nom}.`,
        sourceDisagreement: withDisagreement(account.id),
      };
    }
  }

  if (feedback.channel === "social" && feedback.sourceAccountId?.startsWith("x:@")) {
    return {
      ...base,
      accountId: feedback.sourceAccountId,
      confidence: "certaine",
      method: "pseudo",
      explanation: `Compte X distinct ${feedback.sourceAccountId.slice(2)}, compté dans le Reach.`,
      sourceDisagreement: false,
    };
  }

  if (author.email) {
    const candidates = index.byDomain.get(domainOf(author.email)) ?? [];
    if (candidates.length === 1 && candidates[0]) {
      return {
        ...base,
        accountId: null,
        candidateAccountId: candidates[0].id,
        confidence: "probable",
        method: "domaine",
        explanation: `Adresse inconnue, même domaine que ${candidates[0].nom}. À confirmer avant de compter le compte.`,
        sourceDisagreement: withDisagreement(null),
      };
    }
    return {
      ...base,
      accountId: null,
      confidence: "non_rapproche",
      method: "aucune",
      explanation: "Adresse absente des comptes. Aucun compte créé.",
      sourceDisagreement: withDisagreement(null),
    };
  }

  if (author.handle) {
    return {
      ...base,
      accountId: null,
      confidence: "faible",
      method: "aucune",
      explanation: `Pseudo ${author.handle} inconnu. Aucun rattachement deviné.`,
      sourceDisagreement: withDisagreement(null),
    };
  }

  return {
    ...base,
    accountId: null,
    confidence: "anonyme",
    method: "aucune",
    explanation: "Auteur anonyme.",
    sourceDisagreement: withDisagreement(null),
  };
}
