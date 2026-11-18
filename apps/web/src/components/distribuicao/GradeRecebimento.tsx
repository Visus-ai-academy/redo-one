import { NumberField as BaseNumberField } from '@base-ui/react/number-field';

import type { PrioridadeOperacaoDto } from '../../gen/types/PrioridadeOperacaoDto';
import type { RotuloDto } from '../../gen/types/RotuloDto';
import { cn } from '../../lib/cn';
import { controlClassName } from '../form/control-class';
import { Select } from '../select/Select';
import {
  chaveCelula,
  type Grade,
  OPCOES_RECEBIMENTO,
  regraEfetiva,
  rotuloCurto,
  type ValorCelula,
} from './recebimento';

type Props = {
  prioridades: readonly PrioridadeOperacaoDto[];
  turnos: readonly RotuloDto[];
  valor: Grade;
  onChange?: (grade: Grade) => void;
  /** Na frente: a grade geral, para mostrar a célula herdada e poder voltar a ela. */
  geral?: Grade;
  somenteLeitura?: boolean;
  erros?: Record<string, string>;
};

/** Horas no lugar (célula de prazo mínimo): número inteiro, teclado numérico no celular. */
export function CampoHoras({
  valor,
  onChange,
  rotulo,
  invalido,
}: {
  valor: string;
  onChange: (horas: string) => void;
  rotulo: string;
  invalido?: boolean;
}) {
  return (
    <BaseNumberField.Root
      value={valor.trim() === '' ? null : Number(valor)}
      onValueChange={(n) => onChange(n === null ? '' : String(n))}
      min={1}
      max={720}
      step={1}
      format={{ useGrouping: false, maximumFractionDigits: 0 }}
      locale="pt-BR"
      className="flex items-center gap-1.5"
    >
      <BaseNumberField.Input
        aria-label={rotulo}
        aria-invalid={invalido || undefined}
        placeholder="24"
        className={controlClassName(
          'app',
          cn('w-[64px] px-2 tabular-nums', invalido && 'border-destructive'),
        )}
      />
      <span className="text-muted-foreground">h</span>
    </BaseNumberField.Root>
  );
}

/**
 * A grade de recebimento: prioridade da operação (linha) × turno da escala (coluna). Cada célula
 * diz se o turno segue o SLA, só recebe com prazo mínimo ou não recebe. Na frente, a célula sem
 * sobrescrita mostra a da geral, esmaecida. Rola na horizontal dentro da caixa (a página não).
 */
export function GradeRecebimento({
  prioridades,
  turnos,
  valor,
  onChange,
  geral,
  somenteLeitura,
  erros = {},
}: Props) {
  const mudar = (chave: string, v: ValorCelula) => onChange?.({ ...valor, [chave]: v });

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b">
            <th
              scope="col"
              className="bg-card text-subtle-foreground sticky left-0 z-10 min-w-[132px] p-3 text-[13px] font-medium"
            >
              Prioridade
            </th>
            {turnos.map((t) => (
              <th
                key={t.id}
                scope="col"
                className="text-subtle-foreground min-w-[156px] p-3 text-[13px] font-medium"
              >
                {t.nome}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {prioridades.map((p) => (
            <tr key={p.id}>
              <th scope="row" className="bg-card sticky left-0 z-10 p-3 align-top font-medium">
                <span className="block">{p.nome}</span>
                <span className="text-subtle-foreground block text-[12px] font-normal tabular-nums">
                  Posição {p.posicao}
                </span>
              </th>
              {turnos.map((t) => {
                const chave = chaveCelula(p.id, t.id);
                const atual = valor[chave] ?? { tipo: geral ? 'geral' : 'segue_sla', horas: '' };
                const herdada = geral ? regraEfetiva(geral, p.id, t.id) : null;
                const efetiva = regraEfetiva(valor, p.id, t.id, geral);
                const rotulo = `${p.nome} no turno ${t.nome}`;
                if (somenteLeitura) {
                  return (
                    <td
                      key={t.id}
                      className={cn(
                        'p-3 align-top tabular-nums',
                        atual.tipo === 'geral' && 'text-subtle-foreground',
                      )}
                    >
                      {rotuloCurto(efetiva)}
                      {atual.tipo === 'geral' && <span className="sr-only"> (como na geral)</span>}
                    </td>
                  );
                }
                const opcoes = [
                  ...(herdada
                    ? [{ valor: 'geral', rotulo: `Geral (${rotuloCurto(herdada)})` }]
                    : []),
                  ...OPCOES_RECEBIMENTO,
                ];
                return (
                  <td key={t.id} className="p-2 align-top">
                    <div className="flex flex-col gap-1.5">
                      <Select
                        value={atual.tipo}
                        onValueChange={(tipo) =>
                          mudar(chave, {
                            tipo: tipo as ValorCelula['tipo'],
                            horas: tipo === 'prazo_minimo' ? atual.horas || '24' : '',
                          })
                        }
                        opcoes={opcoes}
                        aria-label={rotulo}
                        className={cn(
                          'w-[140px]',
                          atual.tipo === 'geral' && 'text-subtle-foreground',
                        )}
                      />
                      {atual.tipo === 'prazo_minimo' && (
                        <CampoHoras
                          valor={atual.horas}
                          onChange={(horas) => mudar(chave, { ...atual, horas })}
                          rotulo={`Horas mínimas até o prazo: ${rotulo}`}
                          invalido={Boolean(erros[chave])}
                        />
                      )}
                      {erros[chave] && (
                        <span className="text-destructive text-[12px]">{erros[chave]}</span>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
