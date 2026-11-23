import { Button } from '@base-ui/react/button';

import { cn } from '../../lib/cn';
import { Alerta } from '../alerta/Alerta';
import { buttonClassName } from '../button/button-class';
import { CamposCarregando } from '../skeleton/CamposCarregando';
import { Skeleton } from '../skeleton/Skeleton';
import { useFaseDoCarregamento } from '../skeleton/use-fase-do-carregamento';
import { PainelLateral } from './PainelLateral';

type PainelCarregandoProps = {
  onFechar: () => void;
  /** A busca do item falhou. */
  erro?: boolean;
  onTentarDeNovo?: () => void;
};

/**
 * O painel lateral enquanto o item que ele mostra ainda carrega: abre na hora do clique, com a forma
 * do cabeçalho e dos campos, e dá lugar ao painel de verdade quando os dados chegam (sem deslizar de
 * novo). Se a busca falhar, diz isso ali mesmo.
 */
export function PainelCarregando({
  onFechar,
  erro = false,
  onTentarDeNovo,
}: PainelCarregandoProps) {
  // O painel abre na hora; as formas só aparecem depois de ~200ms (o lugar já fica reservado).
  // Para o mínimo de ~400ms à vista, a tela troca para o painel de verdade pelo
  // `useFaseDoCarregamento(!dados)`, não só por `dados`.
  const escondido = useFaseDoCarregamento(true) === 'reservado';
  return (
    <PainelLateral
      titulo={
        erro ? (
          'Não foi possível carregar'
        ) : (
          <>
            <span className="sr-only">Carregando…</span>
            <Skeleton className={cn('h-5 w-44', escondido && 'invisible')} />
          </>
        )
      }
      subtitulo={
        erro ? undefined : (
          <Skeleton className={cn('mt-1.5 h-3.5 w-28', escondido && 'invisible')} />
        )
      }
      ocupado={!erro}
      onFechar={onFechar}
    >
      {erro ? (
        <div className="flex flex-col items-start gap-3 p-4">
          <Alerta tom="erro">
            Não foi possível carregar os dados. Confira a conexão e tente de novo.
          </Alerta>
          {onTentarDeNovo && (
            <Button
              type="button"
              onClick={onTentarDeNovo}
              className={buttonClassName({ variant: 'secondary' })}
            >
              Tentar de novo
            </Button>
          )}
        </div>
      ) : (
        <div data-testid="formas-carregando" className={cn(escondido && 'invisible')}>
          <CamposCarregando anunciar={false} />
        </div>
      )}
    </PainelLateral>
  );
}
