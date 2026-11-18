import { Button } from '@base-ui/react/button';
import { Info, MinusCircle, Package } from '@phosphor-icons/react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { rodadasControllerDesignacoesQueryOptions } from '../../gen/hooks/useRodadasControllerDesignacoes';
import type { DesignacaoDto } from '../../gen/types/DesignacaoDto';
import type { MedicoDaRodadaDto } from '../../gen/types/MedicoDaRodadaDto';
import { dataHoraCurta } from '../../lib/datas';
import { juntarNomes, num, tomDaPrioridade } from '../../lib/rodada';
import type { OpcaoBusca } from '../busca/BuscaSelecao';
import { buttonClassName } from '../button/button-class';
import { Etiqueta } from '../etiqueta/Etiqueta';
import { Paginacao } from '../paginacao/Paginacao';
import { PainelLateral } from '../painel/PainelLateral';
import { Skeleton } from '../skeleton/Skeleton';
import { CargaDoMedico } from './comum';
import { MoverExame } from './MoverExame';

const POR_PAGINA = 10;

export type AcoesDoExame = {
  tirar: (d: DesignacaoDto) => Promise<unknown>;
  mover: (d: DesignacaoDto, medicoId: string, levarPacote: boolean) => Promise<unknown>;
};

/** Um exame da proposta, com o que identifica o pacote do paciente e as ações da conferência. */
export function ExameDaProposta({
  d,
  medicos,
  buscarMedicos,
  acoes,
  ocupado,
}: {
  d: DesignacaoDto;
  medicos: readonly MedicoDaRodadaDto[];
  buscarMedicos: (termo: string) => Promise<OpcaoBusca[]>;
  /** Sem ações: quem só acompanha. */
  acoes?: AcoesDoExame;
  ocupado?: boolean;
}) {
  return (
    <li className="flex items-start justify-between gap-3 border-b px-4 py-3 last:border-b-0">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{d.estudo}</span>
          {d.prioridadeOperacao && (
            <Etiqueta tom={tomDaPrioridade(d)}>{d.prioridadeOperacao.nome}</Etiqueta>
          )}
          {d.naMao && <Etiqueta tom="info">Na mão</Etiqueta>}
        </div>
        <span className="text-muted-foreground text-xs tabular-nums">
          {d.cliente?.nome ?? d.unidade}
          {d.prazo && `, vence ${dataHoraCurta(d.prazo).toLowerCase()}`}
        </span>
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          {d.nomePaciente && <span>{d.nomePaciente}</span>}
          {d.pacote && (
            <Etiqueta tom="inativo" icone={Package}>
              {`Pacote, ${d.pacote.exames} exames`}
            </Etiqueta>
          )}
          <span className="text-subtle-foreground font-mono text-xs">{d.idExameMobilemed}</span>
        </div>
      </div>
      {acoes && (
        <div className="flex flex-none flex-col items-end gap-1 sm:flex-row sm:items-center">
          <Button
            type="button"
            disabled={ocupado}
            onClick={() => void acoes.tirar(d)}
            className={buttonClassName({ variant: 'ghost', className: 'h-8 px-2 text-[13px]' })}
          >
            <MinusCircle size={16} aria-hidden />
            Tirar
          </Button>
          <MoverExame
            designacao={d}
            medicos={medicos}
            buscarMedicos={buscarMedicos}
            desabilitado={ocupado}
            onEscolher={(medicoId, levar) => acoes.mover(d, medicoId, levar)}
          />
        </div>
      )}
    </li>
  );
}

/**
 * O médico na proposta (painel lateral): carga depois da rodada e os exames propostos a ele, 10
 * por página, com "Tirar" e "Mover". O nome do paciente só vem para quem tem a permissão.
 */
export function PainelMedico({
  rodadaId,
  medico,
  medicos,
  verPaciente,
  buscarMedicos,
  acoes,
  ocupado,
  onFechar,
}: {
  rodadaId: string;
  medico: MedicoDaRodadaDto;
  medicos: readonly MedicoDaRodadaDto[];
  verPaciente: boolean;
  buscarMedicos: (termo: string) => Promise<OpcaoBusca[]>;
  acoes?: AcoesDoExame;
  ocupado?: boolean;
  onFechar: () => void;
}) {
  const [pagina, setPagina] = useState(1);
  const consulta = useQuery({
    ...rodadasControllerDesignacoesQueryOptions({
      path: { id: rodadaId },
      query: { medicoId: medico.medicoId, status: ['prevista'], pagina, porPagina: POR_PAGINA },
    }),
    placeholderData: keepPreviousData,
  });
  const lista = consulta.data;
  const detalhe = [juntarNomes(medico.turnos), juntarNomes(medico.frentes)]
    .filter(Boolean)
    .join('. ');

  return (
    <PainelLateral titulo={medico.nome} subtitulo={detalhe || 'Fora de turno'} onFechar={onFechar}>
      <div className="flex flex-col gap-2 border-b p-4">
        <div className="flex items-center justify-between gap-2 text-[13px]">
          <span className="text-muted-foreground">Carga depois da rodada</span>
          <CargaDoMedico
            cargaEmMaos={medico.cargaEmMaos}
            propostos={medico.previstas}
            capacidade={medico.capacidade}
          />
        </div>
        <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums">
          <span>{num(medico.cargaEmMaos)} já abertos</span>
          <span>{num(medico.previstas)} propostos</span>
          <span>{num(medico.urgencias)} urgências</span>
          <span>{num(medico.pacotes)} pacotes do mesmo paciente</span>
        </div>
      </div>
      {!verPaciente && (
        <p className="text-muted-foreground flex items-center gap-2 px-4 pt-3 text-xs">
          <Info size={14} aria-hidden />
          Sem permissão para ver o nome do paciente. Os exames do mesmo paciente aparecem pelo
          pacote.
        </p>
      )}
      {!lista ? (
        <div className="flex flex-col gap-3 p-4" aria-busy>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : lista.total === 0 ? (
        <p className="text-muted-foreground p-4">Nenhum exame proposto a este médico agora.</p>
      ) : (
        <>
          <ul
            aria-label="Exames propostos"
            className={consulta.isPlaceholderData ? 'opacity-60' : undefined}
          >
            {lista.itens.map((d) => (
              <ExameDaProposta
                key={d.id}
                d={d}
                medicos={medicos}
                buscarMedicos={buscarMedicos}
                acoes={acoes}
                ocupado={ocupado}
              />
            ))}
          </ul>
          <Paginacao
            pagina={pagina}
            porPagina={POR_PAGINA}
            total={lista.total}
            onIrPara={setPagina}
          />
        </>
      )}
    </PainelLateral>
  );
}
