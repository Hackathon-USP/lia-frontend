import { useEffect, useState } from "react";
import { LiaLogo } from "@/components/brand/LiaLogo";
import { IconMenu, IconX } from "./icons";
import { TextSizeControl } from "./TextSizeControl";

const NAV = [
  { href: "#problema", label: "O problema" },
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#para-quem", label: "Para quem" },
  { href: "#comparativo", label: "VLibras × LIA" },
  { href: "#impacto", label: "Impacto" },
  { href: "#modelo", label: "Modelo" },
  { href: "#equipe", label: "Equipe" },
];

const SECTION_IDS = [...NAV.map((item) => item.href.slice(1)), "contato"];

/**
 * Descobre qual seção está sob o cabeçalho fixo enquanto a pessoa rola.
 * Retorna o id da seção ativa, ou null no topo da página (hero).
 */
function useActiveSection(): string | null {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    let frame = 0;

    function update() {
      frame = 0;
      // Linha de leitura: logo abaixo do cabeçalho (≈ 6rem, igual ao scroll-margin das seções).
      const line = parseFloat(getComputedStyle(document.documentElement).fontSize) * 6 + 1;
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;

      let current: string | null = null;
      for (const id of SECTION_IDS) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) current = id;
      }
      // A última seção pode não alcançar o topo; no fim da página ela é a ativa.
      if (atBottom) current = SECTION_IDS[SECTION_IDS.length - 1];
      setActive(current);
    }

    function onScroll() {
      if (!frame) frame = requestAnimationFrame(update);
    }

    frame = requestAnimationFrame(update);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return active;
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const active = useActiveSection();
  const isActive = (href: string) => active === href.slice(1);

  return (
    <header className="sticky top-0 z-40 border-b border-tinta/10 bg-creme/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex min-h-18 max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 sm:px-6 lg:px-8 xl:flex-nowrap">
        <LiaLogo />

        <nav aria-label="Seções da página" className="hidden min-w-0 xl:block">
          <ul className="flex flex-wrap items-center justify-center gap-1">
            {NAV.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  aria-current={isActive(item.href) ? "location" : undefined}
                  className="block rounded-full px-3 py-2 whitespace-nowrap text-tinta underline-offset-[6px] hover:bg-menta aria-[current=location]:bg-menta aria-[current=location]:font-bold aria-[current=location]:text-petroleo aria-[current=location]:underline aria-[current=location]:decoration-2"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <TextSizeControl />
          <a
            href="#contato"
            aria-current={active === "contato" ? "location" : undefined}
            className="hidden h-11 items-center rounded-full bg-petroleo px-5 font-bold text-white underline-offset-4 hover:bg-petroleo-escuro aria-[current=location]:underline aria-[current=location]:decoration-2 sm:inline-flex"
          >
            Contato
          </a>
          <button
            type="button"
            className="inline-flex size-11 items-center justify-center rounded-full text-tinta hover:bg-menta xl:hidden"
            aria-expanded={open}
            aria-controls="menu-movel"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <IconX /> : <IconMenu />}
            <span className="sr-only">{open ? "Fechar menu" : "Abrir menu"}</span>
          </button>
        </div>
      </div>

      <nav id="menu-movel" aria-label="Seções da página" hidden={!open} className="border-t border-tinta/10 xl:hidden">
        <ul className="mx-auto flex max-w-6xl flex-col px-4 py-3 sm:px-6">
          {[...NAV, { href: "#contato", label: "Contato" }].map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={isActive(item.href) ? "location" : undefined}
                className="block rounded-2xl border-l-4 border-transparent px-4 py-3 text-lg text-tinta hover:bg-menta aria-[current=location]:border-petroleo aria-[current=location]:bg-menta aria-[current=location]:font-bold aria-[current=location]:text-petroleo"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
