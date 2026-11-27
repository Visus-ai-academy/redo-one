import { Button } from '@base-ui/react/button';
import { Field } from '@base-ui/react/field';
import { NumberField as BaseNumberField } from '@base-ui/react/number-field';
import { RadioGroup } from '@base-ui/react/radio-group';
import { Clock, Prohibit } from '@phosphor-icons/react';
import type { ReactNode } from 'react';

import type { PrioridadeOperacaoDto } from '../../gen/types/PrioridadeOperacaoDto';
import type { RegraRecebimentoDto } from '../../gen/types/RegraRecebimentoDto';
import type { RotuloDto } from '../../gen/types/RotuloDto';
import { cn } from '../../lib/cn';
import { buttonClassName } from '../button/button-class';
import { CelulaComPopover } from '../celula-popover/CelulaComPopover';
import { Etiqueta } from '../etiqueta/Etiqueta';
import { controlClassName } from '../form/control-class';
import { ListaDeOpcoes } from '../opcoes/ListaDeOpcoes';
import {
  aplicarNasCelulas,
  chaveCelula,
  type Grade,
  OPCOES_RECEBIMENTO,
  regraEfetiva,
  rotuloCurto,
  rotuloRecebimento,
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

const ICONE = { segue_sla: null, prazo_minimo: Clock, nao_recebe: Prohibit } as const;

/**
 * O valor curto da célula. O padrão (segue o SLA) fica discreto; as exceções ganham etiqueta com
 * ícone e texto. Herdada (na frente): o valor da geral, esmaecido, com a marca "geral".
 */
function ValorDaCelula({
  regra,
  herdada,
  naFrente,
}: {
  regra: RegraRecebimentoDto;
  herdada: boolean;
  naFrente: boolean;
}) {
  const Icone = ICONE[regra.tipo];
  if (herdada) {
    return (
      <span className="text-subtle-foreground flex flex-col leading-tight">
        <span className="inline-flex items-center gap-1 text-[13px] tabular-nums">
          {Icone && <Icone size={14} aria-hidden />}
          {rotuloCurto(regra)}
        </span>
        <span className="text-xs">geral</span>
      </span>
    );
  }
  if (regra.tipo === 'prazo_minimo') {
    return (
      <Etiqueta tom="info" icone={Clock}>
        <span className="tabular-nums">{rotuloCurto(regra)}</span>
      </Etiqueta>
    );
  }
  if (regra.tipo === 'nao_recebe') {
    return (
      <Etiqueta tom="atencao" icone={Prohibit}>
        {rotuloCurto(regra)}
      </Etiqueta>
    );
  }
  // Segue o SLA: na geral é o padrão (discreto); na frente, escolhido de propósito.
  return naFrente ? (
    <Etiqueta tom="inativo">SLA</Etiqueta>
  ) : (
    <span className="text-subtle-foreground text-[13px]">SLA</span>
  );
}

/** A linha de legenda acima da grade: o que cada valor quer dizer, curto. */
function Legenda({ naFrente, editavel }: { naFrente: boolean; editavel: boolean }) {
  const item = (marca: ReactNode, texto: string) => (
    <li className="flex items-center gap-1.5">
      {marca}
      <span>{texto}</span>
    </li>
  );
  return (
    <ul className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px]">
      {item(<span className="text-subtle-foreground font-medium">SLA</span>, 'recebe pelo prazo')}
      {item(
        <Etiqueta tom="info" icone={Clock}>
          ≥ N h
        </Etiqueta>,
        'só com N h ou mais até vencer',
      )}
      {item(
        <Etiqueta tom="atencao" icone={Prohibit}>
          Não recebe
        </Etiqueta>,
        'o turno não pega',
      )}
      {naFrente &&
        item(
          <span className="text-subtle-foreground font-medium">geral</span>,
          'como na grade geral',
        )}
      {editavel && <li className="text-subtle-foreground">Clique na célula para mudar.</li>}
    </ul>
  );
}

type Opcao = { valor: ValorCelula['tipo']; rotulo: string; ajuda?: string };

const OPCOES: Opcao[] = OPCOES_RECEBIMENTO;

