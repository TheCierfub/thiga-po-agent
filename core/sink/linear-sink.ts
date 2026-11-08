import type { BacklogItem, BacklogSink, SinkResult } from "./backlog-sink";

export class NotImplementedInPhase1Error extends Error {
  constructor() {
    super("LinearSink n'est pas branché en phase 1 : aucune écriture externe. Utiliser MarkdownSink.");
    this.name = "NotImplementedInPhase1Error";
  }
}

/**
 * Bouchon documenté pour la phase 2. Contrat prévu, identique à MarkdownSink :
 * - la clé stable (`etai:<thème>`) est écrite dans la description de l'issue et sert à la retrouver
 *   avant toute création : pas de doublon si le lot est rejoué ;
 * - si le thème est déjà rattaché à une issue existante (`existingIssueId`), on la met à jour, on n'en
 *   crée pas une autre ;
 * - un élément bloqué n'est jamais poussé ;
 * - l'écriture passe par l'API Linear côté serveur, après validation du PO dans l'interface.
 *   Le LLM n'a jamais accès à cet outil.
 */
export class LinearSink implements BacklogSink {
  readonly name = "linear";

  async push(_items: BacklogItem[]): Promise<SinkResult[]> {
    throw new NotImplementedInPhase1Error();
  }
}
