import Link from "next/link";
import type { ReactNode } from "react";
import { ROUTES } from "@/routes";

/**
 * Layout base, mobile-first:
 * - celular: ocupa a tela toda (100dvh), respeita a área segura do iPhone
 * - tablet/desktop (sm/md+): conteúdo centralizado com largura máxima
 */
export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col">
      <header className="shrink-0 border-b border-black/10 px-4 pt-[env(safe-area-inset-top)] sm:px-6 dark:border-white/10">
        <nav className="mx-auto flex h-14 max-w-3xl items-center justify-between md:h-16">
          <Link href={ROUTES.home} className="text-lg font-semibold md:text-xl">
            LIA
          </Link>
          <div className="flex gap-1 text-sm sm:gap-2 md:text-base">
            <Link href={ROUTES.chat} className="rounded-lg px-3 py-2 hover:bg-black/5 dark:hover:bg-white/10">
              Conversar
            </Link>
            <Link href={ROUTES.sobre} className="rounded-lg px-3 py-2 hover:bg-black/5 dark:hover:bg-white/10">
              Sobre
            </Link>
          </div>
        </nav>
      </header>

      <main className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col overflow-y-auto px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-6 md:py-8">
        {children}
      </main>
    </div>
  );
}
