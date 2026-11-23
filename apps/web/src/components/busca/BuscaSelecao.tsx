import { Combobox } from '@base-ui/react/combobox';
import { X } from '@phosphor-icons/react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { cn } from '../../lib/cn';
import { controlClassName } from '../form/control-class';

export type OpcaoBusca = {
  valor: string;
  rotulo: string;
  /** Texto menor à direita (ex.: a modalidade do exame). */
  detalhe?: string | null;
};

type BuscaSelecaoProps = {
  /** Identifica a consulta no cache (ex.: `exames`). */
  chave: string;
  /**
   * Resultados para o termo digitado (a API devolve poucos, já filtrados). Repasse o `sinal` à
   * chamada da API: a busca anterior é cancelada quando a pessoa digita mais.
   */
  buscar: (termo: string, sinal?: AbortSignal) => Promise<OpcaoBusca[]>;
  valor: OpcaoBusca | null;
  onMudar: (opcao: OpcaoBusca | null) => void;
  placeholder: string;
  /** Liga a um <label htmlFor> externo. */
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  className?: string;
};

const ESPERA_MS = 300;

/**
 * Escolha de um item numa lista grande (ex.: ~1.100 exames): a pessoa digita e a API devolve os
 * que casam. Mesmo visual do `Select`; use quando a lista não cabe num select.
 */
export function BuscaSelecao({
  chave,
  buscar,
  valor,
  onMudar,
  placeholder,
  id,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  className,
}: BuscaSelecaoProps) {
  const [texto, setTexto] = useState(valor?.rotulo ?? '');
  const [termo, setTermo] = useState('');

  // Busca só depois de uma pausa na digitação; o que a pessoa vê no campo muda na hora.
  useEffect(() => {
    const espera = setTimeout(() => setTermo(texto.trim()), ESPERA_MS);
    return () => clearTimeout(espera);
  }, [texto]);

  const procurando = termo !== '' && termo !== valor?.rotulo;
  const { data: resultados = [], isFetching } = useQuery({
    queryKey: ['busca-selecao', chave, termo],
    // Termo novo é outra chave: resposta de busca velha nunca aparece no lugar da nova.
    queryFn: ({ signal }) => buscar(termo, signal),
    enabled: procurando,
    placeholderData: keepPreviousData,
  });

  return (
    <Combobox.Root
      items={procurando ? resultados : valor ? [valor] : []}
      filter={null}
      value={valor}
      onValueChange={(opcao) => {
        onMudar((opcao as OpcaoBusca | null) ?? null);
        setTexto((opcao as OpcaoBusca | null)?.rotulo ?? '');
      }}
      inputValue={texto}
      onInputValueChange={setTexto}
      itemToStringLabel={(opcao: OpcaoBusca) => opcao.rotulo}
      isItemEqualToValue={(a: OpcaoBusca, b: OpcaoBusca) => a.valor === b.valor}
    >
      <div className={cn('relative', className)}>
        <Combobox.Input
          id={id}
          placeholder={placeholder}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid || undefined}
          autoComplete="off"
          spellCheck={false}
          className={controlClassName('app', 'aria-invalid:border-destructive pr-9')}
        />
        {valor && (
          <Combobox.Clear
            aria-label="Limpar"
            className="text-muted-foreground hover:bg-muted focus-visible:outline-ring absolute top-1 right-1 flex size-7 items-center justify-center rounded-md focus-visible:outline-2"
          >
            <X size={16} aria-hidden />
          </Combobox.Clear>
        )}
      </div>
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} className="z-50 outline-none">
          <Combobox.Popup className="bg-popover text-popover-foreground max-h-[min(var(--available-height),320px)] w-[var(--anchor-width)] origin-(--transform-origin) overflow-y-auto rounded-lg border p-1 shadow-lg transition-[opacity,scale] duration-150 ease-out data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 motion-reduce:transition-none">
            <Combobox.Empty className="text-muted-foreground px-2 py-2 text-[13px] empty:hidden">
              {procurando && !isFetching && `Nada encontrado para “${termo}”.`}
              {!procurando && 'Digite parte do nome para buscar.'}
            </Combobox.Empty>
            <Combobox.List>
              {(opcao: OpcaoBusca) => (
                <Combobox.Item
                  key={opcao.valor}
                  value={opcao}
                  className="data-[highlighted]:bg-muted flex h-9 items-center justify-between gap-3 rounded-md px-2 outline-none"
                >
                  <span className="truncate">{opcao.rotulo}</span>
                  {opcao.detalhe && (
                    <span className="text-subtle-foreground flex-none text-[13px]">
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
  );
}
