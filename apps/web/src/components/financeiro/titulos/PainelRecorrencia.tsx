import { Button } from '@base-ui/react/button';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

import type { RecorrenciaDetalheDto } from '../../../gen/types/RecorrenciaDetalheDto';
import { dataHoraCurta } from '../../../lib/datas';
import { formatarDia } from '../../../lib/financeiro';
import { moeda, plural } from '../../../lib/formato';
import {
  diaDeHoje,
  etiquetaDaSituacao,
  frequenciaPorExtenso,
  numeroDoTitulo,
  ROTULO_AJUSTE,
  type TipoTitulo,
  terminoPorExtenso,
} from '../../../lib/titulos';
import { Abas } from '../../abas/Abas';
import { Alerta } from '../../alerta/Alerta';
import { mensagemDaApi } from '../../alerta/mensagem-da-api';
import { buttonClassName } from '../../button/button-class';
import { LinkDaLinha } from '../../data-table/link-da-linha';
import { Etiqueta } from '../../etiqueta/Etiqueta';
import { MenuDeAcoes } from '../../menu-acoes/MenuDeAcoes';
import { Paginacao } from '../../paginacao/Paginacao';
import { PainelLateral } from '../../painel/PainelLateral';
import { RodapeDeAcoes } from '../../painel/RodapeDeAcoes';
import { DialogoMotivo } from '../../repasse/DialogoMotivo';
import { Skeleton } from '../../skeleton/Skeleton';
import { useAvisos } from '../../toast/use-avisos';
import { apiDoTipo } from './api';
import { SITUACAO_RECORRENCIA } from './busca';

const POR_PAGINA = 5;

type PainelRecorrenciaProps = {
  tipo: TipoTitulo;
  recorrencia: RecorrenciaDetalheDto;
  pode: { editar: boolean; criar: boolean; cancelar: boolean };
  historico: ReactNode;
  onEditar: () => void;
  onPausar: () => Promise<void>;
  onRetomar: () => Promise<void>;
  onGerarProximo: () => Promise<void>;
  onEncerrar: (motivo: string) => Promise<void>;
  onFechar: () => void;
};

