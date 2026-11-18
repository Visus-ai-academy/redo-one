import { Button } from '@base-ui/react/button';
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  Clock,
  Pause,
  Play,
  Robot,
} from '@phosphor-icons/react';
import {
  keepPreviousData,
  type UseQueryResult,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import { rodadasControllerFilaQueryOptions } from '../../gen/hooks/useRodadasControllerFila';
import { rodadasControllerHistoricoQueryOptions } from '../../gen/hooks/useRodadasControllerHistorico';
import { rodadasControllerResumoQueryOptions } from '../../gen/hooks/useRodadasControllerResumo';
import { rodadasControllerSituacaoQueryOptions } from '../../gen/hooks/useRodadasControllerSituacao';
import { rodadasControllerVivaQueryOptions } from '../../gen/hooks/useRodadasControllerViva';
import type { DesignacaoDto } from '../../gen/types/DesignacaoDto';
import type { FilaDoMomentoDto } from '../../gen/types/FilaDoMomentoDto';
import type { RodadaDto } from '../../gen/types/RodadaDto';
import type { StatusRodadaKey } from '../../gen/types/StatusRodada';
import { horaDeBrasilia } from '../../lib/acesso';
import { cn } from '../../lib/cn';
import { dataHoraCurta } from '../../lib/datas';
import { pode } from '../../lib/permissoes';
import { intervaloDaRodada, num, type Periodo } from '../../lib/rodada';
import { Abas } from '../abas/Abas';
import { Alerta } from '../alerta/Alerta';
import { buttonClassName } from '../button/button-class';
import { ConfirmarAcao } from '../confirmacao/ConfirmarAcao';
import { Etiqueta } from '../etiqueta/Etiqueta';
import { RESERVA_DO_PAINEL } from '../painel/reserva';
import { Skeleton } from '../skeleton/Skeleton';
import { useAvisos } from '../toast/use-avisos';
import { Execucao, LendoFila, Parcial } from './Andamento';
import { type AcoesRodada, invalidarRodadas, useAcoesRodada } from './acoes';
import { buscarClientes, buscarMedicos } from './buscas';
import { CartaoRodada } from './CartaoRodada';
import { FilaDoMomento } from './FilaDoMomento';
import { Historico } from './Historico';
import { PainelDistribuirAgora } from './PainelDistribuirAgora';
import { PainelMedico } from './PainelMedico';
import { Conferencia, type VisaoProposta } from './Proposta';

type Sessao = { acessoTotal: boolean; permissoes: readonly string[] };

export type BuscaDistribuicao = {
  aba?: 'historico';
  distribuir?: 1;
  medico?: string;
  visao?: 'fora';
  motivo?: string;
  status?: StatusRodadaKey;
  periodo?: Periodo;
  pagina?: number;
};

/** Sem rodada, a fila do momento atualiza a cada minuto (regra dos painéis: 1–5 min). */
const FILA_A_CADA_MS = 60_000;
const DIA = 86_400_000;

/** O relógio da tela, para "expira em 38 min" andar sozinho. */
function useAgora(intervaloMs: number) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), intervaloMs);
    return () => clearInterval(id);
  }, [intervaloMs]);
  return agora;
}

/**
 * Operação › Distribuição: a rodada do robô. Sem rodada, a fila do momento e o "Distribuir
 * agora"; com rodada, a etapa dela (lendo, proposta para conferir e aprovar, executando,
 * parcial); e o histórico numa aba. Consulta a situação a cada 4 s só nas etapas ativas.
 */
