import { Combobox } from '@base-ui/react/combobox';
import { Field } from '@base-ui/react/field';
import { Check, X } from '@phosphor-icons/react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { cn } from '../../lib/cn';
import type { OpcaoBusca } from '../busca/BuscaSelecao';
import { useFieldContext } from './context';
import { FieldError, FieldLabel } from './field-parts';
import { useCampo } from './use-campo';

const ESPERA_MS = 300;

// Mesmo contorno do `EtiquetasField`: os escolhidos são chips dentro do campo, com a busca ao lado.
// Muitos escolhidos rolam por dentro do campo em vez de empurrar o formulário.
const classeCaixa = cn(
  'border-input bg-card text-foreground flex max-h-32 min-h-9 w-full cursor-text flex-wrap items-center gap-1 overflow-y-auto rounded-md border px-1.5 py-1',
  'focus-within:outline-ring focus-within:outline-2 focus-within:outline-offset-2',
  'has-[[aria-invalid=true]]:border-destructive',
);
const classeChip =
  'bg-muted text-foreground flex h-6 max-w-full min-w-0 items-center gap-1 rounded-sm pr-0.5 pl-2 text-[13px] outline-none focus-visible:outline-ring focus-visible:outline-2 data-[highlighted]:bg-accent';
const classeRemover =
  'text-muted-foreground hover:bg-background hover:text-foreground flex size-5 flex-none cursor-pointer items-center justify-center rounded-sm';
const classePopup =
  'bg-popover text-popover-foreground origin-(--transform-origin) max-h-[min(var(--available-height),320px)] w-[var(--anchor-width)] max-w-[var(--available-width)] overflow-y-auto overscroll-contain rounded-lg border p-1 shadow-lg transition-[opacity,scale] duration-150 ease-out data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 motion-reduce:transition-none';
const classeItem =
  'data-[highlighted]:bg-muted grid min-h-9 cursor-pointer grid-cols-[16px_1fr_auto] items-center gap-2 rounded-md px-2 py-1.5 outline-none';

type BuscaMultiplaFieldProps = {
  label: string;
  placeholder: string;
  /** Identifica a consulta no cache (ex.: `clientes`). */
  chave: string;
  /** Repasse o `sinal` ao cliente da API: a busca anterior é cancelada. */
  buscar: (termo: string, sinal?: AbortSignal) => Promise<OpcaoBusca[]>;
  required?: boolean;
  description?: string;
  className?: string;
};

/**
 * Vários itens de uma lista grande que só se acha buscando (clientes, exames): um campo só, com os
 * escolhidos como chips removíveis e a busca no mesmo contorno (Combobox múltiplo do Base UI). A
 * API devolve poucos resultados para o termo digitado. O valor do campo é a lista de opções.
 */
export function BuscaMultiplaField({
  label,
  placeholder,
  chave,
  buscar,
  required = false,
  description,
  className,
}: BuscaMultiplaFieldProps) {
  const field = useFieldContext<OpcaoBusca[]>();
  const { erros, invalido, aoSair, ref } = useCampo(field);
  const escolhidos = field.state.value ?? [];
  const [texto, setTexto] = useState('');
  const [termo, setTermo] = useState('');

  // Busca só depois de uma pausa na digitação; o que a pessoa vê no campo muda na hora.
  useEffect(() => {
    const espera = setTimeout(() => setTermo(texto.trim()), ESPERA_MS);
    return () => clearTimeout(espera);
  }, [texto]);

  const procurando = termo !== '';
  const { data: resultados = [], isFetching } = useQuery({
    queryKey: ['busca-multipla', chave, termo],
    queryFn: ({ signal }) => buscar(termo, signal),
    enabled: procurando,
    placeholderData: keepPreviousData,
  });

  return (
    <Field.Root
      ref={ref}
      name={field.name}
      invalid={invalido}
      touched={field.state.meta.isTouched}
      className={cn('flex flex-col gap-2', className)}
    >
      <FieldLabel required={required}>{label}</FieldLabel>
      <Combobox.Root
        multiple
        items={procurando ? resultados : []}
        filter={null}
        value={escolhidos}
        onValueChange={(novos, detalhes) => {
          // O Base UI limpa tudo com Esc no campo fechado: aqui seriam dezenas de escolhas perdidas
          // num toque. O Esc segue adiante (fecha o painel, como em qualquer campo).
          if (detalhes.reason === 'escape-key') {
            detalhes.allowPropagation();
            return;
          }
          field.handleChange([...(novos as OpcaoBusca[])]);
          setTexto('');
          setTermo('');
        }}
        inputValue={texto}
        onInputValueChange={setTexto}
        itemToStringLabel={(opcao: OpcaoBusca) => opcao.rotulo}
        isItemEqualToValue={(a: OpcaoBusca, b: OpcaoBusca) => a.valor === b.valor}
        required={required}
      >
        <Combobox.InputGroup className={classeCaixa}>
          <Combobox.Chips className="contents">
            {escolhidos.map((opcao) => (
              <Combobox.Chip key={opcao.valor} className={classeChip}>
                <span className="truncate">{opcao.rotulo}</span>
                <Combobox.ChipRemove
                  aria-label={`Remover ${opcao.rotulo}`}
                  className={classeRemover}
                >
                  <X size={12} aria-hidden />
                </Combobox.ChipRemove>
              </Combobox.Chip>
            ))}
            <Combobox.Input
              placeholder={escolhidos.length ? 'Adicionar…' : placeholder}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={invalido || undefined}
              onBlur={aoSair}
              className="placeholder:text-subtle-foreground h-7 min-w-32 flex-1 bg-transparent px-1.5 text-base outline-none sm:text-sm"
            />
          </Combobox.Chips>
        </Combobox.InputGroup>
        <Combobox.Portal>
          <Combobox.Positioner sideOffset={4} align="start" className="z-50 outline-none">
            <Combobox.Popup className={classePopup}>
              <Combobox.Empty className="text-muted-foreground px-2 py-1.5 text-[13px] empty:hidden">
                {procurando && !isFetching && `Nada encontrado para “${termo}”.`}
                {!procurando && 'Digite parte do nome para buscar.'}
              </Combobox.Empty>
              <Combobox.List>
                {(opcao: OpcaoBusca) => (
                  <Combobox.Item key={opcao.valor} value={opcao} className={classeItem}>
                    <Combobox.ItemIndicator className="col-start-1">
                      <Check size={16} aria-hidden />
                    </Combobox.ItemIndicator>
                    <span className="col-start-2 truncate">{opcao.rotulo}</span>
                    {opcao.detalhe && (
                      <span className="text-subtle-foreground col-start-3 text-[13px]">
                        {opcao.detalhe}
                      </span>
                    )}
                  </Combobox.Item>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
      {description && (
        <Field.Description className="text-muted-foreground text-[13px]">
          {description}
        </Field.Description>
      )}
      <FieldError invalid={invalido}>{erros.join(', ')}</FieldError>
    </Field.Root>
  );
}
