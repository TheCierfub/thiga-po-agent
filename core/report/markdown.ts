import type { RunResult } from "../pipeline/run";
import type { InvestigationDraft, MoscowClass, UserStoryDraft } from "../schemas";
import { CATEGORY_LABEL, accountNames, cell, num, pct, reachLabel, trendLabel } from "./format";

const MOSCOW_ORDER: MoscowClass[] = ["Must", "Should", "Could", "À confirmer", "Hors arbitrage", "Won't"];

const CONSTRAINT_LABEL = { contrat: "contrat", securite: "sécurité", coeur_casse: "cœur du produit cassé" } as const;

const REPLY_LABEL = {
  email: "e-mail",
  message_prive: "message privé",
  reponse_publique: "réponse publique",
} as const;

function sortedDecisions(result: RunResult) {
  const rice = new Map(result.state.rice.map((r) => [r.themeKey, r]));
  return [...result.state.allocation.decisions].sort(
    (a, b) =>
      MOSCOW_ORDER.indexOf(a.moscow) - MOSCOW_ORDER.indexOf(b.moscow) ||
      (rice.get(b.themeKey)?.score ?? 0) - (rice.get(a.themeKey)?.score ?? 0),
  );
}

export function renderPrioritization(result: RunResult): string {
  const { state, accounts } = result;
  const themes = new Map(state.themes.map((t) => [t.key, t]));
  const rice = new Map(state.rice.map((r) => [r.themeKey, r]));
  const categories = new Map(state.assessments.map((a) => [a.themeKey, a.category]));
  const { allocation } = state;
  const lines = [
    `# Priorisation RICE et MoSCoW · lot ${state.batch}`,
    "",
    `Capacité arbitrable : ${num(allocation.arbitrablePoints)} points. Must ${num(allocation.mustPoints)} (${pct(allocation.mustPoints / allocation.arbitrablePoints)}), Should ${num(allocation.shouldPoints)}, Could ${num(allocation.couldPoints)}.`,
    `Reach compté en mode « ${state.reachMode} », sur la fenêtre du ${state.rice[0]?.reach.window.start ?? "?"} au ${state.referenceDate}.`,
    "",
    "| Thème | Catégorie | MoSCoW | RICE | Reach | Impact | Confidence | Effort | Tendance | Backlog | Raison |",
    "| --- | --- | --- | ---: | --- | ---: | ---: | --- | --- | --- | --- |",
  ];
  for (const d of sortedDecisions(result)) {
    const t = themes.get(d.themeKey)!;
    const r = rice.get(d.themeKey)!;
    const backlog = t.backlogIssueId ? `${t.backlogIssueId} (${t.backlogRelation})` : "—";
    lines.push(
      `| ${cell(t.title)} | ${CATEGORY_LABEL[categories.get(d.themeKey)!]} | ${d.moscow} | ${num(r.score, 3)} | ${reachLabel(r.reach)} | ${num(r.impact.value)}${r.impact.source === "po" ? " (PO)" : ""} | ${pct(r.confidence.value)} | ${r.effort.size} · ${num(r.effort.points)} pt${r.effort.source === "po" ? " (PO)" : ""} | ${trendLabel(t.trend)} | ${backlog} | ${cell(d.reason)} |`,
    );
  }
  lines.push("", "## Alertes", "");
  if (allocation.alerts.length === 0) lines.push("Aucune.");
  for (const a of allocation.alerts) lines.push(`- **${a.code}** : ${a.message}`);

  lines.push("", "## Détail du Reach", "");
  for (const d of sortedDecisions(result)) {
    const r = rice.get(d.themeKey)!;
    lines.push(
      `- **${themes.get(d.themeKey)!.title}** : ${accountNames(r.reach.accounts, accounts)} · ${r.reach.messages} message(s) · canaux ${r.confidence.channels.join(", ")} · ${r.confidence.rule}`,
    );
    for (const x of r.reach.excluded) lines.push(`  - exclu : ${x.feedbackId}, ${x.reason}`);
  }
  lines.push(
    "",
    "RICE = Reach × Impact × Confidence ÷ points d'effort, calculé en code. L'impact et la taille viennent du LLM ou d'une surcharge du PO (marquée PO).",
    "",
  );
  return lines.join("\n");
}

