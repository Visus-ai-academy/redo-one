import { Collapsible } from '@base-ui/react/collapsible';
import { Tooltip } from '@base-ui/react/tooltip';
import { CaretRight } from '@phosphor-icons/react';
import { type ReactNode, useRef, useState } from 'react';

import type { FilaDoMomentoDto } from '../../gen/types/FilaDoMomentoDto';
import { cn } from '../../lib/cn';
import { num } from '../../lib/rodada';
import { AjudaContextual } from '../ajuda/AjudaContextual';
import { BarraEmpilhada } from '../barra/BarraEmpilhada';
import { BolinhaCor } from '../bolinha-cor/BolinhaCor';
import { SeloCor } from '../selo-cor/SeloCor';
import { Caixa, TituloSecao } from './comum';

/** Prioridade sem cor cadastrada: tons de neutro na ordem da operação (a primeira, mais escura). */
const TONS_NEUTROS = [85, 64, 48, 36, 28];
const corDaPrioridade = (p: { cor: string | null }, i: number) =>
  p.cor ??
  `color-mix(in srgb, var(--muted-foreground) ${TONS_NEUTROS[Math.min(i, TONS_NEUTROS.length - 1)]}%, white)`;

const urgentesTexto = (n: number) => `${num(n)} ${n === 1 ? 'urgente' : 'urgentes'}`;

type PrioridadeComCor = FilaDoMomentoDto['prioridades'][number] & { cor: string };
type Frente = FilaDoMomentoDto['porFrente'][number];
type Contagem = Frente['porPrioridade'][number];

const chaveDa = (f: Frente) => f.frenteId ?? 'sem-frente';

/**
 * Cada frente numa linha: nome, quantos são tratados como urgência, total e uma barra empilhada
 * pela prioridade da operação. Passar o mouse ou focar a linha mostra o número de cada prioridade
 * (Tooltip); no toque, tocar na barra. A frente com subespecialidade abre (Collapsible) as
 * sub-linhas no mesmo formato; a de modalidade, ou sem nenhum exame com subespecialidade, não abre.
 * As abertas ficam aqui, para sobreviverem à atualização automática da fila.
 */
export function PorFrente({ fila }: { fila: FilaDoMomentoDto }) {
  const prioridades: PrioridadeComCor[] = fila.prioridades.map((p, i) => ({
    ...p,
    cor: corDaPrioridade(p, i),
  }));
  const [abertas, setAbertas] = useState<ReadonlySet<string>>(() => new Set());
  const abrir = (chave: string, aberta: boolean) =>
    setAbertas((atual) => {
      const nova = new Set(atual);
      if (aberta) nova.add(chave);
      else nova.delete(chave);
      return nova;
    });

  return (
    <section aria-labelledby="titulo-matriz" className="flex min-w-0 flex-col gap-3 lg:col-span-1">
      <TituloSecao
        titulo="Por frente e prioridade da operação"
        id="titulo-matriz"
        ajuda={
          <AjudaContextual assunto="a frente e a prioridade da operação">
            Frente é a da escala (especialidade ou modalidade). A prioridade da operação vem do
            de-para em Configurações › Distribuição. Passe o mouse ou foque a linha para ver os
            exames de cada prioridade (no celular, toque na barra). Clique na frente para ver as
            subespecialidades.
          </AjudaContextual>
        }
      />
      <Caixa>
        <ul aria-labelledby="titulo-matriz" className="divide-y">
          {fila.porFrente.map((f) => (
            <LinhaFrente
              key={chaveDa(f)}
              frente={f}
              prioridades={prioridades}
              aberta={abertas.has(chaveDa(f))}
              onAbrir={(aberta) => abrir(chaveDa(f), aberta)}
            />
          ))}
        </ul>
        <ul
          aria-label="Total por prioridade"
          className="bg-muted flex flex-wrap gap-x-4 gap-y-1 border-t px-4 py-2.5 text-[13px] tabular-nums"
        >
          {prioridades.map((p) => (
            <li key={p.prioridadeOperacaoId ?? 'sem'} className="flex items-center gap-1.5">
              <BolinhaCor cor={p.cor} className="size-2.5" />
              <span className="text-muted-foreground">{p.nome}</span>
              <span className="font-semibold">{num(p.exames)}</span>
            </li>
          ))}
        </ul>
      </Caixa>
    </section>
  );
}

