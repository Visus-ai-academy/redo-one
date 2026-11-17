import { Button } from '@base-ui/react/button';
import { Trash } from '@phosphor-icons/react';
import { useId, useState } from 'react';
import { z } from 'zod';

import { Alerta } from '../alerta/Alerta';
import { mensagemDaApi } from '../alerta/mensagem-da-api';
import { buttonClassName } from '../button/button-class';
import { Etiqueta } from '../etiqueta/Etiqueta';
import { useAppForm } from '../form/form';
import { Paginacao } from '../paginacao/Paginacao';
import { usePaginaLocal } from '../paginacao/use-pagina-local';

/** Num painel lateral, 5 por página. */
const POR_PAGINA = 5;

export type Variacao = { id: string; origem: string; ativo: boolean; tipo?: string };
export type TipoVariacao = { valor: string; rotulo: string; ajuda: string };

export type VariacoesFormaProps = {
  /** A forma certa (ex.: "URGÊNCIA"), para os textos. */
  forma: string;
  variacoes: Variacao[];
  /** Tipos da variação (na especialidade: grafia ou região anatômica); sem tipos, não pergunta. */
  tipos?: TipoVariacao[];
  podeCriar: boolean;
  podeExcluir: boolean;
  onAdicionar: (dados: { origem: string; tipo?: string }) => Promise<void>;
  onRemover: (id: string) => Promise<void>;
};

/**
 * Variações de uma forma certa: como o mesmo valor chega da MobileMed (com e sem acento, pela
 * volumetria e pela fila, ou com outro nome). A importação traduz cada uma para a forma certa.
 */
export function VariacoesForma({
  forma,
  variacoes,
  tipos,
  podeCriar,
  podeExcluir,
  onAdicionar,
  onRemover,
}: VariacoesFormaProps) {
  const tituloId = useId();
  const [erro, setErro] = useState<string>();
  const pagina = usePaginaLocal(variacoes, POR_PAGINA);
  const rotuloTipo = (tipo?: string) => tipos?.find((t) => t.valor === tipo)?.rotulo;

  const form = useAppForm({
    defaultValues: { tipo: tipos?.[0]?.valor ?? '', origem: '' },
    validators: {
      onSubmit: z.object({
        tipo: z.string(),
        origem: z.string().trim().min(1, 'Informe o valor como chega da MobileMed.'),
      }),
    },
    onSubmit: async ({ value, formApi }) => {
      setErro(undefined);
      try {
        await onAdicionar({
          origem: value.origem.trim(),
          ...(tipos ? { tipo: value.tipo } : {}),
        });
        formApi.reset({ tipo: value.tipo, origem: '' });
      } catch (falha) {
        setErro(mensagemDaApi(falha, 'Não foi possível adicionar agora. Tente de novo.'));
      }
    },
  });

  return (
    <section aria-labelledby={tituloId} className="flex flex-col gap-3 border-t p-4">
      <div className="flex flex-col gap-1">
        <h3 id={tituloId} className="text-base font-semibold">
          Variações
        </h3>
        <p className="text-muted-foreground text-[13px]">
          Como {forma} chega da MobileMed. A importação traduz cada variação para {forma}.
        </p>
      </div>
      {erro && <Alerta tom="erro">{erro}</Alerta>}
      {variacoes.length === 0 ? (
        <p className="text-muted-foreground">
          Nenhuma variação: só chega escrito exatamente como {forma}.
        </p>
      ) : (
        <ul
          aria-label="Variações que chegam da MobileMed"
          className="flex flex-col divide-y rounded-md border"
        >
          {pagina.itensDaPagina.map((v) => (
            <li key={v.id} className="flex min-h-10 items-center gap-3 px-3 py-1">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{v.origem}</span>
                {rotuloTipo(v.tipo) && (
                  <span className="text-muted-foreground text-[13px]">{rotuloTipo(v.tipo)}</span>
                )}
              </span>
              {!v.ativo && <Etiqueta tom="inativo">Inativa</Etiqueta>}
              {podeExcluir && (
                <Button
                  type="button"
                  aria-label={`Remover variação ${v.origem}`}
                  onClick={async () => {
                    setErro(undefined);
                    try {
                      await onRemover(v.id);
                    } catch (falha) {
                      setErro(
                        mensagemDaApi(falha, 'Não foi possível remover agora. Tente de novo.'),
                      );
                    }
                  }}
                  className={buttonClassName({
                    variant: 'ghost',
                    className: 'text-muted-foreground size-9 flex-none px-0',
                  })}
                >
                  <Trash size={16} aria-hidden />
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
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
          className="flex flex-col gap-3"
        >
          {tipos && (
            <form.Subscribe selector={(estado) => estado.values.tipo}>
              {(tipo) => (
                <form.AppField name="tipo">
                  {(field) => (
                    <field.SelectField
                      label="Tipo da variação"
                      placeholder="Escolha o tipo"
                      description={tipos.find((t) => t.valor === tipo)?.ajuda}
                      opcoes={tipos.map((t) => ({ valor: t.valor, rotulo: t.rotulo }))}
                    />
                  )}
                </form.AppField>
              )}
            </form.Subscribe>
          )}
          <form.AppField name="origem">
            {(field) => (
              <field.TextField
                label="Nova variação"
                placeholder="Como chega da MobileMed"
                autoComplete="off"
              />
            )}
          </form.AppField>
          <form.AppForm>
            <form.SubmitButton
              pendingLabel="Adicionando…"
              variant="secondary"
              className="self-start"
            >
              Adicionar variação
            </form.SubmitButton>
          </form.AppForm>
        </form>
      )}
    </section>
  );
}
