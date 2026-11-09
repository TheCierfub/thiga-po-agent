import { z } from "zod";

export const CHANNELS = [
  "email",
  "ticket_support",
  "avis_g2",
  "avis_capterra",
  "forum_produit",
  "reddit",
  "x",
  "social",
] as const;
export const ChannelSchema = z.enum(CHANNELS);
export type Channel = z.infer<typeof ChannelSchema>;

export const RawAuthorSchema = z.object({
  nom: z.string().nullable(),
  email: z.string().nullable(),
  pseudo: z.string().nullable(),
  anonyme: z.boolean(),
});

export const RawFeedbackSchema = z.object({
  id: z.string().min(1),
  canal: ChannelSchema,
  date: z.iso.datetime({ offset: true }),
  auteur: RawAuthorSchema,
  account_id: z.string().nullable(),
  langue: z.enum(["fr", "en"]),
  texte: z.string().min(1),
});
export type RawFeedback = z.infer<typeof RawFeedbackSchema>;

export const BatchFileSchema = z.object({
  lot: z.string().min(1),
  usage: z.enum(["demonstration", "evaluation_seulement"]),
  fenetre: z.object({ debut: z.iso.date(), fin: z.iso.date() }),
  commentaire: z.string().optional(),
  feedbacks: z.array(RawFeedbackSchema).min(1),
});
export type BatchFile = z.infer<typeof BatchFileSchema>;
