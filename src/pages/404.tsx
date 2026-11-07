import Link from "next/link";
import { ROUTES } from "@/routes";

export default function NotFoundPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-bold">Página não encontrada</h1>
      <Link href={ROUTES.home} className="underline">
        Voltar para o início
      </Link>
    </div>
  );
}
