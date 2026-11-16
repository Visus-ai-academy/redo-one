import { Button } from '@base-ui/react/button';
import { Plus } from '@phosphor-icons/react';

import type { OcorrenciaDto } from '../../gen/types/OcorrenciaDto';
import { cn } from '../../lib/cn';
import { buttonClassName } from '../button/button-class';
import { Dica } from '../dica/Dica';
import { type Agrupamento, chavePlantao, type SecaoGrade } from './agrupar';
import { CartaoPlantao } from './CartaoPlantao';
import { diaDaSemana, NOMES_DIAS_LONGOS, rotuloDia } from './calendario';

/** Onde o "+" abre o alocar já preenchido. */
export type LugarDoAlocar = { data: string; frenteId?: string; turnoId?: string };

export type SemanaProps = {
  secoes: SecaoGrade[];
  /** Os 7 dias, de segunda a domingo. */
  dias: string[];
  hoje: string;
  /**
   * Por turno, o horário vai uma vez no título do turno; por frente, em cada linha de turno.
   * Sem ele, por frente.
   */
  agrupar?: Agrupamento;
  /** `chavePlantao` dos plantões em conflito. */
  conflitos: Set<string>;
  /** Horário padrão de cada turno ("07:00–13:00"), por id. */
  horarios: Record<string, string>;
  onAbrir: (ocorrencia: OcorrenciaDto) => void;
  /** Sem ele (sem permissão de editar), não há "+". */
  onAlocar?: (lugar: LugarDoAlocar) => void;
};

const textoDia = (data: string) => {
  const { semana, dia } = rotuloDia(data);
  return `${semana} ${dia}`;
};

function Bolinha({ cor }: { cor: string | null }) {
  return (
    <span
      aria-hidden
      className="border-border size-2.5 flex-none rounded-full border"
      style={cor ? { backgroundColor: cor, borderColor: cor } : undefined}
    />
  );
}