/** A recorrência: dados, títulos gerados e histórico; editar, pausar, gerar o próximo, encerrar. */
export function PainelRecorrencia({
  tipo,
  recorrencia: r,
  pode,
  historico,
  onEditar,
  onPausar,
  onRetomar,
  onGerarProximo,
  onEncerrar,
  onFechar,
}: PainelRecorrenciaProps) {
  const [aba, setAba] = useState('dados');
  const [encerrando, setEncerrando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string>();
  const { sucesso } = useAvisos();
  const situacao = SITUACAO_RECORRENCIA[r.situacao] ?? SITUACAO_RECORRENCIA.ativa;
  const ativa = r.situacao === 'ativa';

  const agir = (acao: () => Promise<void>, feito: string) => async () => {
    setOcupado(true);
    setErro(undefined);
    try {
      await acao();
      sucesso(feito);
    } catch (falha) {
      setErro(mensagemDaApi(falha, 'Não foi possível concluir agora. Tente de novo.'));
    } finally {
      setOcupado(false);
    }
  };

  const acoes = [
    ...(pode.editar && r.situacao !== 'encerrada'
      ? [
          ativa
            ? { rotulo: 'Pausar', onEscolher: agir(onPausar, 'Recorrência pausada.') }
            : { rotulo: 'Retomar', onEscolher: agir(onRetomar, 'Recorrência retomada.') },
        ]
      : []),
    ...(pode.criar && ativa
      ? [{ rotulo: 'Gerar o próximo agora', onEscolher: agir(onGerarProximo, 'Título gerado.') }]
      : []),
    ...(pode.cancelar && r.situacao !== 'encerrada'
      ? [{ rotulo: 'Encerrar…', destrutiva: true, onEscolher: () => setEncerrando(true) }]
      : []),
  ];

  return (
    <PainelLateral
      titulo={r.descricao}
      subtitulo={
        <span className="flex flex-wrap items-center gap-2">
          <span>{`${r.favorecidoNome} · ${r.empresaNome}`}</span>
          <Etiqueta tom={situacao?.tom ?? 'sucesso'}>{situacao?.texto}</Etiqueta>
        </span>
      }
      ocupado={ocupado}
      onFechar={onFechar}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {erro && (
          <div className="px-4 pt-3">
            <Alerta tom="erro">{erro}</Alerta>
          </div>
        )}
        <Abas
          aria-label="Partes da recorrência"
          valor={aba}
          onMudar={setAba}
          abas={[
            { valor: 'dados', rotulo: 'Dados' },
            {
              valor: 'titulos',
              rotulo: r.ocorrencias.length
                ? `Títulos gerados (${r.ocorrencias.length})`
                : 'Títulos gerados',
            },
            { valor: 'historico', rotulo: 'Histórico' },
          ]}
          className="gap-0 pt-2"
        >
          {aba === 'dados' && <Dados r={r} />}
          {aba === 'titulos' && <TitulosGerados tipo={tipo} r={r} />}
          {aba === 'historico' && historico}
        </Abas>
        <div className="mt-auto border-t p-4">
          <RodapeDeAcoes
            inicio={<MenuDeAcoes aria-label={`Mais ações de ${r.descricao}`} acoes={acoes} />}
          >
            {pode.editar && r.situacao !== 'encerrada' && (
              <Button
                type="button"
                onClick={onEditar}
                className={buttonClassName({ variant: 'secondary' })}
              >
                Editar
              </Button>
            )}
          </RodapeDeAcoes>
        </div>
      </div>
      {encerrando && (
        <DialogoMotivo
          titulo={`Encerrar a recorrência ${r.descricao}?`}
          descricao="Ela para de gerar títulos e não volta. Os títulos já gerados em aberto ficam; cancele à parte os que não valem mais."
          acao="Encerrar recorrência"
          pendente="Encerrando…"
          placeholder="Ex.: mudamos de sala"
          onFechar={() => setEncerrando(false)}
          onConfirmar={async (motivo) => {
            await onEncerrar(motivo);
            setEncerrando(false);
            sucesso('Recorrência encerrada.');
          }}
        />
      )}
    </PainelLateral>
  );
}

function Linha({ termo, children }: { termo: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{termo}</dt>
      <dd className="m-0 min-w-0 break-words">{children}</dd>
    </>
  );
}

function Dados({ r }: { r: RecorrenciaDetalheDto }) {
  return (
    <div className="flex flex-col gap-5 p-4">
      <dl className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-2.5 tabular-nums">
        <Linha termo="Frequência">
          {frequenciaPorExtenso(r.frequencia, r.diaVencimento ?? null)}
        </Linha>
        <Linha termo="Valor">
          {`${moeda(r.valorCentavos / 100)} ${r.modoValor === 'previsto' ? 'previsto (muda todo mês)' : 'fixo'}`}
        </Linha>
        <Linha termo="Primeiro vencimento">{formatarDia(r.primeiroVencimento)}</Linha>
        <Linha termo="Término">
          {terminoPorExtenso({
            termino: r.termino,
            terminoEm: r.terminoEm ?? null,
            terminoOcorrencias: r.terminoOcorrencias ?? null,
          })}
        </Linha>
        <Linha termo="Fim de semana ou feriado">
          {ROTULO_AJUSTE[r.ajusteEfetivo]}
          {!r.ajusteDiaNaoUtil && (
            <span className="text-muted-foreground"> (padrão da empresa)</span>
          )}
        </Linha>
        <Linha termo="Categoria">{r.categoriaNome}</Linha>
        <Linha termo="Conta prevista">{r.contaPrevistaNome ?? '—'}</Linha>
        <Linha termo="Próximo a gerar">
          {r.proximoAGerar
            ? `${formatarDia(r.proximoAGerar.vencimento)}, em ${formatarDia(r.proximoAGerar.geradoEm)}`
            : '—'}
        </Linha>
        {r.situacao === 'encerrada' && (
          <Linha termo="Encerrada">
            {r.encerradaEm ? dataHoraCurta(r.encerradaEm) : ''}
            {r.motivoEncerramento && (
              <span className="text-muted-foreground block">{r.motivoEncerramento}</span>
            )}
          </Linha>
        )}
      </dl>
      {r.observacoes && (
        <div className="flex flex-col gap-1.5">
          <h3 className="font-semibold">Observações</h3>
          <p className="text-muted-foreground whitespace-pre-line">{r.observacoes}</p>
        </div>
      )}
      <p className="text-muted-foreground text-[13px]">
        {`Gera os títulos ${plural(r.horizonteMeses, { um: 'mês', varios: 'meses' })} à frente (Regras financeiras). Cada título é independente: recebe baixa e é editado sozinho.`}
      </p>
    </div>
  );
}

function TitulosGerados({ tipo, r }: { tipo: TipoTitulo; r: RecorrenciaDetalheDto }) {
  const [pagina, setPagina] = useState(1);
  const consulta = useQuery({
    ...apiDoTipo(tipo).listar({
      query: {
        empresa: 'todas',
        situacao: 'todas',
        origem: 'todas',
        categoria: 'todas',
        recorrenciaId: r.id,
        pagina,
        porPagina: POR_PAGINA,
      },
    }),
    placeholderData: keepPreviousData,
  });
  const hoje = diaDeHoje();
  const dados = consulta.data;
  if (!dados) {
    return (
      <div aria-busy="true" className="flex flex-col gap-3 p-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }
  if (dados.total === 0) {
    return (
      <div className="flex flex-col gap-1 p-4">
        <p className="font-medium">Nenhum título gerado ainda.</p>
        <p className="text-muted-foreground">
          Os títulos saem quando o vencimento entra no horizonte das Regras financeiras.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col">
      <ul className="divide-y">
        {dados.itens.map((t) => {
          const e = etiquetaDaSituacao(t, hoje);
          return (
            <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="flex min-w-0 flex-col">
                <LinkDaLinha
                  to="."
                  search={(() => ({ aba: undefined, id: t.id, situacao: 'todas' })) as never}
                >
                  {numeroDoTitulo(tipo, t.numero)}
                </LinkDaLinha>
                <span className="text-muted-foreground text-[13px] tabular-nums">
                  {`Vence ${formatarDia(t.vencimento)} · ${moeda(t.valorCentavos / 100)}`}
                </span>
              </span>
              <Etiqueta tom={e.tom}>{e.texto}</Etiqueta>
            </li>
          );
        })}
      </ul>
      <Paginacao pagina={pagina} porPagina={POR_PAGINA} total={dados.total} onIrPara={setPagina} />
    </div>
  );
}
