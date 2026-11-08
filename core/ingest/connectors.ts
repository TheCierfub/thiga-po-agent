import { CHANNELS, FeedbackSchema, type BatchFile, type Channel, type Feedback, type RawFeedback } from "../schemas";

/**
 * Un connecteur par canal, tous vers le même format normalisé.
 * En production : webhook ou API du canal. Ici : lecture du fichier de lot.
 */
export interface ChannelConnector {
  readonly channel: Channel;
  pull(): Feedback[];
}

export function normalize(raw: RawFeedback, batch: string): Feedback {
  return FeedbackSchema.parse({
    id: raw.id,
    batch,
    channel: raw.canal,
    receivedAt: raw.date,
    author: {
      name: raw.auteur.nom?.trim() || null,
      email: raw.auteur.email?.trim().toLowerCase() || null,
      handle: raw.auteur.pseudo?.trim() || null,
      anonymous: raw.auteur.anonyme,
    },
    sourceAccountId: raw.account_id,
    language: raw.langue,
    text: raw.texte.replace(/\r\n/g, "\n"),
  });
}

export function createFileConnector(file: BatchFile, channel: Channel): ChannelConnector {
  return {
    channel,
    pull: () => file.feedbacks.filter((f) => f.canal === channel).map((f) => normalize(f, file.lot)),
  };
}

export function ingestBatch(file: BatchFile): Feedback[] {
  const all = CHANNELS.flatMap((channel) => createFileConnector(file, channel).pull());
  const ids = new Set<string>();
  for (const f of all) {
    if (ids.has(f.id)) throw new Error(`Identifiant de feedback en double : ${f.id}`);
    ids.add(f.id);
  }
  return all.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.id.localeCompare(b.id));
}
