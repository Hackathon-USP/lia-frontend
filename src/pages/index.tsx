import Link from "next/link";
import { ROUTES } from "@/routes";

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <h1 className="text-4xl font-bold">Olá, eu sou a LIA</h1>
      <p className="max-w-md opacity-80">
        Converse comigo e acompanhe as respostas em Libras com a Hosana, do VLibras.
      </p>
      <Link href={ROUTES.chat} className="rounded-xl bg-blue-600 px-6 py-3 font-medium text-white">
        Começar conversa
      </Link>
    </div>
  );
}
