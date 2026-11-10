"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export function SignInLink({ href, children, className }: { href: string; children: string; className?: string }) {
  return (
    <Link href={href} className={buttonVariants({ className })}>
      {children}
    </Link>
  );
}