export function renderBrief(result: RunResult): string {
  const { state, accounts } = result;
  const themes = new Map(state.themes.map((t) => [t.key, t]));
  const categories = new Map(state.assessments.map((a) => [a.themeKey, a.category]));
  const fresh = new Set(result.newFeedbackIds);
  const freshFeedbacks = state.feedbacks.filter((f) => fresh.has(f.id));
  const classes = state.classifications.filter((c) => fresh.has(c.feedbackId));
  const quarantined = classes.filter((c) => c.injection.quarantined);
  const piiByKind = new Map<string, number>();
  for (const p of freshFeedbacks.flatMap((f) => f.pii)) piiByKind.set(p.kind, (piiByKind.get(p.kind) ?? 0) + p.count);
  const piiCount = [...piiByKind.values()].reduce((a, b) => a + b, 0);
  const piiDetail = piiCount > 0 ? ` (${[...piiByKind].map(([k, v]) => `${k} ${v}`).join(", ")})` : "";
  const byType = new Map<string, number>();
  for (const c of classes) byType.set(c.type, (byType.get(c.type) ?? 0) + 1);
  const matches = state.matches.filter((m) => fresh.has(m.feedbackId));
  const certain = matches.filter((m) => m.confidence === "certaine").length;

  const lines = [
    `# Brief de la semaine · lot ${state.batch}`,
    "",
    `${freshFeedbacks.length} nouveaux feedbacks, arrêtés au ${state.referenceDate}. Types : ${[...byType].map(([k, v]) => `${k} ${v}`).join(", ")}.`,
    `Auteurs rattachés avec certitude : ${certain} sur ${matches.length}. Données personnelles masquées avant envoi au LLM : ${piiCount}${piiDetail}.`,
    "",
    "## À décider",
    "",
  ];
  for (const d of sortedDecisions(result).filter((d) => d.moscow !== "Won't")) {
    const t = themes.get(d.themeKey)!;
    let suffix = "";
    if (d.constraint) {
      const status = d.constraint.confirmationStale
        ? "confirmation à revoir"
        : d.constraint.confirmed
          ? "confirmée par le PO"
          : "non confirmée";
      suffix = ` Contrainte ${CONSTRAINT_LABEL[d.constraint.kind]} (${d.constraint.source === "regle" ? "règle" : "proposée par le LLM"}), ${status}.`;
    }
    lines.push(`- **${d.moscow} · ${t.title}** (${CATEGORY_LABEL[categories.get(d.themeKey)!]}) : ${d.reason}${suffix}`);
  }
  for (const a of state.allocation.alerts) lines.push(`- Alerte : ${a.message}`);

  lines.push("", "## Ce qui monte", "");
  const rising = state.themes.filter((t) => t.trend.kind === "tendance");
  if (rising.length === 0) lines.push("Aucune tendance cette semaine.");
  for (const t of rising) lines.push(`- ${t.title} : ${t.trend.weeklyCounts.join("/")} messages par semaine. ${t.trend.rule}`);

  lines.push("", "## Mis de côté", "");
  for (const d of sortedDecisions(result).filter((d) => d.moscow === "Won't")) {
    lines.push(`- ${themes.get(d.themeKey)!.title} : ${d.reason}`);
  }

  lines.push("", "## Quarantaine", "");
  if (quarantined.length === 0) lines.push("Aucun feedback en quarantaine.");
  for (const c of quarantined) {
    const why = [...c.injection.heuristicSignals, ...(c.injection.llmSuspected ? ["signalé par le LLM"] : [])].join(", ");
    lines.push(
      `- ${c.feedbackId} : consigne détectée dans le message (${why}). Exclu du scoring, aucune consigne suivie. À relire, puis libérer dans le fichier de décisions si c'est un faux positif.`,
    );
  }

  const risky = state.feedbacks
    .filter((f) => fresh.has(f.id))
    .filter((f) => state.classifications.find((c) => c.feedbackId === f.id)?.type === "signal_churn");
  lines.push("", "## Signaux de churn", "");
  if (risky.length === 0) lines.push("Aucun.");
  for (const f of risky) {
    const m = state.matches.find((x) => x.feedbackId === f.id);
    const theme = state.themes.find((t) => t.relatedSignalIds.includes(f.id));
    lines.push(
      `- ${f.id} · ${m?.accountId ? accountNames([m.accountId], accounts) : "compte non rapproché"}${theme ? ` · lié à « ${theme.title} »` : ""}`,
    );
  }

  const unclear = state.investigations.filter((i) => fresh.has(i.feedbackId));
  lines.push("", "## Trop flou pour décider", "");
  if (unclear.length === 0) lines.push("Rien cette semaine.");
  for (const i of unclear) lines.push(`- ${i.feedbackId} : brouillon d'investigation prêt (${REPLY_LABEL[i.replyMode]}, non envoyé).`);

  const weak = matches.filter((m) => m.confidence !== "certaine" && m.confidence !== "anonyme");
  if (weak.length > 0) {
    lines.push("", "## Rapprochements à vérifier", "");
    for (const m of weak) lines.push(`- ${m.feedbackId} (${m.confidence}) : ${m.explanation}`);
  }

  if (state.warnings.length > 0) {
    lines.push("", "## Avertissements", "");
    for (const w of state.warnings) lines.push(`- ${w}`);
  }
  if (result.story) lines.push("", `Story rédigée : « ${result.story.title} » (story-${result.story.themeKey}.md).`);
  lines.push("");
  return lines.join("\n");
}

