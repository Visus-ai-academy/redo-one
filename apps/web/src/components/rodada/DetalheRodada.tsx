import { Button } from '@base-ui/react/button';
import { CaretDown, CaretRight, CheckCircle, LinkSimple, XCircle } from '@phosphor-icons/react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Fragment, type ReactNode, useState } from 'react';

import { rodadasControllerDesignacoes } from '../../gen/clients/rodadasControllerDesignacoes';
import { rodadasControllerDesignacoesQueryOptions } from '../../gen/hooks/useRodadasControllerDesignacoes';
import { rodadasControllerExplicacaoQueryOptions } from '../../gen/hooks/useRodadasControllerExplicacao';
import type { ResumoRodadaDto } from '../../gen/types/ResumoRodadaDto';
import type { RodadaDto } from '../../gen/types/RodadaDto';
import type { StatusDesignacaoKey } from '../../gen/types/StatusDesignacao';
import { horaDeBrasilia } from '../../lib/acesso';
import { cn } from '../../lib/cn';
import { dataHoraCurta } from '../../lib/datas';
import {
  descreverRecortes,
  funilDosExames,
  funilDosMedicos,
  juntarNomes,
  type LinhaFunil,
  num,
  resumoDoRecolhimento,
  situacaoDaRodada,
  tituloDaRodada,
} from '../../lib/rodada';
import { Alerta } from '../alerta/Alerta';
import { BarraEmpilhada } from '../barra/BarraEmpilhada';
import { BuscaSelecao, type OpcaoBusca } from '../busca/BuscaSelecao';
import { buttonClassName } from '../button/button-class';
import { Etiqueta } from '../etiqueta/Etiqueta';
import { Paginacao } from '../paginacao/Paginacao';
import { usePaginaLocal } from '../paginacao/use-pagina-local';
import { Skeleton } from '../skeleton/Skeleton';
import { useAvisos } from '../toast/use-avisos';
import { Caixa, TituloSecao } from './comum';

const semAcento = (t: string) =>
  t
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/**
 * A rodada inteira, com endereço próprio (`/distribuicao/rodadas/:id`): quem pediu e aprovou, os
 * recortes, o funil dos exames (cada etapa abre os exames que ela tirou), o funil dos médicos, como
 * o robô montou a proposta, "por que este médico não pegou este exame" e o diário.
 */
