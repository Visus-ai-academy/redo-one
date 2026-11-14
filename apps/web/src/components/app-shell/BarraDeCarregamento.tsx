import { Progress } from '@base-ui/react/progress';

/**
 * Faixa fina no topo enquanto a tela troca ou recarrega (menu, filtro, página da lista): os dados
 * antigos ficam à vista e a pessoa sabe que o clique pegou. Só aparece depois de 150ms, para a troca
 * rápida não piscar.
 */
export function BarraDeCarregamento({ ativa }: { ativa: boolean }) {
  if (!ativa) return null;
  return (
    <Progress.Root
      value={null}
      aria-label="Carregando a tela"
      className="animate-aparecer-atrasado pointer-events-none fixed inset-x-0 top-0 z-50"
    >
      <Progress.Track className="h-0.5 overflow-hidden">
        <Progress.Indicator className="bg-primary animate-barra-carregando h-full w-1/3 motion-reduce:w-full motion-reduce:animate-none" />
      </Progress.Track>
    </Progress.Root>
  );
}
