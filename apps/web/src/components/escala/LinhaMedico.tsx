import { Button } from '@base-ui/react/button';
import { PreviewCard } from '@base-ui/react/preview-card';
import { Warning } from '@phosphor-icons/react';
import { useEffect, useRef } from 'react';

import type { OcorrenciaDto } from '../../gen/types/OcorrenciaDto';
import { cn } from '../../lib/cn';
import { Etiqueta } from '../etiqueta/Etiqueta';
import { SeloCor } from '../selo-cor/SeloCor';
import { dataCurta, diaDaSemana, NOMES_DIAS_LONGOS } from './calendario';
import type { ItemDescricao } from './descricao-plantao';

/** Um cartão flutuante por visão, aberto pela linha sob o mouse (ou com o foco do teclado). */
export type CartaoDoPlantao = PreviewCard.Handle<OcorrenciaDto>;

/** Que linha do cartão está sob o mouse (uma por cartão). */
const sobOMouse = new WeakMap<CartaoDoPlantao, { linha: OcorrenciaDto | null }>();
function mouseSobre(cartao: CartaoDoPlantao) {
  let estado = sobOMouse.get(cartao);
  if (!estado) {
    estado = { linha: null };
    sobOMouse.set(cartao, estado);
  }
  return estado;
}

/**
 * O cartão é só informativo: o mouse saiu da linha e não entrou em outra (nem foi para cima do
 * cartão, que não recebe o ponteiro), fecha. Indo direto para a linha vizinha, não fecha: fechar e
 * reabrir no meio da animação fazia o cartão pular uma linha sim, outra não.
 */
function sairDaLinha(cartao: CartaoDoPlantao, o: OcorrenciaDto) {
  const estado = mouseSobre(cartao);
  if (estado.linha === o) estado.linha = null;
  setTimeout(() => {
    if (estado.linha === null) cartao.close();
  }, 80);
}

type LinhaMedicoProps = {
  ocorrencia: OcorrenciaDto;
  /** "07:00–13:00": o horário do plantão só aparece quando é outro. */
  horarioDoTurno?: string;
  emConflito?: boolean;
  cartao: CartaoDoPlantao;
  onAbrir: (ocorrencia: OcorrenciaDto) => void;
};

/**
 * Um médico no dia da semana (dentro do bloco do turno, que tem a faixa): nome, horário (só se fugir do turno), produtividade e selos curtos.
 * Passar o mouse (ou o foco) abre o cartão com a descrição; o clique abre o plantão no painel.
 */
export function LinhaMedico({
  ocorrencia: o,
  horarioDoTurno,
  emConflito = false,
  cartao,
  onAbrir,
}: LinhaMedicoProps) {
  const horario = `${o.horarioInicio}–${o.horarioFim}`;
  const mostrarHorario = horario !== horarioDoTurno;
  const selos = [
    emConflito && (
      <Etiqueta key="conflito" tom="erro" icone={Warning}>
        Conflito
      </Etiqueta>
    ),
    o.ausente && (
      <SeloCor key="ausente" cor={o.tipoAusenciaCor}>
        {o.tipoAusenciaNome ?? 'Ausente'}
      </SeloCor>
    ),
    o.cobertoPor && (
      <Etiqueta key="coberto" tom="atencao">
        {`Coberto por ${o.cobertoPor.medicoNome}`}
      </Etiqueta>
    ),
    o.coberturaDe && (
      <Etiqueta key="cobrindo" tom="info">
        {`Cobrindo ${o.coberturaDe.medicoNome}`}
      </Etiqueta>
    ),
    o.gratificado && (
      <Etiqueta key="gratificado" tom="sucesso">
        Gratificado
      </Etiqueta>
    ),
  ].filter(Boolean);

  return (
    <PreviewCard.Trigger
      handle={cartao}
      payload={o}
      delay={400}
      closeDelay={50}
      render={<Button type="button" />}
      onClick={() => onAbrir(o)}
      onPointerEnter={(evento) => {
        if (evento.pointerType === 'mouse') mouseSobre(cartao).linha = o;
      }}
      onPointerLeave={(evento) => {
        if (evento.pointerType === 'mouse') sairDaLinha(cartao, o);
      }}
      className={cn(
        'hover:bg-muted flex w-full min-w-0 flex-col items-start gap-0.5 px-2 py-1 text-left text-[13px]',
        'focus-visible:outline-ring focus-visible:outline-2 focus-visible:-outline-offset-2',
        emConflito && 'bg-destructive-soft/50',
      )}
    >
      <span
        className={cn(
          'w-full truncate font-medium',
          o.ausente && 'text-muted-foreground line-through',
        )}
      >
        {o.medicoNome}
      </span>
      {(mostrarHorario || o.produtividade !== null) && (
        <span className="text-muted-foreground flex max-w-full flex-wrap gap-x-2 text-xs tabular-nums">
          {mostrarHorario && <span>{horario}</span>}
          {o.produtividade !== null && (
            <span
              className={cn(o.ajustada && 'bg-warning-soft text-warning rounded px-1 font-medium')}
            >
              {o.gratificado ? `cota ${o.produtividade}` : `${o.produtividade} reg.`}
              {o.ajustada && <span className="sr-only"> (ajustada neste dia)</span>}
            </span>
          )}
        </span>
      )}
      {selos.length > 0 && <span className="flex max-w-full flex-wrap gap-1">{selos}</span>}
    </PreviewCard.Trigger>
  );
}

