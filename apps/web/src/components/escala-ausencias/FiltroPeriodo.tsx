import { Input } from '@base-ui/react/input';
import { useId } from 'react';

import { controlClassName } from '../form/control-class';
import { Select } from '../select/Select';
import { ATALHOS_PERIODO, type AtalhoPeriodo, atalhoDoPeriodo, periodoDoAtalho } from './ausencias';

type Periodo = { de: string | undefined; ate: string | undefined };

/**
 * Período da lista de ausências: atalhos (hoje, próximos 7/30/90 dias) e as datas De/Até. Mostra
 * as ausências que tocam o intervalo. Sem nada escolhido vale o padrão da API (desde 30 dias atrás).
 */
export function FiltroPeriodo({
  de,
  ate,
  hoje,
  onMudar,
}: {
  de?: string;
  ate?: string;
  /** Hoje em Brasília, "AAAA-MM-DD". */
  hoje: string;
  onMudar: (periodo: Periodo) => void;
}) {
  const deId = useId();
  const ateId = useId();
  const atalho = atalhoDoPeriodo(de, ate, hoje);

  return (
    <>
      <Select
        aria-label="Período"
        value={atalho}
        onValueChange={(valor) =>
          onMudar(
            valor
              ? periodoDoAtalho(valor as AtalhoPeriodo, hoje)
              : { de: undefined, ate: undefined },
          )
        }
        opcoes={[
          { valor: '', rotulo: 'Desde 30 dias atrás' },
          ...ATALHOS_PERIODO.map((a) => ({ valor: a.valor, rotulo: a.rotulo })),
          { valor: 'personalizado', rotulo: 'Datas escolhidas', desabilitada: true },
        ]}
        className="flex-[1_1_180px] md:flex-[0_1_190px]"
      />
      <span className="flex flex-[1_1_300px] items-center gap-2 md:flex-none">
        <label htmlFor={deId} className="text-muted-foreground text-[13px]">
          De
        </label>
        <Input
          id={deId}
          type="date"
          value={de ?? ''}
          max={ate}
          onValueChange={(valor) => {
            const novo = valor || undefined;
            onMudar(novo && ate && novo > ate ? { de: novo, ate: undefined } : { de: novo, ate });
          }}
          className={controlClassName('app', 'min-w-0 flex-1 md:w-40')}
        />
        <label htmlFor={ateId} className="text-muted-foreground text-[13px]">
          Até
        </label>
        <Input
          id={ateId}
          type="date"
          value={ate ?? ''}
          min={de}
          onValueChange={(valor) => {
            const novo = valor || undefined;
            onMudar(novo && de && novo < de ? { de: undefined, ate: novo } : { de, ate: novo });
          }}
          className={controlClassName('app', 'min-w-0 flex-1 md:w-40')}
        />
      </span>
    </>
  );
}
