import Link from "next/link";
import type { ReactNode } from "react";
import { ROUTES } from "@/routes";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-black/10 px-6 py-4 dark:border-white/10">
        <nav className="mx-auto flex max-w-3xl items-center justify-between">
          <Link href={ROUTES.home} className="text-lg font-semibold">
            LIA
          </Link>
          <div className="flex gap-4 text-sm">
            <Link href={ROUTES.chat}>Conversar</Link>
            <Link href={ROUTES.sobre}>Sobre</Link>
          </div>
        </nav>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-8">{children}</main>
    </div>
  );
}
