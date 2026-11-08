import Image from "next/image";
import Link from "next/link";
import { Fredoka } from "next/font/google";
import { ROUTES } from "@/routes";

/** Fonte da marca: arredondada como as mãos do ícone. */
const fredoka = Fredoka({ weight: ["600"], subsets: ["latin", "latin-ext"], display: "swap" });

/**
 * "lia" em minúsculas, com o pingo do i em destaque (âmbar).
 * O i é desenhado sem pingo (ı) e o pingo é um círculo nosso, para ter cor e tamanho próprios.
 */
export function LiaWordmark({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`${fredoka.className} inline-flex items-baseline leading-none tracking-tight ${className}`}>
      l
      <span className="relative inline-block">
        ı
        <span className="absolute top-[0.02em] left-1/2 size-[0.22em] -translate-x-1/2 rounded-full bg-ambar" />
      </span>
      a
    </span>
  );
}

/** Ícone + nome, com link para a página inicial. Usado em todos os cabeçalhos. */
export function LiaLogo({ tom = "escuro" }: { tom?: "escuro" | "claro" }) {
  return (
    <Link
      href={ROUTES.home}
      className="inline-flex items-center gap-2.5 rounded-xl focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-ambar"
    >
      <Image src="/assets/icon_1.jpeg" alt="" width={40} height={40} priority className="size-10 rounded-xl shadow-sm" />
      <LiaWordmark className={`text-[2rem] ${tom === "claro" ? "text-white" : "text-petroleo"}`} />
      <span className="sr-only">LIA, página inicial</span>
    </Link>
  );
}
