import { Button } from '@base-ui/react/button';
import { type ReactNode, useState } from 'react';

import type { BaixaDoTituloDto } from '../../../gen/types/BaixaDoTituloDto';
import type { BaixaDto } from '../../../gen/types/BaixaDto';
import type { ContaBancariaItemDto } from '../../../gen/types/ContaBancariaItemDto';
import type { TituloDetalheDto } from '../../../gen/types/TituloDetalheDto';
import { dataHoraCurta } from '../../../lib/datas';
import { formatarDia } from '../../../lib/financeiro';
import { moeda, plural } from '../../../lib/formato';
import {
  diaDeHoje,
  etiquetaDaSituacao,
  numeroDoTitulo,
  ROTULO_FORMA,
  ROTULO_ORIGEM,
  type TipoTitulo,
} from '../../../lib/titulos';
import { Abas } from '../../abas/Abas';
import { buttonClassName } from '../../button/button-class';
import { Etiqueta } from '../../etiqueta/Etiqueta';
import { MenuDeAcoes } from '../../menu-acoes/MenuDeAcoes';
import { Paginacao } from '../../paginacao/Paginacao';
import { usePaginaLocal } from '../../paginacao/use-pagina-local';
import { PainelLateral } from '../../painel/PainelLateral';
import { RodapeDeAcoes } from '../../painel/RodapeDeAcoes';
import { DialogoMotivo } from '../../repasse/DialogoMotivo';
import { useAvisos } from '../../toast/use-avisos';
import { DialogoBaixa } from './DialogoBaixa';
import { DialogoProrrogar } from './DialogoProrrogar';

export type AcoesDoTitulo = {
  editar: boolean;
  baixar: boolean;
  estornar: boolean;
  cancelar: boolean;
};

type PainelTituloProps = {
  tipo: TipoTitulo;
  titulo: TituloDetalheDto;
  pode: AcoesDoTitulo;
  /** Contas ativas da empresa do título (para a baixa). */
  contas: ContaBancariaItemDto[];
  /** Aba Histórico. */
  historico: ReactNode;
  /** De onde o título veio, com o link (ex.: a recorrência). */
  origem?: ReactNode;
  onEditar: () => void;
  onBaixar: (dados: BaixaDto) => Promise<void>;
  onEstornar: (baixaId: string, motivo: string) => Promise<void>;
  onCancelar: (motivo: string) => Promise<void>;
  onProrrogar: (dados: { vencimento: string; motivo: string }) => Promise<void>;
  onFechar: () => void;
};

type Dialogo =
  | { tipo: 'baixa' }
  | { tipo: 'prorrogar' }
  | { tipo: 'cancelar' }
  | { tipo: 'estornar'; baixa: BaixaDoTituloDto };

const POR_PAGINA = 5;

