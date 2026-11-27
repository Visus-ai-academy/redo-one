import { Button } from '@base-ui/react/button';
import type { ComponentProps } from 'react';

import { cn } from '../../lib/cn';
import { Alerta } from '../alerta/Alerta';
import { buttonClassName } from '../button/button-class';
import { EstadoDoErro } from '../estado/EstadoDoErro';
import { CamposCarregando } from '../skeleton/CamposCarregando';
import { Skeleton } from '../skeleton/Skeleton';
import { useFaseDoCarregamento } from '../skeleton/use-fase-do-carregamento';
import { PainelLateral } from './PainelLateral';

type PainelCarregandoProps = {
  onFechar: () => void;
  /**
   * A busca do item falhou: o erro da API (o `error` do `useQuery`), que escolhe o estado pelo
   * código HTTP (`EstadoDoErro`), ou só `true` para a mensagem genérica.
   */
  erro?: unknown;
  /** O que não carregou, com artigo ("o médico"), para o texto do erro. */
  oQue?: string;
  /** Caminho de volta para a lista no 404. */
  voltar?: ComponentProps<typeof EstadoDoErro>['voltar'];
  onTentarDeNovo?: () => void;
  /** A largura do painel que vai aparecer, para nada pular quando os dados chegam. */
  largura?: ComponentProps<typeof PainelLateral>['largura'];
};

/**
 * O painel lateral enquanto o item que ele mostra ainda carrega: abre na hora do clique, com a forma
 * do cabeçalho e dos campos, e dá lugar ao painel de verdade quando os dados chegam (sem deslizar de
 * novo). Se a busca falhar, diz isso ali mesmo.
 */
export function PainelCarregando({
  onFechar,
  erro,
  oQue = 'os dados',
  voltar,
  onTentarDeNovo,
  largura,
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
      largura={largura}
      onFechar={onFechar}
    >
      {erro && erro !== true ? (
        <EstadoDoErro erro={erro} oQue={oQue} onTentarDeNovo={onTentarDeNovo} voltar={voltar} />
      ) : erro ? (
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
