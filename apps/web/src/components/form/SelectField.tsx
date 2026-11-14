import { useId } from 'react';

import { cn } from '../../lib/cn';

import { type OpcaoSelect, Select } from '../select/Select';
import { useFieldContext } from './context';

type SelectFieldProps = {
  label: string;
  opcoes: OpcaoSelect[];
  /** Texto com o campo vazio ("Escolha um papel"). */
  placeholder: string;
  required?: boolean;
  description?: string;
  className?: string;
};

/** Seleção no kit de formulário: rótulo com `*`, ajuda e erro abaixo, como os outros campos. */
export function SelectField({
  label,
  opcoes,
  placeholder,
  required = false,
  description,
  className,
}: SelectFieldProps) {
  const field = useFieldContext<string>();
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
      <Select
        id={id}
        value={field.state.value}
        onValueChange={(valor) => {
          field.handleChange(valor);
          field.handleBlur();
        }}
        opcoes={opcoes}
        placeholder={placeholder}
        required={required}
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