export function TelaDistribuicao({
  sessao,
  busca,
  onBusca,
  onAbrirRodada,
}: {
  sessao: Sessao;
  busca: BuscaDistribuicao;
  onBusca: (mudar: (atual: BuscaDistribuicao) => BuscaDistribuicao, replace?: boolean) => void;
  onAbrirRodada: (id: string) => void;
}) {
  const podeIniciar = pode(sessao, 'distribuicao.rodada.iniciar');
  const queryClient = useQueryClient();
  const acoes = useAcoesRodada();
  const { sucesso } = useAvisos();

  const viva = useQuery({
    ...rodadasControllerVivaQueryOptions(),
    refetchInterval: (q) => (q.state.data?.rodada ? false : FILA_A_CADA_MS),
    refetchIntervalInBackground: false,
  });
  const rodada = viva.data?.rodada ?? null;

  // Polling leve da situação; quando ela muda, refaz a rodada e o resumo.
  const situacao = useQuery({
    ...rodadasControllerSituacaoQueryOptions({ path: { id: rodada?.id ?? '' } }),
    enabled: Boolean(rodada),
    refetchInterval: (q) => intervaloDaRodada(q.state.data?.status ?? rodada?.status),
    refetchIntervalInBackground: false,
  });
  const marca = situacao.data
    ? `${situacao.data.status}|${JSON.stringify(situacao.data.contagens)}`
    : null;
  const marcaAnterior = useRef<string | null>(null);
  useEffect(() => {
    if (!marca) return;
    const antes = marcaAnterior.current;
    marcaAnterior.current = marca;
    if (antes !== null && antes !== marca) void invalidarRodadas(queryClient);
  }, [marca, queryClient]);

  const fila = useQuery({
    ...rodadasControllerFilaQueryOptions(),
    refetchInterval: rodada ? false : FILA_A_CADA_MS,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
  });
  const robo = fila.data?.roboAtivo;

  const historicoUltima = useQuery({
    ...rodadasControllerHistoricoQueryOptions({ query: { pagina: 1, porPagina: 1 } }),
    enabled: !rodada && viva.isSuccess,
  });

  const abrirMedico = (id: string) => onBusca((a) => ({ ...a, medico: id }));
  const fecharPainel = () => onBusca((a) => ({ ...a, medico: undefined, distribuir: undefined }));

  const cabecalho = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <h1 className="text-[22px] leading-snug font-semibold">Distribuição</h1>
        {robo !== undefined && (
          <Etiqueta tom={robo ? 'sucesso' : 'inativo'} icone={Robot}>
            {robo ? 'Robô ligado' : 'Robô desligado'}
          </Etiqueta>
        )}
      </div>
      {!rodada && podeIniciar && viva.isSuccess && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-subtle-foreground text-[13px]">
            {robo === false
              ? 'Ligue o robô para distribuir'
              : fila.data?.total === 0
                ? 'Nada para distribuir'
                : 'Nenhuma rodada em andamento'}
          </span>
          <Button
            type="button"
            disabled={!fila.data || robo === false || fila.data.total === 0}
            focusableWhenDisabled
            aria-expanded={Boolean(busca.distribuir)}
            onClick={() => onBusca((a) => ({ ...a, aba: undefined, distribuir: 1 }))}
            className={buttonClassName()}
          >
            <Play size={16} aria-hidden />
            Distribuir agora
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div className={cn('flex flex-col gap-6', RESERVA_DO_PAINEL)}>
      {cabecalho}
      <Abas
        aria-label="Distribuição"
        valor={busca.aba ?? 'rodada'}
        onMudar={(v) => onBusca(() => ({ aba: v === 'historico' ? 'historico' : undefined }))}
        abas={[
          { valor: 'rodada', rotulo: 'Rodada' },
          { valor: 'historico', rotulo: 'Histórico' },
        ]}
      >
        {busca.aba === 'historico' ? (
          <AbaHistorico busca={busca} onBusca={onBusca} onAbrirRodada={onAbrirRodada} />
        ) : viva.isError && !viva.data ? (
          <Alerta tom="erro">
            Não foi possível carregar a rodada.{' '}
            <button type="button" className="underline" onClick={() => void viva.refetch()}>
              Tentar de novo
            </button>
          </Alerta>
        ) : !viva.data ? (
          <Carregando />
        ) : rodada ? (
          <RodadaViva
            rodada={rodada}
            sessao={sessao}
            acoes={acoes}
            busca={busca}
            onBusca={onBusca}
            abrirMedico={abrirMedico}
            fecharPainel={fecharPainel}
            nomesExtras={nomesDaFila(fila.data)}
            onAbrirRodada={onAbrirRodada}
          />
        ) : (
          <SemRodada
            sessao={sessao}
            fila={fila}
            ultima={historicoUltima.data?.itens[0]}
            acoes={acoes}
            onAbrirRodada={onAbrirRodada}
          />
        )}
      </Abas>
      {busca.distribuir && podeIniciar && !rodada && fila.data && (
        <PainelDistribuirAgora
          fila={fila.data}
          onFechar={fecharPainel}
          buscarClientes={buscarClientes}
          buscarMedicos={buscarMedicos}
          onDistribuir={async (recortes) => {
            await acoes.criarOuFalhar(recortes);
            sucesso('Rodada pedida. O robô está lendo a fila.');
            onBusca((a) => ({ ...a, distribuir: undefined }), true);
          }}
        />
      )}
    </div>
  );
}

