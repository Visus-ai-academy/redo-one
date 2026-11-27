import { Button } from '@base-ui/react/button';
import { Field } from '@base-ui/react/field';
import { Fieldset } from '@base-ui/react/fieldset';
import { X } from '@phosphor-icons/react';
import { useId, useState } from 'react';

import { cn } from '../../lib/cn';
import { BuscaSelecao, type OpcaoBusca } from '../busca/BuscaSelecao';
import { buttonClassName } from '../button/button-class';
import { Paginacao } from '../paginacao/Paginacao';
import { usePaginaLocal } from '../paginacao/use-pagina-local';
import { useFieldContext } from './context';
import { FieldError } from './field-parts';
import { useCampo } from './use-campo';

/** Num painel lateral, 5 por página (regra das listas dentro de painel). */
const POR_PAGINA = 5;

type EscolhaMultiplaFieldProps = {
  /** Nome da lista (ex.: "Membros"). */
  label: string;
  /** Rótulo da busca que adiciona (ex.: "Adicionar médico"). */
  rotuloAdicionar: string;
  placeholder: string;
  chave: string;
  /** Repasse o `sinal` ao cliente da API: a busca anterior é cancelada. */
  buscar: (termo: string, sinal?: AbortSignal) => Promise<OpcaoBusca[]>;
  /** O que dizer com a lista vazia. */
  vazio: string;
  description?: string;
  /** Ajuda abaixo da busca (ex.: "Escolha um ou vários: cada médico ganha a sua ausência."). */
  descricaoDaBusca?: string;
  somenteLeitura?: boolean;
  required?: boolean;
  className?: string;
};

/**
 * Vários itens de uma lista grande (ex.: os médicos de uma equipe): busca para adicionar e a lista
 * dos escolhidos, paginada, com remover. O valor do campo é a lista de opções escolhidas.
 */
export function EscolhaMultiplaField({
  label,
  rotuloAdicionar,
  placeholder,
  chave,
  buscar,
  vazio,
  description,
  descricaoDaBusca,
  somenteLeitura = false,
  required = false,
  className,
}: EscolhaMultiplaFieldProps) {
  const field = useFieldContext<OpcaoBusca[]>();
  const { erros, invalido, aoSair, ref } = useCampo(field);
  const tituloId = useId();
  // Remonta a busca depois de cada escolha: o campo volta vazio para a próxima.
  const [rodada, setRodada] = useState(0);
  const escolhidos = field.state.value;
  const pagina = usePaginaLocal(escolhidos, POR_PAGINA);

  const remover = (valor: string) => {
    field.handleChange(escolhidos.filter((item) => item.valor !== valor));
    aoSair();
  };

  return (
    <Fieldset.Root className={cn('flex flex-col gap-2', className)}>
      <Fieldset.Legend id={tituloId} className="text-foreground font-medium">
        {label}
        {required && (
          <span aria-hidden="true" className="text-destructive ml-1">
            *
          </span>
        )}
      </Fieldset.Legend>
      {description && <p className="text-muted-foreground -mt-1 text-[13px]">{description}</p>}
      {escolhidos.length === 0 ? (
        <p className="text-muted-foreground">{vazio}</p>
      ) : (
        <ul aria-labelledby={tituloId} className="flex flex-col divide-y rounded-md border">
          {pagina.itensDaPagina.map((item) => (
            <li key={item.valor} className="flex min-h-10 items-center gap-3 px-3 py-1">
              <span className="min-w-0 flex-1 truncate">{item.rotulo}</span>
              {!somenteLeitura && (
                <Button
                  type="button"
                  aria-label={`Remover ${item.rotulo}`}
                  onClick={() => remover(item.valor)}
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
        <Paginacao
          pagina={pagina.pagina}
          porPagina={pagina.porPagina}
          total={pagina.total}
          onIrPara={pagina.irPara}
        />
      )}
      {!somenteLeitura && (
        // O `ref` aqui: o envio com erro põe o foco na busca.
        <Field.Root ref={ref} name={field.name} invalid={invalido} className="flex flex-col gap-2">
          <Field.Label className="text-muted-foreground text-[13px]">{rotuloAdicionar}</Field.Label>
          <BuscaSelecao
            key={rodada}
            chave={chave}
            buscar={buscar}
            valor={null}
            aria-invalid={invalido || undefined}
            onMudar={(opcao) => {
              if (!opcao) return;
              if (!escolhidos.some((item) => item.valor === opcao.valor)) {
                field.handleChange([...escolhidos, opcao]);
              }
              aoSair();
              setRodada((n) => n + 1);
            }}
            placeholder={placeholder}
          />
          {descricaoDaBusca && (
            <Field.Description className="text-muted-foreground text-[13px]">
              {descricaoDaBusca}
            </Field.Description>
          )}
          <FieldError invalid={invalido}>{erros.join(', ')}</FieldError>
        </Field.Root>
      )}
      {somenteLeitura && erros.length > 0 && (
        <p role="alert" className="text-destructive text-[13px]">
          {erros.join(', ')}
        </p>
      )}
    </Fieldset.Root>
  );
}
