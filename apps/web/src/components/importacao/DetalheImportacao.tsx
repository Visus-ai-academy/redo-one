import { Button } from '@base-ui/react/button';
import { DownloadSimple } from '@phosphor-icons/react';
import { type ReactNode, useId, useState } from 'react';

import type { ImportacaoDetalheDto } from '../../gen/types/ImportacaoDetalheDto';
import { dataHoraCurta } from '../../lib/datas';
import { periodoDosLaudos, situacaoDaImportacao } from '../../lib/importacao';
import { Alerta } from '../alerta/Alerta';
import { buttonClassName } from '../button/button-class';
import { Etiqueta } from '../etiqueta/Etiqueta';
import { Paginacao } from '../paginacao/Paginacao';
import { usePaginaLocal } from '../paginacao/use-pagina-local';

const numero = (n: number | null) => (n ?? 0).toLocaleString('pt-BR');

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h3 id={id} className="text-[13px] font-semibold">
        {titulo}
      </h3>
      {children}
    </section>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className="text-right tabular-nums">{children}</dd>
    </div>
  );
}

/** Conteúdo do painel de uma importação: situação, período, resultado e linhas inválidas. */
export function DetalheImportacao({
  importacao: i,
  onBaixar,
}: {
  importacao: ImportacaoDetalheDto;
  /** Presente só para quem pode baixar a planilha (ela traz o nome do paciente). */
  onBaixar?: () => Promise<void>;
}) {
  const situacao = situacaoDaImportacao(i.status);
  const rodando = i.status === 'na_fila' || i.status === 'processando';
  const erros = usePaginaLocal(i.errosLinhas, 5);
  const [baixando, setBaixando] = useState(false);
  const periodo = periodoDosLaudos(i.janelaInicio, i.janelaFim);
  const mobilemed = i.origem === 'mobilemed';

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex flex-col gap-3">
        <span>
          <Etiqueta tom={situacao.tom}>{situacao.texto}</Etiqueta>
        </span>
        {rodando && (
          <Alerta tom="info">
            {i.status === 'na_fila'
              ? 'Na fila para importar.'
              : mobilemed
                ? 'Lendo o relatório da MobileMed.'
                : 'Processando a planilha.'}{' '}
            Esta tela atualiza sozinha.
          </Alerta>
        )}
        {i.status === 'recusada' && <Alerta tom="atencao">{i.mensagem}</Alerta>}
        {i.status === 'erro' && <Alerta tom="erro">{i.mensagem}</Alerta>}
      </div>

      <dl className="divide-y">
        {i.nomeArquivo ? (
          <Campo rotulo="Arquivo">
            <span className="break-all">{i.nomeArquivo}</span>
          </Campo>
        ) : (
          <Campo rotulo="Origem">Relatório da MobileMed</Campo>
        )}
        {i.formato && (
          <Campo rotulo="Relatório">
            {i.formato === 'compartilhamento' ? 'Compartilhamento de exames' : 'Laudos'}
          </Campo>
        )}
        {periodo && <Campo rotulo="Laudos de">{periodo}</Campo>}
        <Campo rotulo={mobilemed ? 'Pedida por' : 'Enviada por'}>
          {i.enviadaPor?.nome ?? (mobilemed ? 'Agendamento automático' : 'Robô da MobileMed')}
        </Campo>
        <Campo rotulo="Enviada em">{dataHoraCurta(i.criadaEm)}</Campo>
        {i.concluidaEm && <Campo rotulo="Terminada em">{dataHoraCurta(i.concluidaEm)}</Campo>}
      </dl>

      {!rodando && i.linhasArquivo !== null && (
        <Secao titulo="Resultado">
          <dl className="divide-y">
            <Campo rotulo={mobilemed ? 'Linhas no relatório' : 'Linhas na planilha'}>
              {numero(i.linhasArquivo)}
            </Campo>
            <Campo rotulo="Laudos novos">{numero(i.inseridos)}</Campo>
            <Campo rotulo="Laudos alterados">{numero(i.atualizados)}</Campo>
            <Campo rotulo="Sem mudança">{numero(i.inalterados)}</Campo>
            <Campo rotulo="Removidos da janela">{numero(i.removidos)}</Campo>
            <Campo rotulo="Linhas inválidas">{numero(i.invalidas)}</Campo>
            {(i.ignoradasCompetenciaFechada ?? 0) > 0 && (
              <Campo rotulo="Fora por competência fechada">
                {numero(i.ignoradasCompetenciaFechada)}
              </Campo>
            )}
          </dl>
        </Secao>
      )}

      {i.errosLinhas.length > 0 && (
        <Secao titulo="Linhas que não entraram">
          <div className="rounded-lg border">
            <ul className="divide-y">
              {erros.itensDaPagina.map((e) => (
                <li key={e.linha} className="flex flex-col gap-0.5 px-3 py-2">
                  <span className="font-medium tabular-nums">Linha {e.linha}</span>
                  <span className="text-muted-foreground text-[13px] break-words">
                    {e.mensagem}
                  </span>
                </li>
              ))}
            </ul>
            {erros.precisaPaginar && (
              <Paginacao
                pagina={erros.pagina}
                porPagina={erros.porPagina}
                total={erros.total}
                onIrPara={erros.irPara}
              />
            )}
          </div>
          {(i.invalidas ?? 0) > i.errosLinhas.length && (
            <p className="text-muted-foreground text-[13px]">
              Ficam guardadas as {i.errosLinhas.length} primeiras de {numero(i.invalidas)}.
            </p>
          )}
        </Secao>
      )}

      {onBaixar && i.nomeArquivo && (
        <div>
          <Button
            type="button"
            disabled={baixando}
            onClick={async () => {
              setBaixando(true);
              try {
                await onBaixar();
              } finally {
                setBaixando(false);
              }
            }}
            className={buttonClassName({ variant: 'secondary' })}
          >
            <DownloadSimple size={16} aria-hidden />
            {baixando ? 'Preparando…' : 'Baixar planilha'}
          </Button>
        </div>
      )}
    </div>
  );
}