/** O editor da célula, no popover: a regra, as horas na mesma linha e o uso em lote. */
function EditorDaCelula({
  atual,
  herdada,
  erro,
  onMudar,
  onLinha,
  onColuna,
  prioridade,
  turno,
}: {
  atual: ValorCelula;
  /** Na frente: a regra da grade geral. */
  herdada: RegraRecebimentoDto | null;
  erro?: string;
  onMudar: (v: ValorCelula) => void;
  onLinha: () => void;
  onColuna: () => void;
  prioridade: string;
  turno: string;
}) {
  const opcoes: Opcao[] = herdada
    ? [{ valor: 'geral', rotulo: 'Como na geral' }, ...OPCOES]
    : OPCOES;
  return (
    <div className="flex flex-col gap-3">
      {herdada && (
        <p className="text-muted-foreground -mt-1 text-[13px]">
          Na grade geral: {rotuloRecebimento(herdada)}
        </p>
      )}
      <Field.Root>
        <RadioGroup
          aria-label="Regra de recebimento"
          value={atual.tipo}
          onValueChange={(tipo) => {
            const t = tipo as ValorCelula['tipo'];
            onMudar({ tipo: t, horas: t === 'prazo_minimo' ? atual.horas || '24' : '' });
          }}
        >
          <ListaDeOpcoes
            direcao="coluna"
            opcoes={opcoes.map((o) => {
              const comHoras = o.valor === 'prazo_minimo' && atual.tipo === 'prazo_minimo';
              return {
                ...o,
                anexo: comHoras && (
                  <CampoHoras
                    valor={atual.horas}
                    onChange={(horas) => onMudar({ ...atual, horas })}
                    rotulo="Horas mínimas até o prazo"
                    invalido={Boolean(erro)}
                  />
                ),
                ajuda:
                  comHoras && erro ? (
                    <>
                      {o.ajuda}
                      <span className="text-destructive block">{erro}</span>
                    </>
                  ) : (
                    o.ajuda
                  ),
              };
            })}
          />
        </RadioGroup>
      </Field.Root>
      <div className="-mx-3 flex flex-col items-start gap-1 border-t px-1.5 pt-2">
        <Button
          type="button"
          onClick={onLinha}
          className={buttonClassName({ variant: 'ghost', className: 'h-8 px-1.5 text-[13px]' })}
        >
          Usar em toda a linha {prioridade}
        </Button>
        <Button
          type="button"
          onClick={onColuna}
          className={buttonClassName({ variant: 'ghost', className: 'h-8 px-1.5 text-[13px]' })}
        >
          Usar em toda a coluna {turno}
        </Button>
      </div>
    </div>
  );
}

/**
 * A grade de recebimento: prioridade da operação (linha) × turno da escala (coluna). Cada célula
 * mostra a regra em poucas letras e abre o editor num popover. Na frente, a célula sem
 * sobrescrita mostra a da geral, esmaecida, com a marca "geral". A grade rola na horizontal
 * dentro da caixa, com a coluna da prioridade fixa.
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
  const naFrente = Boolean(geral);
  const prioridadeIds = prioridades.map((p) => p.id);
  const turnoIds = turnos.map((t) => t.id);

  return (
    <div className="flex flex-col gap-3">
      <Legenda naFrente={naFrente} editavel={!somenteLeitura} />
      {/* O espaço à esquerda na rolagem deixa a célula focada fora de baixo da coluna fixa. */}
      <div className="scroll-pl-[136px] overflow-x-auto rounded-lg border">
        <table className="w-full border-separate border-spacing-0 text-left [&_tbody_tr:last-child>*]:border-b-0">
          <thead>
            <tr>
              <th
                scope="col"
                className="bg-card text-subtle-foreground sticky left-0 z-10 h-10 w-[136px] min-w-[136px] border-r border-b px-3 text-[13px] font-medium"
              >
                Prioridade
              </th>
              {turnos.map((t) => (
                <th
                  key={t.id}
                  scope="col"
                  className="text-subtle-foreground h-10 min-w-[108px] border-b px-3 text-[13px] font-medium whitespace-nowrap"
                >
                  {t.nome}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {prioridades.map((p) => (
              <tr key={p.id}>
                <th
                  scope="row"
                  className="bg-card sticky left-0 z-10 h-11 border-r border-b px-3 text-left font-medium"
                >
                  <span className="flex flex-col leading-tight">
                    <span className="truncate">{p.nome}</span>
                    <span className="text-subtle-foreground text-xs font-normal tabular-nums">
                      Posição {p.posicao}
                    </span>
                  </span>
                </th>
                {turnos.map((t) => {
                  const chave = chaveCelula(p.id, t.id);
                  const atual = valor[chave] ?? {
                    tipo: naFrente ? 'geral' : 'segue_sla',
                    horas: '',
                  };
                  const herdada = geral ? regraEfetiva(geral, p.id, t.id) : null;
                  const efetiva = regraEfetiva(valor, p.id, t.id, geral);
                  const ehHerdada = naFrente && atual.tipo === 'geral';
                  const nome = `${p.nome} no turno ${t.nome}`;
                  const descricao = `${rotuloRecebimento(efetiva)}${ehHerdada ? ', como na geral' : ''}`;
                  const conteudo = (
                    <ValorDaCelula regra={efetiva} herdada={ehHerdada} naFrente={naFrente} />
                  );
                  if (somenteLeitura) {
                    return (
                      <td key={t.id} className="h-11 border-b px-3 whitespace-nowrap">
                        {conteudo}
                        <span className="sr-only">{`: ${descricao}`}</span>
                      </td>
                    );
                  }
                  return (
                    <td key={t.id} className="h-11 border-b p-0">
                      <CelulaComPopover
                        rotulo={`${nome}: ${descricao}`}
                        titulo={nome}
                        valor={conteudo}
                        invalida={Boolean(erros[chave])}
                      >
                        <EditorDaCelula
                          atual={atual}
                          herdada={herdada}
                          erro={erros[chave]}
                          prioridade={p.nome}
                          turno={t.nome}
                          onMudar={(v) => onChange?.({ ...valor, [chave]: v })}
                          onLinha={() =>
                            onChange?.(aplicarNasCelulas(valor, [p.id], turnoIds, atual))
                          }
                          onColuna={() =>
                            onChange?.(aplicarNasCelulas(valor, prioridadeIds, [t.id], atual))
                          }
                        />
                      </CelulaComPopover>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