/**
 * O cartão flutuante da visão. No toque (celular) ele não abre: o toque abre o painel, que já
 * mostra tudo.
 */
export function CartaoFlutuante({
  cartao,
  descrever,
}: {
  cartao: CartaoDoPlantao;
  descrever: (ocorrencia: OcorrenciaDto) => ItemDescricao[];
}) {
  const ultimoPonteiro = useRef<string>('mouse');
  useEffect(() => {
    const lembrar = (evento: PointerEvent) => {
      ultimoPonteiro.current = evento.pointerType;
    };
    const teclado = () => {
      ultimoPonteiro.current = 'teclado';
    };
    document.addEventListener('pointerdown', lembrar, true);
    document.addEventListener('pointermove', lembrar, true);
    document.addEventListener('keydown', teclado, true);
    return () => {
      document.removeEventListener('pointerdown', lembrar, true);
      document.removeEventListener('pointermove', lembrar, true);
      document.removeEventListener('keydown', teclado, true);
    };
  }, []);

  return (
    <PreviewCard.Root
      handle={cartao}
      onOpenChange={(aberto, detalhes) => {
        if (aberto && ultimoPonteiro.current === 'touch') detalhes.cancel();
      }}
    >
      {({ payload }) => (
        <PreviewCard.Portal>
          <PreviewCard.Positioner
            side="right"
            align="start"
            sideOffset={8}
            className="pointer-events-none z-50"
          >
            <PreviewCard.Popup className="bg-popover text-popover-foreground w-72 origin-(--transform-origin) rounded-lg border p-3 shadow-lg transition-[opacity,scale] duration-150 ease-out data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 motion-reduce:transition-none">
              {payload && <Descricao ocorrencia={payload} itens={descrever(payload)} />}
            </PreviewCard.Popup>
          </PreviewCard.Positioner>
        </PreviewCard.Portal>
      )}
    </PreviewCard.Root>
  );
}

function Descricao({
  ocorrencia: o,
  itens,
}: {
  ocorrencia: OcorrenciaDto;
  itens: ItemDescricao[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col">
        <span className="font-semibold">{o.medicoNome}</span>
        <span className="text-muted-foreground text-[13px] tabular-nums">
          {NOMES_DIAS_LONGOS[diaDaSemana(o.data)]}, {dataCurta(o.data)}
        </span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
        {itens.map((item) => (
          <div key={`${item.rotulo}|${item.valor}`} className="contents">
            <dt className="text-subtle-foreground">{item.rotulo}</dt>
            <dd
              className={cn(
                'min-w-0 tabular-nums',
                item.rotulo === 'Conflito' && 'text-destructive',
              )}
            >
              <ValorDescricao ocorrencia={o} item={item} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ComCor({ cor, children }: { cor: string | null; children: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5">
      <span
        aria-hidden
        className="border-border size-2 flex-none rounded-full border"
        style={cor ? { backgroundColor: cor, borderColor: cor } : undefined}
      />
      <span className="truncate">{children}</span>
    </span>
  );
}

/** O valor de uma linha do cartão, com as cores que são dado (frente, turno, tipo de ausência). */
function ValorDescricao({
  ocorrencia: o,
  item,
}: {
  ocorrencia: OcorrenciaDto;
  item: ItemDescricao;
}) {
  if (item.rotulo === 'Onde') {
    return (
      <span className="flex flex-wrap gap-x-3 gap-y-0.5">
        <ComCor cor={o.frenteCor}>{o.frenteRotulo}</ComCor>
        <ComCor cor={o.turnoCor}>{o.turnoNome}</ComCor>
      </span>
    );
  }
  if (item.rotulo === 'Ausência') return <ComCor cor={o.tipoAusenciaCor}>{item.valor}</ComCor>;
  if (item.rotulo === 'Cobertura') {
    return <Etiqueta tom={o.coberturaDe ? 'info' : 'atencao'}>{item.valor}</Etiqueta>;
  }
  return item.valor;
}
