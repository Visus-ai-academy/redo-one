import { Button } from '@base-ui/react/button';
import { Field } from '@base-ui/react/field';
import { X } from '@phosphor-icons/react';
import { type ReactNode, useId, useState } from 'react';

import { cn } from '../../lib/cn';
import { BuscaSelecao, type OpcaoBusca } from '../busca/BuscaSelecao';
import { useFieldContext } from './context';
import { FieldError } from './field-parts';
import { useCampo } from './use-campo';

/**
 * Vários itens de uma lista grande que vem da API por busca (clientes, médicos): a busca do kit
 * acima e os escolhidos em pílulas com o "x" para tirar. O valor é a lista das opções escolhidas.
 */
export function EscolhidosField({
  label,
  chave,
  buscar,
  placeholder,
  description,
  vazio,
  required = false,
  className,
}: {
  label: string;
  chave: string;
  buscar: (termo: string) => Promise<OpcaoBusca[]>;
  placeholder: string;
  description?: ReactNode;
  /** Texto com nada escolhido ("Todos os clientes"). */
  vazio?: string;
  /** Pede ao menos um escolhido (o `*` no rótulo; a regra fica no esquema do formulário). */
  required?: boolean;
  className?: string;
}) {
  const field = useFieldContext<OpcaoBusca[]>();
  const { erros, invalido, ref } = useCampo(field);
  const id = useId();
  const [busca, setBusca] = useState<OpcaoBusca | null>(null);
  const escolhidos = field.state.value;
  const mudar = (lista: OpcaoBusca[]) => {
    field.handleChange(lista);
    field.handleBlur();
  };

  return (
    <Field.Root
      ref={ref}
      name={field.name}
      invalid={invalido}
      className={cn('flex flex-col gap-2', className)}
    >
      <label htmlFor={id} className="text-foreground font-medium">
        {label}
        {required && (
          <span aria-hidden className="text-destructive">
            {' '}
            *
          </span>
        )}
      </label>
      <BuscaSelecao
        id={id}
        chave={chave}
        buscar={async (termo) =>
          (await buscar(termo)).filter((o) => !escolhidos.some((e) => e.valor === o.valor))
        }
        valor={busca}
        onMudar={(opcao) => {
          if (opcao) mudar([...escolhidos, opcao]);
          // Volta a ficar vazio para escolher o próximo.
          setBusca(null);
        }}
        placeholder={placeholder}
      />
      {escolhidos.length > 0 ? (
        <ul aria-label={`${label}: escolhidos`} className="flex flex-wrap gap-1.5">
          {escolhidos.map((e) => (
            <li
              key={e.valor}
              className="bg-muted inline-flex h-7 max-w-full items-center gap-1 rounded-full pr-1 pl-3 text-[13px]"
            >
              <span className="truncate">{e.rotulo}</span>
              <Button
                type="button"
                aria-label={`Tirar ${e.rotulo}`}
                onClick={() => mudar(escolhidos.filter((x) => x.valor !== e.valor))}
                className="text-muted-foreground hover:bg-card hover:text-foreground focus-visible:outline-ring flex size-5 items-center justify-center rounded-full focus-visible:outline-2"
              >
                <X size={12} aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        vazio && <span className="text-muted-foreground text-[13px]">{vazio}</span>
      )}
      {description && (
        <Field.Description className="text-subtle-foreground text-xs">
          {description}
        </Field.Description>
      )}
      <FieldError invalid={invalido}>{erros.join(', ')}</FieldError>
    </Field.Root>
  );
}
