export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 px-6 py-24">
      <p className="text-sm font-medium text-zinc-500">Étai · agent Product Owner</p>
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        L&apos;interface arrive en phase 2.
      </h1>
      <p className="text-lg leading-8 text-zinc-600 dark:text-zinc-400">
        Le cœur de l&apos;agent tourne déjà en ligne de commande :{" "}
        <code className="rounded bg-black/[.06] px-1.5 py-0.5 font-mono text-[0.9em] dark:bg-white/[.08]">
          pnpm agent run --batch lundi
        </code>
        .
      </p>
    </main>
  );
}