export function renderChanges(result: RunResult): string {
  const { changes, accounts } = result;
  if (!changes) return "";
  const lines = [`# Ce qui a changé depuis le lot ${changes.previousBatch}`, ""];
  const moved = changes.themes.filter((t) => t.moscowBefore !== t.moscowAfter);
  lines.push(
    `${moved.length} thème(s) changent de classe. ${changes.plan.reassess.length} thème(s) réévalués par le LLM, ${changes.plan.unchanged.length} repris tels quels. Scores recalculés pour tous.`,
    "",
  );
  for (const t of changes.themes) {
    const movedLabel =
      t.moscowBefore === t.moscowAfter ? `${t.moscowAfter} (inchangé)` : `${t.moscowBefore ?? "nouveau"} → ${t.moscowAfter}`;
    lines.push(`## ${t.title} · ${movedLabel}`, "");
    const facts: string[] = [];
    if (t.newFeedbackIds.length > 0) facts.push(`Nouveaux feedbacks : ${t.newFeedbackIds.join(", ")}.`);
    if (t.accountsAdded.length > 0) facts.push(`Comptes ajoutés : ${accountNames(t.accountsAdded, accounts)}.`);
    for (const r of t.accountsRemoved) facts.push(`Compte retiré : ${accountNames([r.accountId], accounts)}, ${r.reason}.`);
    if (t.riceBefore !== null && t.riceBefore !== t.riceAfter) facts.push(`RICE ${num(t.riceBefore, 3)} → ${num(t.riceAfter, 3)}.`);
    if (t.confidenceBefore !== null && t.confidenceBefore !== t.confidenceAfter) {
      facts.push(`Confidence ${pct(t.confidenceBefore)} → ${pct(t.confidenceAfter)}.`);
    }
    if (t.status === "inchange") facts.push("Preuves et hypothèses inchangées : évaluation reprise du lot précédent.");
    facts.push(`Raison : ${t.reasonAfter}`);
    for (const f of facts) lines.push(`- ${f}`);
    lines.push("");
  }
  if (changes.plan.staleStories.length > 0) {
    lines.push(`Stories devenues obsolètes : ${changes.plan.staleStories.join(", ")}.`);
  }
  if (changes.plan.staleConfirmations.length > 0) {
    lines.push(
      `Confirmations du PO à revoir (preuves modifiées depuis la confirmation) : ${changes.plan.staleConfirmations.join(", ")}.`,
    );
  }
  if (changes.newQuarantines.length > 0) lines.push(`Nouvelles quarantaines : ${changes.newQuarantines.join(", ")}.`);
  lines.push("");
  return lines.join("\n");
}

export function renderStory(story: UserStoryDraft): string {
  const lines = [
    `# ${story.title}`,
    "",
    `Brouillon généré pour le lot ${story.batch}, statut : ${story.status}.${story.backlogIssueId ? ` Issue liée : ${story.backlogIssueId}.` : ""}`,
    "",
    `**En tant que** ${story.asA}, **je veux** ${story.iWant}, **afin que** ${story.soThat}.`,
    "",
    "## Critères d'acceptation",
    "",
  ];
  story.acceptanceCriteria.forEach((c, i) => {
    lines.push(`${i + 1}. **Étant donné** ${c.given}, **quand** ${c.when}, **alors** ${c.then}.`);
  });
  lines.push("", `## Taille : ${story.size}`, "", `Référence ${story.referenceStoryId}. ${story.sizeRationale}`, "", "## INVEST", "");
  const labels = {
    independent: "Indépendante",
    negotiable: "Négociable",
    valuable: "Porteuse de valeur",
    estimable: "Estimable",
    small: "Petite",
    testable: "Testable",
  } as const;
  for (const [key, label] of Object.entries(labels) as [keyof typeof labels, string][]) {
    const v = story.invest[key];
    lines.push(`- ${v.ok ? "Oui" : "Non"} · ${label} : ${v.note}`);
  }
  lines.push("", "## Questions ouvertes", "");
  for (const q of story.openQuestions) lines.push(`- ${q}`);
  if (story.outOfScope.length > 0) {
    lines.push("", "## Hors périmètre", "");
    for (const o of story.outOfScope) lines.push(`- ${o}`);
  }
  lines.push("", "## Preuves", "");
  for (const q of story.evidence) lines.push(`- ${q.feedbackId} : « ${q.text} »`);
  lines.push("");
  return lines.join("\n");
}

export function renderInvestigation(draft: InvestigationDraft): string {
  const lines = [
    `# Investigation · ${draft.feedbackId}`,
    "",
    `Canal : ${draft.channel}. Réponse par ${REPLY_LABEL[draft.replyMode]} à ${draft.recipient}. **Brouillon non envoyé** : rien ne part sans le PO.`,
    "",
    "## Questions à poser",
    "",
    ...draft.questions.map((q) => `- ${q}`),
    "",
    "## Brouillon",
    "",
  ];
  if (draft.message.subject) lines.push(`Objet : ${draft.message.subject}`, "");
  lines.push(...draft.message.body.split("\n").map((l) => (l ? `> ${l}` : ">")), "");
  return lines.join("\n");
}
