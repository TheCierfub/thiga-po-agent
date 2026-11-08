import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-3 px-6 py-24 text-center">
      <h1 className="text-lg font-semibold">Page introuvable</h1>
      <p className="text-sm text-muted-foreground">La démo couvre deux lots de feedbacks : lundi et jeudi.</p>
      <Link href="/lundi" className="text-sm underline underline-offset-4">
        Ouvrir le brief du lundi
      </Link>
    </main>
  );
}