function LinhaFrente({
  frente: f,
  prioridades,
  aberta,
  onAbrir,
}: {
  frente: Frente;
  prioridades: PrioridadeComCor[];
  aberta: boolean;
  onAbrir: (aberta: boolean) => void;
}) {
  const expansivel = f.porSegmento.some((s) => s.segmentoId !== null);
  const linha = (
    <LinhaComDetalhe
      titulo={f.nome}
      total={f.exames}
      urgentes={f.urgentes}
      contagens={f.porPrioridade}
      prioridades={prioridades}
      expansivel={expansivel}
      className="px-4 pt-2.5 pb-1.5"
      nome={
        <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
          <CaretRight
            size={14}
            aria-hidden
            className={cn(
              'text-muted-foreground flex-none self-center',
              !expansivel && 'invisible',
              aberta && 'rotate-90',
            )}
          />
          <span className="min-w-0 font-medium break-words">{f.nome}</span>
        </span>
      }
    />
  );
  if (!expansivel) return <li>{linha}</li>;
  return (
    <Collapsible.Root open={aberta} onOpenChange={onAbrir} render={<li />}>
      {linha}
      <Collapsible.Panel
        render={<ul aria-label={`Subespecialidades de ${f.nome}`} />}
        className="border-t border-dashed"
      >
        {f.porSegmento.map((s) => (
          <li key={s.segmentoId ?? 'sem-segmento'}>
            <LinhaComDetalhe
              titulo={`${f.nome} › ${s.nome}`}
              total={s.exames}
              urgentes={s.urgentes}
              contagens={s.porPrioridade}
              prioridades={prioridades}
              className="py-1.5 pr-4 pl-[38px]"
              nome={
                <span className="flex min-w-0 flex-1">
                  <SeloCor cor={s.cor}>{s.nome}</SeloCor>
                </span>
              }
            />
          </li>
        ))}
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}

/**
 * A linha (frente ou subespecialidade) com o detalhe por prioridade num Tooltip do Base UI: abre
 * ao passar o mouse (rápido) e no foco pelo teclado. O Tooltip não abre no toque; lá, tocar na
 * barra abre e fecha o detalhe (sem expandir a frente). Na frente que expande, o mesmo botão é o
 * gatilho do Collapsible.
 */
function LinhaComDetalhe({
  titulo,
  nome,
  total,
  urgentes,
  contagens,
  prioridades,
  expansivel = false,
  className,
}: {
  titulo: string;
  nome: ReactNode;
  total: number;
  urgentes: number;
  contagens: Contagem[];
  prioridades: PrioridadeComCor[];
  expansivel?: boolean;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const ponteiro = useRef<string | null>(null);
  const daPrioridade = (id: string | null) =>
    contagens.find((c) => c.prioridadeOperacaoId === id)?.exames ?? 0;
  const comExame = prioridades.filter((p) => daPrioridade(p.prioridadeOperacaoId) > 0);
  const base = Math.max(total, 1);

  return (
    <Tooltip.Root open={aberto} onOpenChange={setAberto}>
      <Tooltip.Trigger
        delay={150}
        render={expansivel ? <Collapsible.Trigger /> : undefined}
        onPointerDown={(e) => {
          ponteiro.current = e.pointerType;
        }}
        onClick={(e) => {
          // No toque, a barra abre e fecha o detalhe, sem expandir a frente nem fechar a dica.
          const naBarra = (e.target as Element).closest('[data-barra]');
          if (ponteiro.current !== 'touch' || !naBarra) return;
          e.preventBaseUIHandler();
          setAberto((a) => !a);
        }}
        className={cn(
          'focus-visible:outline-ring flex w-full flex-col gap-1 text-left focus-visible:outline-2 focus-visible:-outline-offset-2',
          expansivel ? 'hover:bg-muted' : 'cursor-default',
          className,
        )}
      >
        <span className="flex w-full items-baseline gap-2">
          {nome}
          {urgentes > 0 && (
            <span className="text-destructive text-[13px] font-medium whitespace-nowrap tabular-nums">
              {urgentesTexto(urgentes)}
            </span>
          )}
          <span className="min-w-8 text-right text-base font-semibold tabular-nums">
            {num(total)}
          </span>
        </span>
        <span data-barra="" className="flex w-full py-1.5">
          <BarraEmpilhada
            separados
            className="h-2 w-full"
            rotulo={comExame
              .map((p) => `${p.nome}: ${num(daPrioridade(p.prioridadeOperacaoId))}`)
              .join(', ')}
            segmentos={prioridades.map((p) => ({
              pct: (daPrioridade(p.prioridadeOperacaoId) / base) * 100,
              cor: p.cor,
            }))}
          />
        </span>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner side="top" align="start" sideOffset={4} className="z-50">
          <Tooltip.Popup className="bg-popover text-popover-foreground w-[min(260px,calc(100vw-32px))] rounded-md border px-3 py-2 text-[13px] shadow-lg transition-opacity duration-150 ease-out data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none">
            <p className="mb-1.5 font-semibold break-words">{titulo}</p>
            <ul className="flex flex-col gap-1 tabular-nums">
              {comExame.map((p) => (
                <li key={p.prioridadeOperacaoId ?? 'sem'} className="flex items-center gap-2">
                  <BolinhaCor cor={p.cor} className="size-2.5" />
                  <span className="min-w-0 flex-1 truncate">{p.nome}</span>
                  <span className="font-semibold">{num(daPrioridade(p.prioridadeOperacaoId))}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1.5 flex border-t pt-1.5 font-semibold tabular-nums">
              <span className="flex-1">Total</span>
              <span>{num(total)}</span>
            </p>
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
