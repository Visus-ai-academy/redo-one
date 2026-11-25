import { type ReactNode, useId } from 'react';

import { dataDeBrasilia } from '../../lib/datas';
import { AjudaContextual } from '../ajuda/AjudaContextual';
import { ConfirmarAcao } from '../confirmacao/ConfirmarAcao';
import { Etiqueta } from '../etiqueta/Etiqueta';
import { Paginacao } from '../paginacao/Paginacao';
import { usePaginaLocal } from '../paginacao/use-pagina-local';
import { mesAno } from './competencias';
import { textoDaVigencia } from './precos';

/** Uma versão com vigência por competência e quem a criou e encerrou (da auditoria). */
export type VersaoComAutoria = {
  id: string;
  vigenciaDesde: string;
  vigenciaAte: string | null;
  criadoPor: string | null;
  criadoEm: string | null;
  encerradoPor: string | null;
  encerradoEm: string | null;
};

export type HistoricoVigenciasProps<V extends VersaoComAutoria> = {
  /** Da mais nova para a mais antiga, como a API devolve. */
  versoes: V[];
  mesAtual: string;
  /** O que a versão diz (a configuração, "Fatura"...). */
  descrever: (v: V) => ReactNode;
  /** Vazio da lista. */
  vazio: string;
  /** Nível do título: 3 sob o título da página, 4 dentro de uma aba ou painel. */
  nivelTitulo?: 3 | 4;
  /** 10 numa página, 5 num painel lateral. */
  porPagina?: number;
  /** Com permissão: apagar a versão programada (a anterior volta a valer). */
  onExcluir?: (v: V) => Promise<void>;
};

const programada = (v: VersaoComAutoria, mesAtual: string) => v.vigenciaDesde > mesAtual;
const emVigor = (v: VersaoComAutoria, mesAtual: string) =>
  v.vigenciaDesde <= mesAtual && (v.vigenciaAte === null || v.vigenciaAte >= mesAtual);

/**
 * "Histórico de vigências", no estilo do editor de corte: cada versão com o período, se está em
 * vigor ou programada, o que diz e quem criou e encerrou. Só a programada pode ser excluída.
 */
export function HistoricoVigencias<V extends VersaoComAutoria>({
  versoes,
  mesAtual,
  descrever,
  vazio,
  nivelTitulo = 4,
  porPagina = 5,
  onExcluir,
}: HistoricoVigenciasProps<V>) {
  const id = useId();
  const Titulo = nivelTitulo === 3 ? 'h3' : 'h4';
  const paginacao = usePaginaLocal(versoes, porPagina);
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <Titulo
        id={id}
        className="text-subtle-foreground flex items-center gap-1 text-[13px] font-medium"
      >
        Histórico de vigências
        <AjudaContextual assunto="o histórico de vigências">
          Toda mudança vale a partir de uma competência aberta ou futura: encerra a versão anterior
          e cria outra. Nada se apaga, salvo a versão programada que nunca valeu.
        </AjudaContextual>
      </Titulo>
      {versoes.length === 0 ? (
        <p className="text-muted-foreground">{vazio}</p>
      ) : (
        <>
          <ul className="flex flex-col divide-y rounded-md border">
            {paginacao.itensDaPagina.map((v) => (
              <li
                key={v.id}
                aria-label={`A partir de ${mesAno(v.vigenciaDesde)}`}
                className="flex flex-col gap-1 px-3 py-2"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium tabular-nums">
                    {textoDaVigencia(v.vigenciaDesde, v.vigenciaAte)}
                  </span>
                  {emVigor(v, mesAtual) && <Etiqueta tom="sucesso">Em vigor</Etiqueta>}
                  {programada(v, mesAtual) && <Etiqueta tom="info">Programada</Etiqueta>}
                </span>
                <div className="text-[13px]">{descrever(v)}</div>
                <span className="text-muted-foreground text-[13px] tabular-nums">
                  {v.criadoEm
                    ? `Criada em ${dataDeBrasilia(v.criadoEm)}${v.criadoPor ? ` por ${v.criadoPor}` : ''}`
                    : 'Veio da carga do dashboards-one'}
                  {v.encerradoEm &&
                    `; encerrada em ${dataDeBrasilia(v.encerradoEm)}${v.encerradoPor ? ` por ${v.encerradoPor}` : ''}`}
                </span>
                {onExcluir && programada(v, mesAtual) && (
                  <span className="self-start">
                    <ConfirmarAcao
                      acao="Excluir versão programada"
                      titulo={`Excluir a versão de ${mesAno(v.vigenciaDesde)}?`}
                      consequencia="Ela nunca valeu: some do histórico, e a versão anterior volta a valer no lugar dela."
                      onConfirmar={() => onExcluir(v)}
                    />
                  </span>
                )}
              </li>
            ))}
          </ul>
          {paginacao.precisaPaginar && (
            <Paginacao
              pagina={paginacao.pagina}
              porPagina={paginacao.porPagina}
              total={paginacao.total}
              onIrPara={paginacao.irPara}
            />
          )}
        </>
      )}
    </section>
  );
}