export function DetalheRodada({
  rodada,
  resumo,
  nomes,
  caminho,
  buscarMedicos,
}: {
  rodada: RodadaDto;
  resumo: ResumoRodadaDto | undefined;
  nomes: ReadonlyMap<string, string>;
  /** O caminho (Distribuição › Histórico), com os links. */
  caminho: ReactNode;
  buscarMedicos: (termo: string) => Promise<OpcaoBusca[]>;
}) {
  const { sucesso } = useAvisos();
  const s = situacaoDaRodada(rodada.status);
  const [exame, setExame] = useState<OpcaoBusca | null>(null);
  const titulo = tituloDaRodada(rodada.criadoEm);
  const ajustes = resumo?.ajustes;
  const conferencia = ajustes
    ? [
        ajustes.tirados && `${num(ajustes.tirados)} exame(s) tirado(s)`,
        ajustes.movidos && `${num(ajustes.movidos)} movido(s)`,
        ajustes.naMao && `${num(ajustes.naMao)} mandado(s) na mão`,
      ].filter(Boolean)
    : [];
  const fim = rodada.eventos.at(-1)?.em;
  const recolhimento = resumoDoRecolhimento(resumo?.recolhimento);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        {caminho}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[22px] leading-snug font-semibold tabular-nums">{titulo}</h1>
            <Etiqueta tom={s.tom}>{s.texto}</Etiqueta>
          </div>
          <Button
            type="button"
            onClick={async () => {
              await navigator.clipboard?.writeText(window.location.href);
              sucesso('Link copiado.');
            }}
            className={buttonClassName({ variant: 'secondary' })}
          >
            <LinkSimple size={16} aria-hidden />
            Copiar link
          </Button>
        </div>
      </header>

      <section aria-label="Resumo da rodada" className="bg-card rounded-lg border p-4">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 tabular-nums sm:grid-cols-2 xl:grid-cols-3">
          <Dado rotulo="Pedida">
            {horaDeBrasilia(rodada.criadoEm)}
            {rodada.solicitadaPor && `, por ${rodada.solicitadaPor.nome}`}
          </Dado>
          <Dado rotulo="Fila lida">
            {rodada.lidaEm
              ? `${horaDeBrasilia(rodada.lidaEm)}, ${num(rodada.lidos)} exames${rodada.recolhidos ? ` e ${num(rodada.recolhidos)} recolhido(s)` : ''} (${num(rodada.urgentes)} urgências)`
              : 'Não chegou a ler'}
          </Dado>
          <Dado rotulo="Aprovada">
            {rodada.aprovadaEm
              ? `${horaDeBrasilia(rodada.aprovadaEm)}${rodada.aprovadaPor ? `, por ${rodada.aprovadaPor.nome}` : ''}`
              : 'Não aprovada'}
          </Dado>
          <Dado rotulo="Última movimentação">{fim ? dataHoraCurta(fim) : '—'}</Dado>
          <Dado rotulo="Recortes">
            {descreverRecortes(rodada.recortes, nomes)
              .map((r) => `${r.rotulo}: ${r.valor}`)
              .join('; ')}
          </Dado>
          <Dado rotulo="Conferência">
            {conferencia.length ? juntarNomes(conferencia as string[]) : 'Sem ajustes'}
          </Dado>
          {recolhimento && (
            <Dado rotulo="Recolhimento">
              {recolhimento.texto}
              {recolhimento.ficaram.length > 0 && (
                <span className="text-muted-foreground block text-[13px]">
                  {`Ficaram com o médico: ${recolhimento.ficaram
                    .map(
                      (f) =>
                        `${f.rotulo.charAt(0).toLowerCase()}${f.rotulo.slice(1)} (${num(f.quantidade)})`,
                    )
                    .join('; ')}`}
                </span>
              )}
            </Dado>
          )}
        </dl>
        {rodada.erro && (
          <Alerta tom="erro" className="mt-3">
            {rodada.erro}
          </Alerta>
        )}
      </section>

      {!resumo ? (
        <Skeleton className="h-72 w-full" />
      ) : (
        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[3fr_2fr]">
          <FunilExames rodada={rodada} resumo={resumo} onPorQue={setExame} />
          <div className="flex flex-col gap-6">
            <FunilMedicos resumo={resumo} />
            {resumo.trilha && (
              <section aria-labelledby="titulo-trilha" className="flex flex-col gap-3">
                <TituloSecao titulo="Como o robô montou a proposta" id="titulo-trilha" />
                <Caixa>
                  <dl className="divide-y">
                    <Linha
                      rotulo="Exames que foram em pacote"
                      valor={num(resumo.trilha.examesAgrupados)}
                    />
                    <Linha
                      rotulo="Foram ao médico que já tinha o paciente"
                      valor={num(resumo.trilha.aderencia)}
                    />
                  </dl>
                </Caixa>
              </section>
            )}
          </div>
        </div>
      )}

      {resumo && rodada.lidaEm && (
        <PorQue
          rodada={rodada}
          resumo={resumo}
          exame={exame}
          onExame={setExame}
          buscarMedicos={buscarMedicos}
        />
      )}

      <Diario rodada={rodada} />
    </div>
  );
}

function Dado({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-subtle-foreground text-xs">{rotulo}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className="font-semibold tabular-nums">{valor}</dd>
    </div>
  );
}

const GRADE_FUNIL =
  'grid grid-cols-[minmax(0,1fr)_64px_minmax(96px,160px)_24px] items-center gap-3';

function FunilExames({
  rodada,
  resumo,
  onPorQue,
}: {
  rodada: RodadaDto;
  resumo: ResumoRodadaDto;
  onPorQue: (exame: OpcaoBusca) => void;
}) {
  const [aberta, setAberta] = useState<string | null>(null);
  const linhas = funilDosExames(rodada.lidos, resumo.motivos, rodada.recolhidos);
  const total = rodada.lidos + rodada.recolhidos;
  const base = Math.max(total, 1);
  return (
    <section aria-labelledby="titulo-funil" className="flex min-w-0 flex-col gap-3">
      <TituloSecao titulo="Funil dos exames" id="titulo-funil" />
      <Caixa>
        <div className={cn(GRADE_FUNIL, 'text-subtle-foreground border-b px-4 py-2 text-xs')}>
          <span>Etapa</span>
          <span className="text-right">Saíram</span>
          <span>Seguiram</span>
          <span />
        </div>
        <ul>
          {linhas.map((l, i) => {
            const chave = `${i}-${l.rotulo}`;
            const abre = l.filtro !== null && l.saem > 0;
            const estaAberta = aberta === chave;
            const conteudo = (
              <>
                <span className={cn('min-w-0', l.marco && 'font-semibold')}>{l.rotulo}</span>
                <span className="text-right tabular-nums">{l.saem ? `−${num(l.saem)}` : ''}</span>
                <span className="flex items-center gap-2 tabular-nums">
                  <span className="w-12 text-right">{num(l.restam)}</span>
                  <BarraEmpilhada
                    className="flex-1"
                    rotulo={`${num(l.restam)} de ${num(total)}`}
                    segmentos={[{ pct: (l.restam / base) * 100, tom: l.marco ? 'forte' : 'suave' }]}
                  />
                </span>
                <span className="text-subtle-foreground flex justify-end">
                  {abre &&
                    (estaAberta ? (
                      <CaretDown size={16} aria-hidden />
                    ) : (
                      <CaretRight size={16} aria-hidden />
                    ))}
                </span>
              </>
            );
            return (
              <Fragment key={chave}>
                <li className={cn('border-b last:border-b-0', l.marco && 'bg-muted')}>
                  {abre ? (
                    <button
                      type="button"
                      aria-expanded={estaAberta}
                      onClick={() => setAberta(estaAberta ? null : chave)}
                      className={cn(
                        GRADE_FUNIL,
                        'hover:bg-muted focus-visible:outline-ring w-full px-4 py-2.5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2',
                      )}
                    >
                      {conteudo}
                    </button>
                  ) : (
                    <div className={cn(GRADE_FUNIL, 'px-4 py-2.5')}>{conteudo}</div>
                  )}
                  {estaAberta && l.filtro && (
                    <ExamesDaEtapa rodadaId={rodada.id} linha={l} onPorQue={onPorQue} />
                  )}
                </li>
              </Fragment>
            );
          })}
        </ul>
      </Caixa>
      <p className="text-subtle-foreground text-xs">
        Clique numa etapa para ver os exames que ela tirou (10 por página).
      </p>
    </section>
  );
}

