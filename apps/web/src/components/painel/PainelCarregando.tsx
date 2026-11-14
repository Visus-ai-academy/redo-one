import { Button } from '@base-ui/react/button';

import { Alerta } from '../alerta/Alerta';
import { buttonClassName } from '../button/button-class';
import { CamposCarregando } from '../skeleton/CamposCarregando';
import { Skeleton } from '../skeleton/Skeleton';
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
  return (
    <PainelLateral
      titulo={
        erro ? (
          'Não foi possível carregar'
        ) : (
          <>
            <span className="sr-only">Carregando…</span>
            <Skeleton className="h-5 w-44" />
          </>
        )
      }
      subtitulo={erro ? undefined : <Skeleton className="mt-1.5 h-3.5 w-28" />}
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
        <CamposCarregando anunciar={false} />
      )}
    </PainelLateral>
  );
}