function nomesDaFila(
  fila:
    | {
        turnos: { turnoId: string; nome: string }[];
        porFrente: { frenteId: string | null; nome: string }[];
        prioridades: { prioridadeOperacaoId: string | null; nome: string }[];
        medicosEmTurno: { medicoId: string; nome: string }[];
      }
    | undefined,
) {
  const nomes = new Map<string, string>();
  if (!fila) return nomes;
  for (const t of fila.turnos) nomes.set(t.turnoId, t.nome);
  for (const f of fila.porFrente) if (f.frenteId) nomes.set(f.frenteId, f.nome);
  for (const p of fila.prioridades)
    if (p.prioridadeOperacaoId) nomes.set(p.prioridadeOperacaoId, p.nome);
  for (const m of fila.medicosEmTurno) nomes.set(m.medicoId, m.nome);
  return nomes;
}

function Carregando() {
  return (
    <div aria-busy className="flex flex-col gap-4">
      <span className="sr-only">Carregando a distribuição</span>
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-24 w-full" />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    </div>
  );
}

function SemRodada({
  sessao,
  fila,
  ultima,
  acoes,
  onAbrirRodada,
}: {
  sessao: Sessao;
  fila: UseQueryResult<FilaDoMomentoDto>;
  ultima:
    | {
        id: string;
        status: StatusRodadaKey;
        criadoEm: string;
        atualizadoEm: string;
        executadas: number;
        recortes: RodadaDto['recortes'];
      }
    | undefined;
  acoes: AcoesRodada;
  onAbrirRodada: (id: string) => void;
}) {
  const { sucesso } = useAvisos();
  const dados = fila.data;
  const recente = ultima && Date.now() - new Date(ultima.atualizadoEm).getTime() < DIA;
  const problema = recente && (ultima.status === 'expirada' || ultima.status === 'falhou');
  if (!dados) {
    return fila.isError ? (
      <Alerta tom="erro">
        Não foi possível ler a fila agora.{' '}
        <button type="button" className="underline" onClick={() => void fila.refetch()}>
          Tentar de novo
        </button>
      </Alerta>
    ) : (
      <Carregando />
    );
  }
  const emTurno = new Set(dados.medicosEmTurno.map((m) => m.medicoId)).size;
  const proximo = dados.turnos.find((t) => !t.emAndamento && t.medicos > 0);
  return (
    <div className="flex flex-col gap-6">
      {(dados.roboAtivo === false || emTurno === 0 || problema || acoes.erro) && (
        <div className="flex flex-col gap-2">
          {acoes.erro && <Alerta tom="erro">{acoes.erro}</Alerta>}
          {problema && ultima && (
            <Alerta tom={ultima.status === 'falhou' ? 'erro' : 'atencao'}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  A rodada de {dataHoraCurta(ultima.criadoEm).toLowerCase()}{' '}
                  {ultima.status === 'falhou' ? 'falhou' : 'expirou sem aprovação'}
                  {ultima.executadas ? `, com ${num(ultima.executadas)} exame(s) atribuído(s)` : ''}
                  . Ela fica no histórico como estava.
                </span>
                <span className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={() => onAbrirRodada(ultima.id)}
                    className={buttonClassName({ variant: 'ghost', className: 'h-8 px-3' })}
                  >
                    Ver o detalhe
                  </Button>
                  {pode(sessao, 'distribuicao.rodada.iniciar') && dados.roboAtivo && (
                    <Button
                      type="button"
                      disabled={acoes.ocupada === 'criar'}
                      onClick={async () => {
                        if (await acoes.criar(ultima.recortes))
                          sucesso('Rodada pedida com os mesmos recortes.');
                      }}
                      className={buttonClassName({ variant: 'secondary', className: 'h-8 px-3' })}
                    >
                      <ArrowClockwise size={16} aria-hidden />
                      Pedir de novo com os mesmos recortes
                    </Button>
                  )}
                </span>
              </div>
            </Alerta>
          )}
          {dados.roboAtivo === false && (
            <Alerta tom="atencao">
              <strong className="block font-semibold">O robô está desligado</strong>
              Enquanto estiver desligado, nenhuma rodada começa e os exames ficam para a
              distribuição à mão.{' '}
              {pode(sessao, 'distribuicao-config.ver') && (
                <Link to="/configuracoes/distribuicao" className="font-medium underline">
                  Abrir Configurações › Distribuição
                </Link>
              )}
            </Alerta>
          )}
          {emTurno === 0 && (
            <Alerta tom="info" role="note">
              <strong className="block font-semibold">
                Nenhum médico habilitado está em turno agora
              </strong>
              {proximo
                ? `O próximo turno é ${proximo.nome}, às ${horaDeBrasilia(proximo.inicio)}, com ${proximo.medicos} médico(s) no robô. Até lá, uma rodada não teria para quem distribuir.`
                : 'Nenhum outro turno de hoje tem médico habilitado no robô.'}
            </Alerta>
          )}
        </div>
      )}
      <FilaDoMomento
        fila={dados}
        intervalo="1 min"
        erro={fila.isError}
        onTentarDeNovo={() => void fila.refetch()}
        ultimaRodada={
          ultima && ultima.status === 'concluida' ? (
            <>
              Última rodada: {dataHoraCurta(ultima.criadoEm).toLowerCase()},{' '}
              {num(ultima.executadas)} exame(s) atribuído(s).{' '}
              <button
                type="button"
                className="text-primary underline"
                onClick={() => onAbrirRodada(ultima.id)}
              >
                Ver no histórico
              </button>
            </>
          ) : undefined
        }
        irParaEscala={
          pode(sessao, 'escala.ver') ? (
            <Link to="/escala" className={buttonClassName({ variant: 'secondary' })}>
              Abrir a escala de hoje
            </Link>
          ) : undefined
        }
      />
    </div>
  );
}