function ExamesDaEtapa({
  rodadaId,
  linha,
  onPorQue,
}: {
  rodadaId: string;
  linha: LinhaFunil;
  onPorQue: (exame: OpcaoBusca) => void;
}) {
  const [pagina, setPagina] = useState(1);
  const filtro = linha.filtro as { status: StatusDesignacaoKey; motivo: string | null };
  const consulta = useQuery({
    ...rodadasControllerDesignacoesQueryOptions({
      path: { id: rodadaId },
      query: {
        status: [filtro.status],
        ...(filtro.motivo ? { motivo: [filtro.motivo] } : {}),
        pagina,
        porPagina: 10,
      },
    }),
    placeholderData: keepPreviousData,
  });
  const lista = consulta.data;
  return (
    <div className="bg-background border-t">
      {!lista ? (
        <Skeleton className="m-4 h-10" />
      ) : (
        <ul className={consulta.isPlaceholderData ? 'opacity-60' : undefined}>
          {lista.itens.map((d) => (
            <li
              key={d.id}
              className="flex items-start justify-between gap-3 border-b px-4 py-2 pl-8 last:border-b-0"
            >
              <span className="flex min-w-0 flex-col">
                <span>
                  {d.estudo}{' '}
                  <span className="text-subtle-foreground font-mono text-xs">
                    {d.idExameMobilemed}
                  </span>
                </span>
                <span className="text-muted-foreground text-xs">
                  {d.cliente?.nome ?? d.unidade}
                  {d.detalhe && `. ${d.detalhe}`}
                </span>
              </span>
              <Button
                type="button"
                onClick={() =>
                  onPorQue({ valor: d.id, rotulo: d.estudo, detalhe: d.idExameMobilemed })
                }
                className={buttonClassName({
                  variant: 'ghost',
                  className: 'h-8 flex-none px-2 text-[13px]',
                })}
              >
                Por quê?
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Paginacao pagina={pagina} porPagina={10} total={lista?.total ?? 0} onIrPara={setPagina} />
    </div>
  );
}

function FunilMedicos({ resumo }: { resumo: ResumoRodadaDto }) {
  const f = resumo.funilMedicos;
  if (!f) return null;
  const linhas = funilDosMedicos(f);
  return (
    <section aria-labelledby="titulo-funil-medicos" className="flex flex-col gap-3">
      <TituloSecao titulo="Funil dos médicos" id="titulo-funil-medicos" />
      <Caixa>
        <table className="w-full tabular-nums">
          <thead>
            <tr className="text-subtle-foreground border-b text-xs">
              <th scope="col" className="px-4 py-2 text-left font-medium">
                Etapa
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                Saíram
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                Seguiram
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.rotulo} className={cn('border-b last:border-b-0', l.marco && 'bg-muted')}>
                <th
                  scope="row"
                  className={cn('px-4 py-2.5 text-left font-normal', l.marco && 'font-semibold')}
                >
                  {l.rotulo}
                </th>
                <td className="px-4 text-right">{l.saem > 0 ? `−${num(l.saem)}` : ''}</td>
                <td className="px-4 text-right">{num(l.restam)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Caixa>
      {f.tirados > 0 && (
        <p className="text-subtle-foreground text-xs">
          {num(f.tirados)} médico(s) tirado(s) da rodada ao pedir.
        </p>
      )}
    </section>
  );
}

function PorQue({
  rodada,
  resumo,
  exame,
  onExame,
  buscarMedicos,
}: {
  rodada: RodadaDto;
  resumo: ResumoRodadaDto;
  exame: OpcaoBusca | null;
  onExame: (e: OpcaoBusca | null) => void;
  buscarMedicos: (termo: string) => Promise<OpcaoBusca[]>;
}) {
  const [medico, setMedico] = useState<OpcaoBusca | null>(null);
  const explicacao = useQuery({
    ...rodadasControllerExplicacaoQueryOptions({
      path: { id: rodada.id, designacaoId: exame?.valor ?? '' },
      query: { medicoId: medico?.valor ?? '' },
    }),
    enabled: Boolean(exame && medico),
  });
  const buscarExames = async (termo: string) => {
    const { itens } = await rodadasControllerDesignacoes({
      path: { id: rodada.id },
      query: { busca: termo || undefined, pagina: 1, porPagina: 20 },
    }).unwrap();
    return itens.map((d) => ({ valor: d.id, rotulo: d.estudo, detalhe: d.idExameMobilemed }));
  };
  const buscarMedicosDaRodada = async (termo: string) => {
    const t = semAcento(termo.trim());
    const daRodada = resumo.medicos
      .filter((m) => semAcento(m.nome).includes(t))
      .map((m) => ({ valor: m.medicoId, rotulo: m.nome, detalhe: juntarNomes(m.turnos) || null }));
    if (t.length < 2) return daRodada.slice(0, 20);
    const outros = (await buscarMedicos(termo)).filter(
      (o) => !daRodada.some((d) => d.valor === o.valor),
    );
    return [...daRodada, ...outros].slice(0, 20);
  };
  const e = explicacao.data;
  return (
    <section aria-labelledby="titulo-porque" className="flex flex-col gap-3">
      <TituloSecao titulo="Por que este médico não pegou este exame?" id="titulo-porque" />
      <div className="bg-card flex flex-col gap-4 rounded-lg border p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label htmlFor="pq-exame" className="font-medium">
              Exame
            </label>
            <BuscaSelecao
              // O "Por quê?" do funil troca o exame de fora: o campo remonta com ele.
              key={exame?.valor ?? 'vazio'}
              id="pq-exame"
              chave={`exames-da-rodada-${rodada.id}`}
              buscar={buscarExames}
              valor={exame}
              onMudar={onExame}
              placeholder="Buscar pelo estudo ou cliente"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="pq-medico" className="font-medium">
              Médico
            </label>
            <BuscaSelecao
              id="pq-medico"
              chave={`medicos-da-rodada-${rodada.id}`}
              buscar={buscarMedicosDaRodada}
              valor={medico}
              onMudar={setMedico}
              placeholder="Buscar médico"
            />
          </div>
        </div>
        {!exame || !medico ? (
          <p className="text-muted-foreground text-[13px]">
            Escolha o exame e o médico. A resposta vem do registro da rodada: mostra a situação no
            momento em que a fila foi lida.
          </p>
        ) : explicacao.isError ? (
          <Alerta tom="erro">
            Não foi possível ler o registro da rodada agora. Tente de novo.
          </Alerta>
        ) : !e ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <div aria-live="polite" className="flex flex-col gap-3">
            <strong className="font-semibold">{e.titulo}</strong>
            <ul className="flex flex-col gap-2">
              {e.checks.map((c) => (
                <li key={c.titulo} className="flex items-start gap-2">
                  {c.ok ? (
                    <CheckCircle
                      size={18}
                      aria-label="Passou"
                      className="text-success mt-px flex-none"
                    />
                  ) : (
                    <XCircle
                      size={18}
                      aria-label="Barrou"
                      className="text-destructive mt-px flex-none"
                    />
                  )}
                  <span className="flex flex-col">
                    <span className={c.ok ? undefined : 'font-semibold'}>{c.titulo}</span>
                    {c.detalhe && (
                      <span className="text-muted-foreground text-xs">{c.detalhe}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function Diario({ rodada }: { rodada: RodadaDto }) {
  const eventos = [...rodada.eventos].reverse();
  const pagina = usePaginaLocal(eventos, 10);
  return (
    <section aria-labelledby="titulo-diario" className="flex flex-col gap-3">
      <TituloSecao titulo="Diário da rodada" id="titulo-diario" />
      <Caixa>
        <ul>
          {pagina.itensDaPagina.map((ev) => (
            <li
              key={`${ev.em}-${ev.texto}`}
              className="flex gap-4 border-b px-4 py-2.5 last:border-b-0"
            >
              <span className="text-subtle-foreground w-24 flex-none text-[13px] tabular-nums">
                {dataHoraCurta(ev.em)}
              </span>
              <span>{ev.texto}</span>
            </li>
          ))}
        </ul>
        <Paginacao
          pagina={pagina.pagina}
          porPagina={10}
          total={pagina.total}
          onIrPara={pagina.irPara}
        />
      </Caixa>
    </section>
  );
}