/** Semana no computador: uma tabela por seção (frente ou turno), com os dias nas colunas. */
export function SemanaGrade({
  secoes,
  dias,
  hoje,
  agrupar = 'frente',
  conflitos,
  horarios,
  onAbrir,
  onAlocar,
}: SemanaProps) {
  const porTurno = agrupar === 'turno';
  return (
    <div className="flex flex-col gap-4">
      {secoes.map((secao) => (
        <section key={secao.id} className="bg-card overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[960px] table-fixed border-collapse">
            <caption className="border-b px-4 py-3 text-left">
              <span className="flex items-center gap-2 text-base font-semibold">
                <Bolinha cor={secao.cor} />
                {secao.rotulo}
                {porTurno && horarios[secao.id] && (
                  <>
                    {' '}
                    <span className="text-muted-foreground font-normal tabular-nums">
                      {`· ${horarios[secao.id]}`}
                    </span>
                  </>
                )}
              </span>
            </caption>
            <thead>
              <tr className="border-b">
                <th scope="col" className="w-36 px-3 py-2">
                  <span className="sr-only">Linha</span>
                </th>
                {dias.map((dia) => (
                  <th
                    key={dia}
                    scope="col"
                    aria-current={dia === hoje ? 'date' : undefined}
                    className={cn(
                      'text-subtle-foreground px-2 py-2 text-left text-xs font-medium tabular-nums',
                      dia === hoje && 'text-primary font-semibold',
                    )}
                  >
                    {textoDia(dia)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {secao.linhas.map((linha) => (
                <tr key={`${linha.turnoId}|${linha.frenteId}`} className="border-b last:border-b-0">
                  <th scope="row" className="px-3 py-2 text-left align-top font-normal">
                    <span className="flex items-center gap-2 font-medium">
                      <Bolinha cor={linha.cor} />
                      <span className="truncate">{linha.rotulo}</span>
                    </span>
                    {!porTurno && horarios[linha.turnoId] && (
                      <span className="text-muted-foreground block pl-4.5 text-[13px] tabular-nums">
                        {horarios[linha.turnoId]}
                      </span>
                    )}
                  </th>
                  {dias.map((dia) => (
                    <td
                      key={dia}
                      className={cn(
                        'border-l px-1.5 py-1.5 align-top',
                        dia === hoje && 'bg-accent/40',
                      )}
                    >
                      <div className="flex flex-col gap-1">
                        {(linha.porDia[dia] ?? []).map((o) => (
                          <CartaoPlantao
                            key={o.alocacaoId}
                            ocorrencia={o}
                            horarioDoTurno={horarios[o.turnoId]}
                            emConflito={conflitos.has(chavePlantao(o.alocacaoId, o.data))}
                            onAbrir={onAbrir}
                          />
                        ))}
                        {onAlocar && (
                          <BotaoMais
                            rotulo={`Alocar em ${secao.rotulo}, ${linha.rotulo}, ${textoDia(dia)}`}
                            onClick={() =>
                              onAlocar({
                                data: dia,
                                frenteId: linha.frenteId,
                                turnoId: linha.turnoId,
                              })
                            }
                          />
                        )}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

function BotaoMais({ rotulo, onClick }: { rotulo: string; onClick: () => void }) {
  return (
    <Dica rotulo={rotulo} lado="top">
      <Button
        type="button"
        aria-label={rotulo}
        onClick={onClick}
        className={buttonClassName({
          variant: 'ghost',
          className: 'text-subtle-foreground hover:text-foreground h-7 w-full px-0',
        })}
      >
        <Plus size={16} aria-hidden />
      </Button>
    </Dica>
  );
}

/** Semana no celular: um bloco por dia, com os plantões agrupados como na grade. */
export function SemanaLista({
  secoes,
  dias,
  hoje,
  conflitos,
  horarios,
  onAbrir,
  onAlocar,
}: SemanaProps) {
  return (
    <div className="flex flex-col gap-4">
      {dias.map((dia) => {
        const titulo = `${NOMES_DIAS_LONGOS[diaDaSemana(dia)]}, ${rotuloDia(dia).dia}`;
        const grupos = secoes.flatMap((secao) =>
          secao.linhas
            .filter((linha) => (linha.porDia[dia] ?? []).length > 0)
            .map((linha) => ({
              chave: `${secao.id}|${linha.turnoId}|${linha.frenteId}`,
              rotulo: `${secao.rotulo}, ${linha.rotulo}`,
              plantoes: linha.porDia[dia] ?? [],
            })),
        );
        return (
          <section
            key={dia}
            aria-label={titulo}
            className="bg-card flex flex-col gap-3 rounded-lg border p-4"
          >
            <h2
              aria-current={dia === hoje ? 'date' : undefined}
              className={cn('text-base font-semibold', dia === hoje && 'text-primary')}
            >
              {titulo}
              {dia === hoje && <span className="text-muted-foreground font-normal"> (hoje)</span>}
            </h2>
            {grupos.length === 0 && <p className="text-muted-foreground">Ninguém escalado.</p>}
            {grupos.map((grupo) => (
              <div key={grupo.chave} className="flex flex-col gap-1">
                <h3 className="text-muted-foreground text-[13px] font-medium">{grupo.rotulo}</h3>
                {grupo.plantoes.map((o) => (
                  <CartaoPlantao
                    key={o.alocacaoId}
                    ocorrencia={o}
                    horarioDoTurno={horarios[o.turnoId]}
                    emConflito={conflitos.has(chavePlantao(o.alocacaoId, o.data))}
                    onAbrir={onAbrir}
                  />
                ))}
              </div>
            ))}
            {onAlocar && (
              <Button
                type="button"
                onClick={() => onAlocar({ data: dia })}
                aria-label={`Alocar médico em ${rotuloDia(dia).dia}`}
                className={buttonClassName({ variant: 'secondary', className: 'self-start' })}
              >
                <Plus size={16} aria-hidden />
                Alocar médico
              </Button>
            )}
          </section>
        );
      })}
    </div>
  );
}
