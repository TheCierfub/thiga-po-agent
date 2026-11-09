export function SocialMark({ url }: { url?: string | null }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="inline-flex size-4 items-center justify-center rounded-sm bg-foreground text-[9px] font-semibold leading-none text-background"
        title="X"
      >
        X
      </span>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="hover:text-foreground hover:underline">
          Voir le post
        </a>
      ) : null}
    </span>
  );
}
