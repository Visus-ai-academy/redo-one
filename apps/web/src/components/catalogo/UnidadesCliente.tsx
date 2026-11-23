import { Button } from '@base-ui/react/button';
import { Field } from '@base-ui/react/field';
import { X } from '@phosphor-icons/react';
import { useId, useState } from 'react';

import type { ClienteRefDto } from '../../gen/types/ClienteRefDto';
import { Alerta } from '../alerta/Alerta';
import { mensagemDaApi } from '../alerta/mensagem-da-api';
import { BuscaSelecao, type OpcaoBusca } from '../busca/BuscaSelecao';
import { buttonClassName } from '../button/button-class';
import { Paginacao } from '../paginacao/Paginacao';
import { usePaginaLocal } from '../paginacao/use-pagina-local';

/** Num painel lateral, 5 por página. */
const POR_PAGINA = 5;

export type UnidadesClienteProps = {
  /** Cliente principal, quando este é unidade. */
  unificadoEm: ClienteRefDto | null;
  unidades: ClienteRefDto[];
  /** Busca clientes para unificar (sem o próprio). */
  buscarClientes: (termo: string, sinal?: AbortSignal) => Promise<OpcaoBusca[]>;
  /** Unificar (POST). */
  podeCriar: boolean;
  /** Desfazer a unificação (DELETE). */
  podeExcluir: boolean;
  onAdicionar: (clienteId: string) => Promise<void>;
  /** Desfaz a unificação de uma unidade deste principal. */
  onRemover: (unidadeId: string) => Promise<void>;
  /** Desfaz a unificação deste cliente (quando ele é a unidade). */
  onDesfazer: () => Promise<void>;
  /** Abre o painel de outro cliente (principal ou unidade). */
  onAbrir: (id: string) => void;
};

const linkClassName =
  'focus-visible:outline-ring rounded-sm font-medium underline-offset-2 hover:underline focus-visible:outline-2';

/**
 * Unificação no painel do cliente: no principal, as unidades que respondem por ele (com unificar e
 * desfazer); na unidade, de quem ela é. Unidade não tem unidades, então ela não unifica ninguém.
 */
export function UnidadesCliente({
  unificadoEm,
  unidades,
  buscarClientes,
  podeCriar,
  podeExcluir,
  onAdicionar,
  onRemover,
  onDesfazer,
  onAbrir,
}: UnidadesClienteProps) {
  const tituloId = useId();
  const [erro, setErro] = useState<string>();
  // Remonta a busca depois de cada escolha: o campo volta vazio para a próxima.
  const [rodada, setRodada] = useState(0);
  const pagina = usePaginaLocal(unidades, POR_PAGINA);

  const tentar = async (acao: () => Promise<void>, padrao: string) => {
    setErro(undefined);
    try {
      await acao();
    } catch (falha) {
      setErro(mensagemDaApi(falha, padrao));
    }
  };

  return (
    <section aria-labelledby={tituloId} className="flex flex-col gap-3 border-t p-4">
      <div className="flex flex-col gap-1">
        <h3 id={tituloId} className="text-base font-semibold">
          Unidades
        </h3>
        <p className="text-muted-foreground text-[13px]">
          Clientes que respondem por este, com um contrato só: os laudos deles vêm para cá.
        </p>
      </div>
      {erro && <Alerta tom="erro">{erro}</Alerta>}

      {unificadoEm ? (
        <div className="flex flex-col items-start gap-3">
          <Alerta tom="info" role="note">
            Os laudos deste cliente são do{' '}
            <Button type="button" onClick={() => onAbrir(unificadoEm.id)} className={linkClassName}>
              {unificadoEm.nome}
            </Button>
            , que fatura por ele.
          </Alerta>
          {podeExcluir && (
            <Button
              type="button"
              onClick={() => tentar(onDesfazer, 'Não foi possível desfazer agora. Tente de novo.')}
              className={buttonClassName({ variant: 'secondary' })}
            >
              Desfazer unificação
            </Button>
          )}
        </div>
      ) : (
        <>
          {unidades.length === 0 ? (
            <p className="text-muted-foreground">Nenhuma unidade: o cliente fatura sozinho.</p>
          ) : (
            <ul aria-labelledby={tituloId} className="flex flex-col divide-y rounded-md border">
              {pagina.itensDaPagina.map((unidade) => (
                <li key={unidade.id} className="flex min-h-10 items-center gap-3 px-3 py-1">
                  <span className="min-w-0 flex-1 truncate">
                    <Button
                      type="button"
                      onClick={() => onAbrir(unidade.id)}
                      className={linkClassName}
                    >
                      {unidade.nome}
                    </Button>
                  </span>
                  {podeExcluir && (
                    <Button
                      type="button"
                      aria-label={`Desfazer a unificação de ${unidade.nome}`}
                      onClick={() =>
                        tentar(
                          () => onRemover(unidade.id),
                          'Não foi possível desfazer agora. Tente de novo.',
                        )
                      }
                      className={buttonClassName({
                        variant: 'ghost',
                        className: 'text-muted-foreground size-8 flex-none px-0',
                      })}
                    >
                      <X size={16} aria-hidden />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {pagina.precisaPaginar && (
            <div className="-mx-4">
              <Paginacao
                pagina={pagina.pagina}
                porPagina={pagina.porPagina}
                total={pagina.total}
                onIrPara={pagina.irPara}
              />
            </div>
          )}
          {podeCriar && (
            <Field.Root className="flex flex-col gap-2">
              <Field.Label className="text-foreground font-medium">Unificar cliente</Field.Label>
              <BuscaSelecao
                key={rodada}
                chave="unificar-cliente"
                buscar={buscarClientes}
                valor={null}
                onMudar={(opcao) => {
                  if (!opcao) return;
                  setRodada((n) => n + 1);
                  void tentar(
                    () => onAdicionar(opcao.valor),
                    'Não foi possível unificar agora. Tente de novo.',
                  );
                }}
                placeholder="Nome do cliente que vira unidade"
              />
            </Field.Root>
          )}
        </>
      )}
    </section>
  );
}
