import { type QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
import { ajustesDiaControllerSalvar } from '../../gen/clients/ajustesDiaControllerSalvar';
import { alocacoesControllerAtualizar } from '../../gen/clients/alocacoesControllerAtualizar';
import { alocacoesControllerCriar } from '../../gen/clients/alocacoesControllerCriar';
import { alocacoesControllerCriarCobertura } from '../../gen/clients/alocacoesControllerCriarCobertura';
import { alocacoesControllerDefinirAjuste } from '../../gen/clients/alocacoesControllerDefinirAjuste';
import { alocacoesControllerRemover } from '../../gen/clients/alocacoesControllerRemover';
import { coberturasControllerAtualizar } from '../../gen/clients/coberturasControllerAtualizar';
import { escalaFixaControllerDefinir } from '../../gen/clients/escalaFixaControllerDefinir';
import { escalaFixaControllerObter } from '../../gen/clients/escalaFixaControllerObter';
import { sugestaoAlocacaoControllerObter } from '../../gen/clients/sugestaoAlocacaoControllerObter';
import { alocacoesControllerObterQueryOptions } from '../../gen/hooks/useAlocacoesControllerObter';
import { classificacoesEscalaControllerListarQueryOptions } from '../../gen/hooks/useClassificacoesEscalaControllerListar';
import type { AvisoConflitoDto } from '../../gen/types/AvisoConflitoDto';
import type { ConflitoEscalaDto } from '../../gen/types/ConflitoEscalaDto';
import type { FrenteItemDto } from '../../gen/types/FrenteItemDto';
import type { OcorrenciaDto } from '../../gen/types/OcorrenciaDto';
import type { TurnoItemDto } from '../../gen/types/TurnoItemDto';
import type { PodeNaTela } from '../../lib/permissoes';
import type { OpcaoBusca } from '../busca/BuscaSelecao';
import { buscarClientes } from '../distribuicao/buscas';
import { PainelCarregando } from '../painel/PainelCarregando';
import { useAvisos } from '../toast/use-avisos';
import type { InicialAlocacao } from './alocacao-form';
import { buscarMedicosAtivos, buscarMedicosDaEscala } from './buscar-medicos';
import { resumoDoResultado } from './escala-fixa';
import { PainelAlocacao } from './PainelAlocacao';
import { PainelCobertura } from './PainelCobertura';
import { PainelEscalaFixa } from './PainelEscalaFixa';
import { PainelPlantao } from './PainelPlantao';

/** O que está aberto ao lado da escala. */
export type PainelAberto =
  | { tipo: 'plantao'; ocorrencia: OcorrenciaDto }
  | { tipo: 'alocar'; inicial: InicialAlocacao }
  | { tipo: 'editar'; ocorrencia: OcorrenciaDto }
  | { tipo: 'cobertura'; ocorrencia: OcorrenciaDto }
  | { tipo: 'escala-fixa'; medico: OpcaoBusca };

type PaineisEscalaProps = {
  painel: PainelAberto;
  hoje: string;
  /** Turnos e frentes ativos, já no recorte de quem edita. */
  turnos: TurnoItemDto[];
  frentes: FrenteItemDto[];
  conflitos: readonly ConflitoEscalaDto[];
  permissoes: PodeNaTela;
  /** `ausencias.criar`: o atalho "Definir ausência" do plantão. */
  podeDefinirAusencia: boolean;
  onAbrir: (painel: PainelAberto | null) => void;
  /** Conflitos que a escrita criou (aviso que não bloqueia). */
  onAvisos: (avisos: AvisoConflitoDto[]) => void;
};

/** Depois de qualquer escrita na escala, refaz as ocorrências e as alocações abertas. */
function invalidarEscala(queryClient: QueryClient) {
  return queryClient.invalidateQueries({
    predicate: (consulta) => {
      const url = (consulta.queryKey[0] as { url?: unknown } | undefined)?.url;
      return (
        typeof url === 'string' &&
        (/^\/escala\/(ocorrencias|alocacoes|historico)/.test(url) ||
          /^\/distribuicao\/(ajustes-dia|alocacoes\/)/.test(url))
      );
    },
  });
}

/** Painéis da tela Escala: plantão, alocar ou editar, e cobertura. */
export function PaineisEscala({
  painel,
  hoje,
  turnos,
  frentes,
  conflitos,
  permissoes,
  podeDefinirAusencia,
  onAbrir,
  onAvisos,
}: PaineisEscalaProps) {
  const queryClient = useQueryClient();
  const avisos = useAvisos();
  const fechar = () => onAbrir(null);
  const depois = async (texto: string, novos: AvisoConflitoDto[] = []) => {
    await invalidarEscala(queryClient);
    avisos.sucesso(texto);
    onAvisos(novos);
  };

  if (painel.tipo === 'plantao') {
    const o = painel.ocorrencia;
    return (
      <PlantaoAberto
        o={o}
        conflitos={conflitos}
        permissoes={permissoes}
        podeDefinirAusencia={podeDefinirAusencia}
        onAbrir={onAbrir}
        depois={depois}
        fechar={fechar}
      />
    );
  }
  return <OutrosPaineis {...{ painel, hoje, turnos, frentes, fechar, depois }} />;
}

function PlantaoAberto({
  o,
  conflitos,
  permissoes,
  podeDefinirAusencia,
  onAbrir,
  depois,
  fechar,
}: {
  o: OcorrenciaDto;
  conflitos: readonly ConflitoEscalaDto[];
  permissoes: PodeNaTela;
  podeDefinirAusencia: boolean;
  onAbrir: (painel: PainelAberto | null) => void;
  depois: (texto: string, novos?: AvisoConflitoDto[]) => Promise<void>;
  fechar: () => void;
}) {
  // Prioridades do ajuste do dia com `escala.ver` (a gestora não tem `catalogo.ver`).
  const classificacoes = useQuery({
    ...classificacoesEscalaControllerListarQueryOptions(),
    enabled: permissoes.editar,
  });
  return (
    <PainelPlantao
      key={`plantao-${o.alocacaoId}-${o.data}`}
      ocorrencia={o}
      conflitos={conflitos}
      permissoes={permissoes}
      podeDefinirAusencia={podeDefinirAusencia}
      onEditar={() => onAbrir({ tipo: 'editar', ocorrencia: o })}
      onCobertura={() => onAbrir({ tipo: 'cobertura', ocorrencia: o })}
      onRemover={async () => {
        await alocacoesControllerRemover({ path: { id: o.alocacaoId } }).unwrap();
        await depois(o.coberturaDe ? 'Cobertura removida.' : 'Alocação removida.');
        fechar();
      }}
      onAjustar={async (produtividade, observacoes) => {
        await alocacoesControllerDefinirAjuste({
          path: { id: o.alocacaoId, data: o.data },
          body: { produtividade, observacoes },
        }).unwrap();
        await depois(
          produtividade === null
            ? 'O dia voltou à produtividade da escala.'
            : 'Produtividade do dia salva.',
        );
      }}
      distribuicao={
        classificacoes.data
          ? {
              prioridades: classificacoes.data.prioridades,
              buscarClientes,
              onSalvar: async (ajuste) => {
                await ajustesDiaControllerSalvar({
                  path: { alocacaoId: o.alocacaoId, data: o.data },
                  body: ajuste,
                }).unwrap();
                const vazio =
                  !ajuste.prioridadeIdsLiberadas.length && !ajuste.segueSla && !ajuste.laudosExtra;
                await depois(vazio ? 'Ajuste do robô tirado.' : 'Ajuste do robô salvo.');
              },
            }
          : undefined
      }
      onFechar={fechar}
    />
  );
}

function OutrosPaineis({
  painel,
  hoje,
  turnos,
  frentes,
  fechar,
  depois,
}: {
  painel: Exclude<PainelAberto, { tipo: 'plantao' }>;
  hoje: string;
  turnos: TurnoItemDto[];
  frentes: FrenteItemDto[];
  fechar: () => void;
  depois: (texto: string, novos?: AvisoConflitoDto[]) => Promise<void>;
}) {
  if (painel.tipo === 'escala-fixa') {
    const { medico } = painel;
    return (
      <PainelEscalaFixa
        key={`escala-fixa-${medico.valor}`}
        medico={medico}
        hoje={hoje}
        turnos={turnos}
        frentes={frentes}
        buscarGrade={(medicoId, frenteId) =>
          escalaFixaControllerObter({ path: { medicoId }, query: { frenteId } }).unwrap()
        }
        buscarMedicos={buscarMedicosDaEscala}
        onFechar={fechar}
        onSalvar={async (dados) => {
          const resultado = await escalaFixaControllerDefinir({
            path: { medicoId: medico.valor },
            body: dados,
          }).unwrap();
          await depois(resumoDoResultado(resultado), resultado.avisos);
          fechar();
        }}
      />
    );
  }

  if (painel.tipo === 'cobertura') {
    return (
      <PainelDeCobertura
        ocorrencia={painel.ocorrencia}
        onFechar={fechar}
        onSalvo={async (texto, novos) => {
          await depois(texto, novos);
          fechar();
        }}
      />
    );
  }

  return (
    <PainelDeAlocacao
      painel={painel}
      hoje={hoje}
      turnos={turnos}
      frentes={frentes}
      onFechar={fechar}
      onSalvo={async (texto, novos) => {
        await depois(texto, novos);
        fechar();
      }}
    />
  );
}

/** O que os arranjos do médico sugerem para a alocação na frente (null = nada a sugerir). */
async function buscarSugestaoAlocacao(medicoId: string, frenteId: string) {
  const { sugestao } = await sugestaoAlocacaoControllerObter({
    query: { medicoId, frenteId },
  }).unwrap();
  return sugestao;
}

function PainelDeAlocacao({
  painel,
  hoje,
  turnos,
  frentes,
  onFechar,
  onSalvo,
}: {
  painel: Extract<PainelAberto, { tipo: 'alocar' | 'editar' }>;
  hoje: string;
  turnos: TurnoItemDto[];
  frentes: FrenteItemDto[];
  onFechar: () => void;
  onSalvo: (texto: string, avisos: AvisoConflitoDto[]) => Promise<void>;
}) {
  const id = painel.tipo === 'editar' ? painel.ocorrencia.alocacaoId : '';
  const alocacao = useQuery({
    ...alocacoesControllerObterQueryOptions({ path: { id } }),
    enabled: Boolean(id),
  });
  // Prioridades e subespecialidades com `escala.ver`, sem depender de `catalogo.ver`.
  const classificacoes = useQuery(classificacoesEscalaControllerListarQueryOptions());
  const faltaAlocacao = Boolean(id) && !alocacao.data;
  if (faltaAlocacao || !classificacoes.data) {
    const erro = alocacao.isError || classificacoes.isError;
    return (
      <PainelCarregando
        key={`alocacao-${id}`}
        onFechar={onFechar}
        erro={erro}
        onTentarDeNovo={() => {
          void alocacao.refetch();
          void classificacoes.refetch();
        }}
      />
    );
  }

  return (
    <PainelAlocacao
      key={`alocacao-${id}`}
      alocacao={alocacao.data}
      medicoNome={painel.tipo === 'editar' ? painel.ocorrencia.medicoNome : undefined}
      inicial={painel.tipo === 'alocar' ? painel.inicial : undefined}
      hoje={hoje}
      turnos={turnos}
      frentes={frentes}
      prioridades={classificacoes.data.prioridades}
      subespecialidades={classificacoes.data.subespecialidades}
      buscarMedicos={buscarMedicosAtivos}
      buscarSugestao={buscarSugestaoAlocacao}
      onFechar={onFechar}
      onSalvar={async (dados) => {
        if (id) {
          const { avisos } = await alocacoesControllerAtualizar({
            path: { id },
            body: dados,
          }).unwrap();
          await onSalvo('Alocação salva.', avisos);
        } else {
          const { avisos } = await alocacoesControllerCriar({ body: dados }).unwrap();
          await onSalvo('Médico alocado.', avisos);
        }
      }}
    />
  );
}

function PainelDeCobertura({
  ocorrencia: o,
  onFechar,
  onSalvo,
}: {
  ocorrencia: OcorrenciaDto;
  onFechar: () => void;
  onSalvo: (texto: string, avisos: AvisoConflitoDto[]) => Promise<void>;
}) {
  // No plantão de uma cobertura, edita a cobertura; no do titular, cria outra.
  const coberturaId = o.coberturaDe ? o.alocacaoId : '';
  const titularId = o.coberturaDe?.alocacaoId ?? o.alocacaoId;
  const titular = useQuery(alocacoesControllerObterQueryOptions({ path: { id: titularId } }));
  const cobertura = useQuery({
    ...alocacoesControllerObterQueryOptions({ path: { id: coberturaId } }),
    enabled: Boolean(coberturaId),
  });
  if (!titular.data || (coberturaId && !cobertura.data)) {
    return (
      <PainelCarregando
        key={`cobertura-${titularId}`}
        onFechar={onFechar}
        erro={titular.isError || cobertura.isError}
        onTentarDeNovo={() => {
          void titular.refetch();
          void cobertura.refetch();
        }}
      />
    );
  }
  const t = titular.data;
  const atual = cobertura.data;

  return (
    <PainelCobertura
      key={`cobertura-${titularId}`}
      titular={{
        ...t,
        medicoNome: o.coberturaDe?.medicoNome ?? o.medicoNome,
        local: `${o.frenteRotulo}, ${o.turnoNome}`,
      }}
      dia={o.data}
      atual={
        atual
          ? {
              medico: { valor: atual.medicoId, rotulo: o.medicoNome },
              dataInicio: atual.dataInicio,
              dataFim: atual.dataFim ?? atual.dataInicio,
              diasSemana: atual.diasSemana,
              horarioInicio: atual.horarioInicio,
              horarioFim: atual.horarioFim,
              produtividade: atual.produtividade,
              observacoes: atual.observacoes ?? '',
            }
          : undefined
      }
      buscarMedicos={buscarMedicosAtivos}
      onFechar={onFechar}
      onSalvar={async (dados) => {
        if (coberturaId) {
          const { avisos } = await coberturasControllerAtualizar({
            path: { id: coberturaId },
            body: dados,
          }).unwrap();
          await onSalvo('Cobertura salva.', avisos);
        } else {
          const { avisos } = await alocacoesControllerCriarCobertura({
            path: { id: titularId },
            body: dados,
          }).unwrap();
          await onSalvo('Cobertura criada.', avisos);
        }
      }}
    />
  );
}
