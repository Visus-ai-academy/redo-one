import { Button } from '@base-ui/react/button';
import { PreviewCard } from '@base-ui/react/preview-card';
import { Plus } from '@phosphor-icons/react';
import { useId, useState } from 'react';

import type { OcorrenciaDto } from '../../gen/types/OcorrenciaDto';
import { cn } from '../../lib/cn';
import { buttonClassName } from '../button/button-class';
import { Dica } from '../dica/Dica';
import {
  type Agrupamento,
  type CalendarioDaSemana,
  chavePlantao,
  emBlocos,
  type ItemDaLegenda,
  type LinhaDoDia,
} from './agrupar';
import { diaDaSemana, NOMES_DIAS_LONGOS, rotuloDia } from './calendario';
import type { ItemDescricao } from './descricao-plantao';
import { type CartaoDoPlantao, CartaoFlutuante, LinhaMedico } from './LinhaMedico';

/** Onde o "+" abre o alocar já preenchido. */
export type LugarDoAlocar = { data: string; frenteId?: string; turnoId?: string };

export type SemanaProps = {
  calendarios: CalendarioDaSemana[];
  /** As cores das faixas: os turnos (por frente) ou as frentes (por turno). */
  legenda: ItemDaLegenda[];
  agrupar: Agrupamento;
  /** Os dias mostrados: seg a sex, mais sáb e dom quando têm plantão. */
  dias: string[];
  hoje: string;
  /** `chavePlantao` dos plantões em conflito. */
  conflitos: Set<string>;
  /** Horário padrão de cada turno ("07:00–13:00"), por id. */
  horarios: Record<string, string>;
  /** O que o cartão flutuante diz de um plantão. */
  descrever: (ocorrencia: OcorrenciaDto) => ItemDescricao[];
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

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function useCartao(): CartaoDoPlantao {
  const [cartao] = useState(() => PreviewCard.createHandle<OcorrenciaDto>());
  return cartao;
}

/** O que pinta as faixas da semana: bolinha, nome e (nos turnos) o horário. */
function Legenda({
  legenda,
  agrupar,
  horarios,
}: Pick<SemanaProps, 'legenda' | 'agrupar' | 'horarios'>) {
  if (legenda.length === 0) return null;
  return (
    <ul
      aria-label={agrupar === 'frente' ? 'Cores dos turnos' : 'Cores das frentes'}
      className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]"
    >
      {legenda.map((item) => (
        <li key={item.id} className="flex items-center gap-1.5">
          <Bolinha cor={item.cor} />
          <span className="font-medium">{item.rotulo}</span>
          {agrupar === 'frente' && horarios[item.id] && (
            <span className="text-muted-foreground tabular-nums">{horarios[item.id]}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function Contagem({ calendario }: { calendario: CalendarioDaSemana }) {
  if (calendario.plantoes === 0) {
    return <span className="text-muted-foreground text-[13px]">Ninguém nesta semana</span>;
  }
  return (
    <span className="text-muted-foreground text-[13px] tabular-nums">
      {plural(calendario.medicos, 'médico', 'médicos')},{' '}
      {plural(calendario.plantoes, 'plantão', 'plantões')}
    </span>
  );
}

/**
 * Semana no computador: um calendário por frente (ou por turno), com os dias nas colunas e, em
 * cada dia, uma lista só de médicos com a faixa lateral na cor do turno (ou da frente).
 */
export function SemanaCalendarios(props: SemanaProps) {
  const { calendarios, legenda, agrupar, horarios, descrever } = props;
  const cartao = useCartao();
  return (
    <div className="flex flex-col gap-4">
      <Legenda legenda={legenda} agrupar={agrupar} horarios={horarios} />
      {calendarios.map((calendario) => (
        <Calendario key={calendario.id} calendario={calendario} cartao={cartao} {...props} />
      ))}
      <CartaoFlutuante cartao={cartao} descrever={descrever} />
    </div>
  );
}

function Calendario({
  calendario,
  cartao,
  agrupar,
  dias,
  hoje,
  conflitos,
  horarios,
  onAbrir,
  onAlocar,
}: SemanaProps & { calendario: CalendarioDaSemana; cartao: CartaoDoPlantao }) {
  const tituloId = useId();
  const horario = agrupar === 'turno' ? horarios[calendario.id] : undefined;
  return (
    <section className="bg-card overflow-x-auto rounded-lg border">
      <table
        aria-labelledby={tituloId}
        className="w-full min-w-[720px] table-fixed border-collapse"
      >
        <caption className="border-b px-4 py-3 text-left">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex items-center gap-2 text-base font-semibold">
              <Bolinha cor={calendario.cor} />
              <span id={tituloId}>{calendario.rotulo}</span>
              {horario && (
                <span className="text-muted-foreground font-normal tabular-nums">{horario}</span>
              )}
            </span>
            <Contagem calendario={calendario} />
          </span>
        </caption>
        <thead>
          <tr className="border-b">
            {dias.map((dia) => (
              <th
                key={dia}
                scope="col"
                aria-current={dia === hoje ? 'date' : undefined}
                className={cn(
                  'text-subtle-foreground border-l px-2 py-2 text-left text-xs font-medium tabular-nums first:border-l-0',
                  dia === hoje && 'text-primary bg-accent/40 font-semibold',
                )}
              >
                {textoDia(dia)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {dias.map((dia) => (
              <td
                key={dia}
                className={cn(
                  'border-l p-0 align-top first:border-l-0',
                  dia === hoje && 'bg-accent/40',
                )}
              >
                <div className="flex flex-col">
                  <BlocosDoDia
                    linhas={calendario.porDia[dia] ?? []}
                    conflitos={conflitos}
                    horarios={horarios}
                    cartao={cartao}
                    onAbrir={onAbrir}
                  />
                  {onAlocar && (
                    <BotaoMais
                      rotulo={`Alocar em ${calendario.rotulo}, ${textoDia(dia)}`}
                      onClick={() =>
                        onAlocar({
                          data: dia,
                          ...(calendario.frenteId && { frenteId: calendario.frenteId }),
                          ...(calendario.turnoId && { turnoId: calendario.turnoId }),
                        })
                      }
                    />
                  )}
                </div>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </section>
  );
}

/**
 * Os médicos do dia em blocos: um por turno (ou frente), com uma faixa lateral contínua na cor
 * dele e os médicos colados, separados só por uma divisória fina; entre blocos, uma divisória mais
 * marcada.
 */
function BlocosDoDia({
  linhas,
  conflitos,
  horarios,
  cartao,
  onAbrir,
  emoldurar = false,
}: Pick<SemanaProps, 'conflitos' | 'horarios' | 'onAbrir'> & {
  linhas: LinhaDoDia[];
  cartao: CartaoDoPlantao;
  /** No celular, a lista ganha contorno (não há célula em volta). */
  emoldurar?: boolean;
}) {
  if (linhas.length === 0) return null;
  return (
    <ul className={cn('flex flex-col', emoldurar && 'overflow-hidden rounded-md border')}>
      {emBlocos(linhas).map((bloco) => (
        <li
          key={bloco.id}
          data-bloco={bloco.id}
          className={cn('border-l-border border-b border-l-[3px]', emoldurar && 'last:border-b-0')}
          style={bloco.cor ? { borderLeftColor: bloco.cor } : undefined}
        >
          <ul className="divide-border/60 divide-y">
            {bloco.linhas.map(({ ocorrencia: o }) => (
              <li key={`${o.alocacaoId}|${o.data}`}>
                <LinhaMedico
                  ocorrencia={o}
                  horarioDoTurno={horarios[o.turnoId]}
                  emConflito={conflitos.has(chavePlantao(o.alocacaoId, o.data))}
                  cartao={cartao}
                  onAbrir={onAbrir}
                />
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
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

/** Semana no celular: um bloco por dia, com os médicos de cada calendário e a mesma faixa. */
export function SemanaLista({
  calendarios,
  legenda,
  agrupar,
  dias,
  hoje,
  conflitos,
  horarios,
  descrever,
  onAbrir,
  onAlocar,
}: SemanaProps) {
  const cartao = useCartao();
  return (
    <div className="flex flex-col gap-4">
      <Legenda legenda={legenda} agrupar={agrupar} horarios={horarios} />
      {dias.map((dia) => {
        const titulo = `${NOMES_DIAS_LONGOS[diaDaSemana(dia)]}, ${rotuloDia(dia).dia}`;
        const grupos = calendarios.filter((c) => (c.porDia[dia] ?? []).length > 0);
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
            {grupos.map((calendario) => (
              <div key={calendario.id} className="flex flex-col gap-1">
                <h3 className="text-muted-foreground flex items-center gap-2 text-[13px] font-medium">
                  <Bolinha cor={calendario.cor} />
                  {calendario.rotulo}
                  {agrupar === 'turno' && horarios[calendario.id] && (
                    <span className="font-normal tabular-nums">{horarios[calendario.id]}</span>
                  )}
                </h3>
                <BlocosDoDia
                  linhas={calendario.porDia[dia] ?? []}
                  conflitos={conflitos}
                  horarios={horarios}
                  cartao={cartao}
                  onAbrir={onAbrir}
                  emoldurar
                />
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
      <CartaoFlutuante cartao={cartao} descrever={descrever} />
    </div>
  );
}