function RodadaViva({
  rodada,
  sessao,
  acoes,
  busca,
  onBusca,
  abrirMedico,
  fecharPainel,
  nomesExtras,
  onAbrirRodada,
}: {
  rodada: RodadaDto;
  sessao: Sessao;
  acoes: AcoesRodada;
  busca: BuscaDistribuicao;
  onBusca: (mudar: (atual: BuscaDistribuicao) => BuscaDistribuicao, replace?: boolean) => void;
  abrirMedico: (id: string) => void;
  fecharPainel: () => void;
  nomesExtras: Map<string, string>;
  onAbrirRodada: (id: string) => void;
}) {
  const { sucesso } = useAvisos();
  const agora = useAgora(15_000);
  const podeAprovar = pode(sessao, 'distribuicao.rodada.aprovar');
  const podeAjustar = pode(sessao, 'distribuicao.rodada.ajustar');
  const podeControlar = pode(sessao, 'distribuicao.rodada.controlar');
  const verPaciente = pode(sessao, 'distribuicao.paciente.ver');
  const temProposta =
    rodada.lidaEm !== null && rodada.status !== 'solicitada' && rodada.status !== 'lendo';
  const resumo = useQuery({
    ...rodadasControllerResumoQueryOptions({ path: { id: rodada.id } }),
    enabled: temProposta,
    placeholderData: keepPreviousData,
  });
  const nomes = useMemo(() => {
    const m = new Map(nomesExtras);
    for (const x of resumo.data?.medicos ?? []) m.set(x.medicoId, x.nome);
    return m;
  }, [nomesExtras, resumo.data]);
  const ocupado = acoes.ocupada !== null;
  const c = rodada.contagens;

  const cancelar = podeControlar && (
    <ConfirmarAcao
      acao="Cancelar rodada"
      titulo="Cancelar a rodada?"
      consequencia={
        rodada.status === 'aguardando_aprovacao'
          ? `A proposta de ${num(c.prevista)} exame(s) é descartada${resumo.data?.ajustes.tirados || resumo.data?.ajustes.movidos ? ', com os ajustes da conferência' : ''}. Nenhum exame é atribuído; a fila continua como está.`
          : `O que falta atribuir (${num(c.prevista)} exame(s)) fica de fora; o que já foi atribuído continua com os médicos.`
      }
      desabilitado={ocupado}
      onConfirmar={async () => {
        if (await acoes.cancelar(rodada.id)) sucesso('Rodada cancelada.');
      }}
    />
  );

  let acoesDoCartao: ReactNode = null;
  let corpo: ReactNode = null;
  const resumoOuCarregando = (conteudo: (r: NonNullable<typeof resumo.data>) => ReactNode) =>
    resumo.data ? (
      conteudo(resumo.data)
    ) : resumo.isError ? (
      <Alerta tom="erro">
        Não foi possível carregar a proposta.{' '}
        <button type="button" className="underline" onClick={() => void resumo.refetch()}>
          Tentar de novo
        </button>
      </Alerta>
    ) : (
      <Carregando />
    );

  switch (rodada.status) {
    case 'solicitada':
    case 'lendo':
      acoesDoCartao = cancelar;
      corpo = <LendoFila rodada={rodada} />;
      break;
    case 'aguardando_aprovacao': {
      const expira = rodada.expiraEm ? new Date(rodada.expiraEm).getTime() : null;
      const minutos = expira === null ? null : Math.max(0, Math.ceil((expira - agora) / 60_000));
      const vencida = expira !== null && expira <= agora;
      acoesDoCartao = (
        <>
          {cancelar}
          {podeControlar && (
            <Button
              type="button"
              disabled={ocupado}
              onClick={async () => {
                if (await acoes.reler(rodada.id)) sucesso('A fila será lida de novo, do zero.');
              }}
              className={buttonClassName({ variant: 'secondary' })}
            >
              <ArrowCounterClockwise size={16} aria-hidden />
              Reler a fila
            </Button>
          )}
          {podeAprovar && (
            <Button
              type="button"
              disabled={ocupado || vencida || c.prevista === 0}
              focusableWhenDisabled
              title={rodada.expiraEm ? `Vale até ${horaDeBrasilia(rodada.expiraEm)}` : undefined}
              onClick={async () => {
                if (await acoes.aprovar(rodada.id))
                  sucesso(`Aprovada: ${num(c.prevista)} exame(s) a atribuir.`);
              }}
              className={buttonClassName({ className: 'h-auto min-h-9 py-1' })}
            >
              <Play size={16} aria-hidden />
              <span className="flex flex-col items-start leading-tight">
                <span>{`Aprovar e distribuir ${num(c.prevista)} exames`}</span>
                {minutos !== null && (
                  <span className="text-xs font-normal tabular-nums opacity-80">
                    {vencida
                      ? 'Expirou'
                      : `Expira em ${minutos} min, às ${horaDeBrasilia(rodada.expiraEm as string)}`}
                  </span>
                )}
              </span>
            </Button>
          )}
          {!podeAprovar && minutos !== null && (
            <span className="text-muted-foreground flex items-center gap-1 text-[13px] tabular-nums">
              <Clock size={14} aria-hidden />
              Expira em {minutos} min
            </span>
          )}
        </>
      );
      const ajustes = podeAjustar
        ? {
            tirar: async (d: DesignacaoDto) => {
              if (await acoes.ajustar(rodada.id, { remover: [d.id] }))
                sucesso('Exame tirado da proposta.', {
                  acao: {
                    rotulo: 'Desfazer',
                    onClick: async () => {
                      if (await acoes.ajustar(rodada.id, { restaurar: [d.id] }))
                        sucesso('Exame devolvido à proposta.');
                    },
                  },
                });
            },
            devolver: async (d: DesignacaoDto) => {
              if (await acoes.ajustar(rodada.id, { restaurar: [d.id] }))
                sucesso('Exame devolvido à proposta.');
            },
            mover: async (d: DesignacaoDto, medicoId: string, levarPacote: boolean) => {
              const nome = nomes.get(medicoId) ?? 'o médico';
              if (
                await acoes.ajustar(rodada.id, {
                  mover: [{ designacaoId: d.id, medicoId, levarPacote }],
                })
              )
                sucesso(
                  d.status === 'recusada'
                    ? `Exame mandado na mão para ${nome}.`
                    : levarPacote
                      ? `Pacote movido para ${nome}.`
                      : `Exame movido para ${nome}.`,
                );
            },
          }
        : undefined;
      corpo = resumoOuCarregando((r) => {
        const medicoAberto = busca.medico
          ? r.medicos.find((m) => m.medicoId === busca.medico)
          : undefined;
        return (
          <>
            {rodada.avisos.length > 0 && (
              <div className="flex flex-col gap-2">
                {rodada.avisos.map((a) => (
                  <Alerta key={a} tom="info" role="note">
                    {a}
                  </Alerta>
                ))}
              </div>
            )}
            <Conferencia
              rodada={rodada}
              resumo={r}
              visao={(busca.visao ?? 'medicos') as VisaoProposta}
              onVisao={(v) =>
                onBusca((a) => ({
                  ...a,
                  visao: v === 'fora' ? 'fora' : undefined,
                  motivo: undefined,
                }))
              }
              motivo={busca.motivo}
              onMotivo={(m) => onBusca((a) => ({ ...a, motivo: m }))}
              medicoAberto={busca.medico}
              onAbrirMedico={abrirMedico}
              buscarMedicos={buscarMedicos}
              ajustes={ajustes}
              ocupado={ocupado}
            />
            {medicoAberto && (
              <PainelMedico
                key={medicoAberto.medicoId}
                rodadaId={rodada.id}
                medico={medicoAberto}
                medicos={r.medicos}
                verPaciente={verPaciente}
                buscarMedicos={buscarMedicos}
                acoes={ajustes}
                ocupado={ocupado}
                onFechar={fecharPainel}
              />
            )}
          </>
        );
      });
      break;
    }
    case 'aprovada':
    case 'executando':
      acoesDoCartao = podeControlar && (
        <>
          {cancelar}
          <Button
            type="button"
            disabled={ocupado}
            onClick={async () => {
              if (await acoes.pausar(rodada.id)) sucesso('Distribuição pausada.');
            }}
            className={buttonClassName({ variant: 'secondary' })}
          >
            <Pause size={16} aria-hidden />
            Pausar
          </Button>
        </>
      );
      corpo = resumoOuCarregando((r) => <Execucao rodada={rodada} resumo={r} />);
      break;
    case 'pausada':
      acoesDoCartao = podeControlar && (
        <>
          {cancelar}
          <EncerrarRodada rodada={rodada} acoes={acoes} />
          <Button
            type="button"
            disabled={ocupado}
            onClick={async () => {
              if (await acoes.retomar(rodada.id)) sucesso('Distribuição retomada.');
            }}
            className={buttonClassName()}
          >
            <Play size={16} aria-hidden />
            Retomar
          </Button>
        </>
      );
      corpo = resumoOuCarregando((r) => <Execucao rodada={rodada} resumo={r} />);
      break;
    case 'parcial': {
      const restam = c.prevista + c.retentaveis;
      acoesDoCartao = podeControlar && (
        <>
          <EncerrarRodada rodada={rodada} acoes={acoes} rotulo="Encerrar sem retomar" />
          <Button
            type="button"
            disabled={ocupado || restam === 0}
            onClick={async () => {
              if (await acoes.retomar(rodada.id)) sucesso('Retomando o que faltou.');
            }}
            className={buttonClassName()}
          >
            <ArrowClockwise size={16} aria-hidden />
            Retomar o que faltou ({num(restam)})
          </Button>
        </>
      );
      corpo = resumoOuCarregando((r) => <Parcial rodada={rodada} resumo={r} />);
      break;
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <CartaoRodada
        rodada={rodada}
        nomes={nomes}
        acoes={acoesDoCartao}
        mostrarRecortes={['solicitada', 'lendo', 'aguardando_aprovacao'].includes(rodada.status)}
      >
        {rodada.status === 'aguardando_aprovacao' && !podeAprovar && !podeAjustar && (
          <Alerta tom="info" role="note">
            Você acompanha esta rodada, mas não aprova nem muda a proposta. Aprovar exige a
            permissão de aprovar rodadas; tirar e mover exames, a de ajustar a proposta.
          </Alerta>
        )}
        {rodada.status === 'parcial' && (
          <p className="text-muted-foreground text-[13px]">
            Os que falharam esbarraram na MobileMed e uma nova tentativa pode resolver: retomar
            confere a situação de cada um antes de atribuir. Os pulados não voltam, porque o exame
            já tinha médico ou saiu da fila.
          </p>
        )}
        {rodada.erro && <Alerta tom="erro">{rodada.erro}</Alerta>}
        {acoes.erro && <Alerta tom="erro">{acoes.erro}</Alerta>}
        <button
          type="button"
          onClick={() => onAbrirRodada(rodada.id)}
          className="text-primary self-start text-[13px] underline-offset-2 hover:underline"
        >
          Ver o detalhe da rodada
        </button>
      </CartaoRodada>
      {corpo}
    </div>
  );
}

function EncerrarRodada({
  rodada,
  acoes,
  rotulo = 'Encerrar',
}: {
  rodada: RodadaDto;
  acoes: AcoesRodada;
  rotulo?: string;
}) {
  const { sucesso } = useAvisos();
  const restam = rodada.contagens.prevista + rodada.contagens.retentaveis;
  return (
    <ConfirmarAcao
      acao={rotulo}
      titulo="Encerrar a rodada?"
      consequencia={`O que já foi atribuído fica com os médicos; ${num(restam)} exame(s) ficam para a próxima rodada.`}
      desabilitado={acoes.ocupada !== null}
      onConfirmar={async () => {
        if (await acoes.encerrar(rodada.id)) sucesso('Rodada encerrada.');
      }}
    />
  );
}

function AbaHistorico({
  busca,
  onBusca,
  onAbrirRodada,
}: {
  busca: BuscaDistribuicao;
  onBusca: (mudar: (atual: BuscaDistribuicao) => BuscaDistribuicao, replace?: boolean) => void;
  onAbrirRodada: (id: string) => void;
}) {
  const periodo = busca.periodo ?? '7';
  // O início do período muda só por dia (a chave da consulta fica estável no dia).
  const desde =
    periodo === 'todas'
      ? undefined
      : new Date(Math.floor(Date.now() / DIA) * DIA - Number(periodo) * DIA).toISOString();
  const consulta = useQuery({
    ...rodadasControllerHistoricoQueryOptions({
      query: {
        pagina: busca.pagina ?? 1,
        porPagina: 10,
        ...(busca.status ? { status: [busca.status] } : {}),
        ...(desde ? { desde } : {}),
      },
    }),
    placeholderData: keepPreviousData,
  });
  return (
    <Historico
      pagina={consulta.data}
      carregando={consulta.isPlaceholderData}
      erro={consulta.isError}
      onTentarDeNovo={() => void consulta.refetch()}
      status={busca.status}
      periodo={periodo}
      onFiltrar={(f) =>
        onBusca((a) => ({
          ...a,
          status: f.status,
          periodo: f.periodo === '7' ? undefined : f.periodo,
          pagina: undefined,
        }))
      }
      onIrPara={(pagina) => onBusca((a) => ({ ...a, pagina }))}
      onAbrir={onAbrirRodada}
    />
  );
}
