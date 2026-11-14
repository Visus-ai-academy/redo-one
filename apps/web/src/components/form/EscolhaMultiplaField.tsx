import { X } from '@phosphor-icons/react';
import { useId, useState } from 'react';

import { cn } from '../../lib/cn';
import { BuscaSelecao, type OpcaoBusca } from '../busca/BuscaSelecao';
import { buttonClassName } from '../button/button-class';
import { Paginacao } from '../paginacao/Paginacao';
import { usePaginaLocal } from '../paginacao/use-pagina-local';
import { useFieldContext } from './context';

/** Num painel lateral, 5 por página (regra das listas dentro de painel). */
const POR_PAGINA = 5;

type EscolhaMultiplaFieldProps = {
  /** Nome da lista (ex.: "Membros"). */
  label: string;
  /** Rótulo da busca que adiciona (ex.: "Adicionar médico"). */
  rotuloAdicionar: string;
  placeholder: string;
  chave: string;
  buscar: (termo: string) => Promise<OpcaoBusca[]>;
  /** O que dizer com a lista vazia. */
  vazio: string;
  description?: string;
  somenteLeitura?: boolean;
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
  somenteLeitura = false,
  className,
}: EscolhaMultiplaFieldProps) {
  const field = useFieldContext<OpcaoBusca[]>();
  const tituloId = useId();
  const buscaId = useId();
  const ajudaId = useId();
  // Remonta a busca depois de cada escolha: o campo volta vazio para a próxima.
  const [rodada, setRodada] = useState(0);
  const escolhidos = field.state.value;
  const pagina = usePaginaLocal(escolhidos, POR_PAGINA);

  const remover = (valor: string) =>
    field.handleChange(escolhidos.filter((item) => item.valor !== valor));

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <span id={tituloId} className="text-foreground font-medium">
        {label}
      </span>
      {description && (
        <span id={ajudaId} className="text-muted-foreground -mt-1 text-[13px]">
          {description}
        </span>
      )}
      {escolhidos.length === 0 ? (
        <p className="text-muted-foreground">{vazio}</p>
      ) : (
        <ul aria-labelledby={tituloId} className="flex flex-col divide-y rounded-md border">
          {pagina.itensDaPagina.map((item) => (
            <li key={item.valor} className="flex min-h-10 items-center gap-3 px-3 py-1">
              <span className="min-w-0 flex-1 truncate">{item.rotulo}</span>
              {!somenteLeitura && (
                <button
                  type="button"
                  aria-label={`Remover ${item.rotulo}`}
                  onClick={() => remover(item.valor)}
                  className={buttonClassName({
                    variant: 'ghost',
                    className: 'text-muted-foreground size-8 flex-none px-0',
                  })}
                >
                  <X size={16} aria-hidden />
                </button>
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
        <div className="flex flex-col gap-2">
          <label htmlFor={buscaId} className="text-muted-foreground text-[13px]">
            {rotuloAdicionar}
          </label>
          <BuscaSelecao
            key={rodada}
            id={buscaId}
            chave={chave}
            buscar={buscar}
            valor={null}
            onMudar={(opcao) => {
              if (!opcao) return;
              if (!escolhidos.some((item) => item.valor === opcao.valor)) {
                field.handleChange([...escolhidos, opcao]);
              }
              setRodada((n) => n + 1);
            }}
            placeholder={placeholder}
            aria-describedby={description ? ajudaId : undefined}
          />
        </div>
      )}
    </div>
  );
}