/** O título: dados, baixas e histórico; dar baixa, editar, prorrogar e cancelar. */
export function PainelTitulo({
  tipo,
  titulo,
  pode,
  contas,
  historico,
  origem,
  onEditar,
  onBaixar,
  onEstornar,
  onCancelar,
  onProrrogar,
  onFechar,
}: PainelTituloProps) {
  const [aba, setAba] = useState('dados');
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const { sucesso } = useAvisos();
  const hoje = diaDeHoje();
  const numero = numeroDoTitulo(tipo, titulo.numero);
  const etiqueta = etiquetaDaSituacao(titulo, hoje);
  const saldo = titulo.valorCentavos - titulo.pagoCentavos;
  const emAberto = titulo.situacao === 'aberto' || titulo.situacao === 'parcial';
  const fechar = () => setDialogo(null);

  const acoes = [
    ...(pode.editar && emAberto
      ? [{ rotulo: 'Prorrogar vencimento…', onEscolher: () => setDialogo({ tipo: 'prorrogar' }) }]
      : []),
    ...(pode.cancelar && titulo.situacao !== 'cancelado'
      ? [
          {
            rotulo: 'Cancelar título…',
            destrutiva: true,
            onEscolher: () => setDialogo({ tipo: 'cancelar' }),
            desabilitada:
              titulo.pagoCentavos > 0 ? 'Tem baixa ativa: estorne as baixas antes.' : undefined,
          },
        ]
      : []),
  ];

  return (
    <PainelLateral
      titulo={titulo.favorecido.nome}
      subtitulo={
        <span className="flex flex-wrap items-center gap-2">
          <span>{`Título a ${tipo} ${numero} · ${titulo.empresaNome}`}</span>
          <Etiqueta tom={etiqueta.tom}>{etiqueta.texto}</Etiqueta>
        </span>
      }
      onFechar={onFechar}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <Abas
          aria-label="Partes do título"
          valor={aba}
          onMudar={setAba}
          abas={[
            { valor: 'dados', rotulo: 'Dados' },
            {
              valor: 'baixas',
              rotulo: titulo.baixas.length ? `Baixas (${titulo.baixas.length})` : 'Baixas',
            },
            { valor: 'historico', rotulo: 'Histórico' },
          ]}
          className="gap-0 pt-2"
        >
          {aba === 'dados' && <Dados tipo={tipo} titulo={titulo} hoje={hoje} origem={origem} />}
          {aba === 'baixas' && (
            <Baixas
              baixas={titulo.baixas}
              podeEstornar={pode.estornar}
              onEstornar={(baixa) => setDialogo({ tipo: 'estornar', baixa })}
            />
          )}
          {aba === 'historico' && historico}
        </Abas>
        <div className="mt-auto border-t p-4">
          <RodapeDeAcoes
            inicio={<MenuDeAcoes aria-label={`Mais ações do título ${numero}`} acoes={acoes} />}
          >
            {pode.editar && emAberto && (
              <Button
                type="button"
                onClick={onEditar}
                className={buttonClassName({ variant: 'secondary' })}
              >
                Editar
              </Button>
            )}
            {pode.baixar && emAberto && (
              <Button
                type="button"
                onClick={() => setDialogo({ tipo: 'baixa' })}
                className={buttonClassName()}
              >
                Dar baixa
              </Button>
            )}
          </RodapeDeAcoes>
        </div>
      </div>

      {dialogo?.tipo === 'baixa' && (
        <DialogoBaixa
          tipo={tipo}
          titulo={titulo}
          contas={contas}
          onFechar={fechar}
          onBaixar={async (dados) => {
            await onBaixar(dados);
            fechar();
            sucesso('Baixa registrada.');
          }}
        />
      )}
      {dialogo?.tipo === 'prorrogar' && (
        <DialogoProrrogar
          numero={numero}
          vencimento={titulo.vencimento}
          emissaoEm={titulo.emissaoEm}
          onFechar={fechar}
          onProrrogar={async (dados) => {
            await onProrrogar(dados);
            fechar();
            sucesso('Vencimento prorrogado.');
          }}
        />
      )}
      {dialogo?.tipo === 'cancelar' && (
        <DialogoMotivo
          titulo={`Cancelar o título ${numero}?`}
          descricao={`O título de ${moeda(titulo.valorCentavos / 100)} deixa de valer e fica na lista como Cancelado, com o motivo. Não dá para desfazer.`}
          acao="Cancelar título"
          pendente="Cancelando…"
          placeholder="Ex.: lançado em duplicidade"
          onFechar={fechar}
          onConfirmar={async (motivo) => {
            await onCancelar(motivo);
            fechar();
            sucesso('Título cancelado.');
          }}
        />
      )}
      {dialogo?.tipo === 'estornar' && (
        <DialogoMotivo
          titulo={`Estornar a baixa de ${moeda(dialogo.baixa.principalCentavos / 100)}?`}
          descricao={`O título volta a ter saldo de ${moeda((saldo + dialogo.baixa.principalCentavos) / 100)}. A baixa estornada fica no histórico.`}
          acao="Estornar baixa"
          pendente="Estornando…"
          placeholder="Ex.: o Pix voltou"
          onFechar={fechar}
          onConfirmar={async (motivo) => {
            await onEstornar(dialogo.baixa.id, motivo);
            fechar();
            sucesso('Baixa estornada.');
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

function Dados({
  tipo,
  titulo,
  hoje,
  origem,
}: {
  tipo: TipoTitulo;
  titulo: TituloDetalheDto;
  hoje: string;
  origem?: ReactNode;
}) {
  const saldo = titulo.valorCentavos - titulo.pagoCentavos;
  return (
    <div className="flex flex-col gap-5 p-4">
      <dl className="grid grid-cols-[128px_1fr] gap-x-3 gap-y-2.5 tabular-nums">
        <Linha termo="Descrição">{titulo.descricao}</Linha>
        <Linha termo={tipo === 'pagar' ? 'Valor a pagar' : 'Valor a receber'}>
          <strong>{moeda(titulo.valorCentavos / 100)}</strong>
        </Linha>
        <Linha termo={tipo === 'pagar' ? 'Pago' : 'Recebido'}>
          {moeda(titulo.pagoCentavos / 100)}
        </Linha>
        <Linha termo="Saldo">
          <strong>{moeda(saldo / 100)}</strong>
        </Linha>
        <Linha termo="Emissão">{formatarDia(titulo.emissaoEm)}</Linha>
        <Linha termo="Vencimento">
          {formatarDia(titulo.vencimento)}
          {titulo.diasDeAtraso > 0 && (
            <span className="text-muted-foreground">
              {` · vencido há ${plural(titulo.diasDeAtraso, { um: 'dia', varios: 'dias' })}`}
            </span>
          )}
          {titulo.vencimento === hoje &&
            titulo.diasDeAtraso === 0 &&
            titulo.situacao === 'aberto' && (
              <span className="text-muted-foreground"> · vence hoje</span>
            )}
          {titulo.vencimentoOriginal && (
            <span className="text-muted-foreground block text-[13px]">
              {`Prorrogado; era ${formatarDia(titulo.vencimentoOriginal)}`}
            </span>
          )}
        </Linha>
        <Linha termo="Competência">
          {titulo.competencia
            ? `${titulo.competencia.slice(5, 7)}/${titulo.competencia.slice(0, 4)}`
            : '—'}
        </Linha>
        <Linha termo="Categoria">{titulo.categoriaNome}</Linha>
        <Linha termo="Conta prevista">{titulo.contaPrevistaNome ?? '—'}</Linha>
        <Linha termo="Documento">{titulo.documento ?? '—'}</Linha>
        <Linha termo="Origem">{origem ?? ROTULO_ORIGEM[titulo.origem] ?? titulo.origem}</Linha>
        {titulo.situacao === 'cancelado' && (
          <Linha termo="Cancelado">
            {titulo.canceladoEm ? dataHoraCurta(titulo.canceladoEm) : ''}
            {titulo.motivoCancelamento && (
              <span className="text-muted-foreground block">{titulo.motivoCancelamento}</span>
            )}
          </Linha>
        )}
      </dl>
      {titulo.observacoes && (
        <div className="flex flex-col gap-1.5">
          <h3 className="font-semibold">Observações</h3>
          <p className="text-muted-foreground whitespace-pre-line">{titulo.observacoes}</p>
        </div>
      )}
    </div>
  );
}

function Baixas({
  baixas,
  podeEstornar,
  onEstornar,
}: {
  baixas: BaixaDoTituloDto[];
  podeEstornar: boolean;
  onEstornar: (baixa: BaixaDoTituloDto) => void;
}) {
  const pagina = usePaginaLocal(baixas, POR_PAGINA);
  if (baixas.length === 0) {
    return (
      <div className="flex flex-col gap-1 p-4">
        <p className="font-medium">Nenhuma baixa.</p>
        <p className="text-muted-foreground">Os pagamentos registrados aparecem aqui.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col">
      <ul className="divide-y">
        {pagina.itensDaPagina.map((b) => {
          const acrescimos = [
            b.jurosCentavos ? `juros ${moeda(b.jurosCentavos / 100)}` : null,
            b.multaCentavos ? `multa ${moeda(b.multaCentavos / 100)}` : null,
            b.descontoCentavos ? `desconto ${moeda(b.descontoCentavos / 100)}` : null,
          ].filter(Boolean);
          return (
            <li
              key={b.id}
              aria-label={`Baixa de ${formatarDia(b.pagoEm)}`}
              className="flex flex-col gap-1 px-4 py-3 tabular-nums"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-medium">
                    {`${moeda(b.principalCentavos / 100)} em ${formatarDia(b.pagoEm)}`}
                  </span>
                  <span className="text-muted-foreground text-[13px]">
                    {`${ROTULO_FORMA[b.forma] ?? b.forma} · ${b.contaNome}`}
                    {acrescimos.length > 0 && ` · ${acrescimos.join(', ')}`}
                  </span>
                  <span className="text-muted-foreground text-[13px]">
                    {`Movimentado ${moeda(b.valorMovimentadoCentavos / 100)}`}
                    {b.criadoPorNome && ` · por ${b.criadoPorNome}`}
                  </span>
                  {b.observacao && <span className="text-[13px]">{b.observacao}</span>}
                </div>
                {b.estornadaEm ? (
                  <Etiqueta tom="inativo">Estornada</Etiqueta>
                ) : (
                  podeEstornar && (
                    <Button
                      type="button"
                      onClick={() => onEstornar(b)}
                      className={buttonClassName({ variant: 'secondary', className: 'h-8' })}
                    >
                      Estornar…
                    </Button>
                  )
                )}
              </div>
              {b.estornadaEm && (
                <span className="text-muted-foreground text-[13px]">
                  {`Estornada ${dataHoraCurta(b.estornadaEm)}${b.estornadaPorNome ? ` por ${b.estornadaPorNome}` : ''}: ${b.motivoEstorno ?? ''}`}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {pagina.precisaPaginar && (
        <Paginacao
          pagina={pagina.pagina}
          porPagina={pagina.porPagina}
          total={pagina.total}
          onIrPara={pagina.irPara}
        />
      )}
    </div>
  );
}
