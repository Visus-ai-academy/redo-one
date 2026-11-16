import { type QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';

import { alocacoesControllerAtualizar } from '../../gen/clients/alocacoesControllerAtualizar';
import { alocacoesControllerCriar } from '../../gen/clients/alocacoesControllerCriar';
import { alocacoesControllerCriarCobertura } from '../../gen/clients/alocacoesControllerCriarCobertura';
import { alocacoesControllerDefinirAjuste } from '../../gen/clients/alocacoesControllerDefinirAjuste';
import { alocacoesControllerRemover } from '../../gen/clients/alocacoesControllerRemover';
import { coberturasControllerAtualizar } from '../../gen/clients/coberturasControllerAtualizar';
import { alocacoesControllerObterQueryOptions } from '../../gen/hooks/useAlocacoesControllerObter';
import { prioridadesControllerListarQueryOptions } from '../../gen/hooks/usePrioridadesControllerListar';
import { subespecialidadesControllerListarQueryOptions } from '../../gen/hooks/useSubespecialidadesControllerListar';
import type { AvisoConflitoDto } from '../../gen/types/AvisoConflitoDto';
import type { ConflitoEscalaDto } from '../../gen/types/ConflitoEscalaDto';
import type { FrenteItemDto } from '../../gen/types/FrenteItemDto';
import type { OcorrenciaDto } from '../../gen/types/OcorrenciaDto';
import type { TurnoItemDto } from '../../gen/types/TurnoItemDto';
import { PainelCarregando } from '../painel/PainelCarregando';
import { useAvisos } from '../toast/use-avisos';
import type { InicialAlocacao } from './alocacao-form';
import { buscarMedicosAtivos } from './buscar-medicos';
import { PainelAlocacao } from './PainelAlocacao';
import { PainelCobertura } from './PainelCobertura';
import { PainelPlantao } from './PainelPlantao';

/** O que está aberto ao lado da escala. */
export type PainelAberto =
  | { tipo: 'plantao'; ocorrencia: OcorrenciaDto }
  | { tipo: 'alocar'; inicial: InicialAlocacao }
  | { tipo: 'editar'; ocorrencia: OcorrenciaDto }
  | { tipo: 'cobertura'; ocorrencia: OcorrenciaDto };

type PaineisEscalaProps = {
  painel: PainelAberto;
  hoje: string;
  /** Turnos e frentes ativos, já no recorte de quem edita. */
  turnos: TurnoItemDto[];
  frentes: FrenteItemDto[];
  conflitos: readonly ConflitoEscalaDto[];
  podeEditar: boolean;
  /** Prioridades e subespecialidades vêm do catálogo; sem acesso, ficam sem restrição. */
  podeVerCatalogo: boolean;
  onAbrir: (painel: PainelAberto | null) => void;
  /** Conflitos que a escrita criou (aviso que não bloqueia). */
  onAvisos: (avisos: AvisoConflitoDto[]) => void;
};

const ATIVOS = { query: { ativo: true, porPagina: 100 } };

/** Depois de qualquer escrita na escala, refaz as ocorrências e as alocações abertas. */
function invalidarEscala(queryClient: QueryClient) {
  return queryClient.invalidateQueries({
    predicate: (consulta) => {
      const url = (consulta.queryKey[0] as { url?: unknown } | undefined)?.url;
      return typeof url === 'string' && /^\/escala\/(ocorrencias|alocacoes|historico)/.test(url);
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
  podeEditar,
  podeVerCatalogo,
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
      <PainelPlantao
        key={`plantao-${o.alocacaoId}-${o.data}`}
        ocorrencia={o}
        conflitos={conflitos}
        podeEditar={podeEditar}
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
        onFechar={fechar}
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
      podeVerCatalogo={podeVerCatalogo}
      onFechar={fechar}
      onSalvo={async (texto, novos) => {
        await depois(texto, novos);
        fechar();
      }}
    />
  );
}

function PainelDeAlocacao({
  painel,
  hoje,
  turnos,
  frentes,
  podeVerCatalogo,
  onFechar,
  onSalvo,
}: {
  painel: Extract<PainelAberto, { tipo: 'alocar' | 'editar' }>;
  hoje: string;
  turnos: TurnoItemDto[];
  frentes: FrenteItemDto[];
  podeVerCatalogo: boolean;
  onFechar: () => void;
  onSalvo: (texto: string, avisos: AvisoConflitoDto[]) => Promise<void>;
}) {
  const id = painel.tipo === 'editar' ? painel.ocorrencia.alocacaoId : '';
  const alocacao = useQuery({
    ...alocacoesControllerObterQueryOptions({ path: { id } }),
    enabled: Boolean(id),
  });
  const prioridades = useQuery({
    ...prioridadesControllerListarQueryOptions(ATIVOS),
    enabled: podeVerCatalogo,
  });
  const subespecialidades = useQuery({
    ...subespecialidadesControllerListarQueryOptions(ATIVOS),
    enabled: podeVerCatalogo,
  });
  const faltaAlocacao = Boolean(id) && !alocacao.data;
  const faltaCatalogo = podeVerCatalogo && (!prioridades.data || !subespecialidades.data);
  if (faltaAlocacao || faltaCatalogo) {
    const erro = alocacao.isError || prioridades.isError || subespecialidades.isError;
    return (
      <PainelCarregando
        key={`alocacao-${id}`}
        onFechar={onFechar}
        erro={erro}
        onTentarDeNovo={() => {
          void alocacao.refetch();
          void prioridades.refetch();
          void subespecialidades.refetch();
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
      prioridades={prioridades.data?.itens}
      subespecialidades={subespecialidades.data?.itens}
      buscarMedicos={buscarMedicosAtivos}
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
