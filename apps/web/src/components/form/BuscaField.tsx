import { useId } from 'react';

import { cn } from '../../lib/cn';
import { BuscaSelecao, type OpcaoBusca } from '../busca/BuscaSelecao';
import { useFieldContext } from './context';

type BuscaFieldProps = {
  label: string;
  placeholder: string;
  chave: string;
  buscar: (termo: string) => Promise<OpcaoBusca[]>;
  required?: boolean;
  description?: string;
  className?: string;
};

/** Escolha numa lista grande, buscando enquanto digita; mesmo rótulo, ajuda e erro dos outros campos. */
export function BuscaField({
  label,
  placeholder,
  chave,
  buscar,
  required = false,
  description,
  className,
}: BuscaFieldProps) {
  const field = useFieldContext<OpcaoBusca | null>();
  const id = useId();
  const ajudaId = useId();
  const erroId = useId();
  const errors = field.state.meta.errors.map((error) =>
    typeof error === 'string' ? error : (error as { message?: string } | undefined)?.message,
  );
  const invalid = errors.length > 0;
  const descricoes = [description && ajudaId, invalid && erroId].filter(Boolean).join(' ');

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-baseline gap-1">
        <label htmlFor={id} className="text-foreground font-medium">
          {label}
        </label>
        {required && (
          <span aria-hidden="true" className="text-destructive">
            *
          </span>
        )}
      </div>
      <BuscaSelecao
        id={id}
        chave={chave}
        buscar={buscar}
        valor={field.state.value}
        onMudar={(opcao) => {
          field.handleChange(opcao);
          field.handleBlur();
        }}
        placeholder={placeholder}
        aria-describedby={descricoes || undefined}
        aria-invalid={invalid}
      />
      {description && (
        <span id={ajudaId} className="text-muted-foreground text-[13px]">
          {description}
        </span>
      )}
      {invalid && (
        <span id={erroId} className="text-destructive text-[13px]">
          {errors.join(', ')}
        </span>
      )}
    </div>
  );
}
