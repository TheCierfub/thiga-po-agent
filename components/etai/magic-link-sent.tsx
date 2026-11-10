import { Button } from "@/components/ui/button";

/** Confirmation après l'envoi du lien. L'adresse reste visible. */
export function MagicLinkSent({
  email,
  resendIn,
  canResend,
  pending = false,
  onChange,
  onResend,
}: {
  email: string;
  resendIn: number;
  canResend: boolean;
  pending?: boolean;
  onChange?: () => void;
  onResend?: () => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm">Lien envoyé à {email}</p>
      <p className="text-sm text-muted-foreground">Ouvrez-le dans ce navigateur pour continuer.</p>
      <button type="button" className="text-xs text-muted-foreground underline underline-offset-2" onClick={onChange}>
        Changer d&apos;adresse
      </button>
      <Button type="button" disabled={pending || !canResend} onClick={onResend}>
        {canResend ? "Renvoyer" : `Renvoyer (${resendIn} s)`}
      </Button>
    </div>
  );
}
