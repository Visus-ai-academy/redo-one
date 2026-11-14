import { Skeleton } from './Skeleton';

/** Forma de um formulário que ainda carrega: rótulo e campo, um abaixo do outro. */
export function CamposCarregando({
  quantidade = 5,
  anunciar = true,
}: {
  quantidade?: number;
  /** Avisa "Carregando…" ao leitor de tela; desligue dentro de algo que já avisa (`aria-busy`). */
  anunciar?: boolean;
}) {
  return (
    <div role={anunciar ? 'status' : undefined} className="flex flex-col gap-4 p-4">
      {anunciar && <span className="sr-only">Carregando…</span>}
      {Array.from({ length: quantidade }, (_, campo) => `campo-${campo}`).map((chave) => (
        <div key={chave} className="flex flex-col gap-2">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </div>
  );
}
