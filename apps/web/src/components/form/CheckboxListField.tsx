import { useId } from 'react';

import { cn } from '../../lib/cn';
import { CaixaDeSelecao } from '../checkbox/CaixaDeSelecao';
import { useFieldContext } from './context';

type CheckboxListFieldProps = {
  label: string;
  opcoes: { valor: string; rotulo: string }[];
  required?: boolean;
  description?: string;
  className?: string;
};

/** Várias escolhas de uma lista curta (ex.: especialidades de uma subespecialidade). */
export function CheckboxListField({
  label,
  opcoes,
  required = false,
  description,
  className,
}: CheckboxListFieldProps) {
  const field = useFieldContext<string[]>();
  const ajudaId = useId();
  const erroId = useId();
  const errors = field.state.meta.errors.map((error) =>
    typeof error === 'string' ? error : (error as { message?: string } | undefined)?.message,
  );
  const invalid = errors.length > 0;
  const marcados = new Set(field.state.value);

  return (
    <fieldset
      aria-describedby={
        [description && ajudaId, invalid && erroId].filter(Boolean).join(' ') || undefined
      }
      aria-invalid={invalid || undefined}
      className={cn('flex flex-col gap-2', className)}
    >
      <legend className="mb-2 flex items-baseline gap-1 font-medium">
        {label}
        {required && (
          <span aria-hidden="true" className="text-destructive">
            *
          </span>
        )}
      </legend>
      {description && (
        <span id={ajudaId} className="text-muted-foreground -mt-1 text-[13px]">
          {description}
        </span>
      )}
      <div className="flex flex-col gap-2">
        {opcoes.map((opcao) => (
          // biome-ignore lint/a11y/noLabelWithoutControl: o controle do Base UI fica dentro do label.
          <label key={opcao.valor} className="flex items-center gap-2">
            <CaixaDeSelecao
              checked={marcados.has(opcao.valor)}
              onCheckedChange={(marcada) => {
                field.handleChange(
                  marcada
                    ? [...field.state.value, opcao.valor]
                    : field.state.value.filter((v) => v !== opcao.valor),
                );
                field.handleBlur();
              }}
            />
            {opcao.rotulo}
          </label>
        ))}
      </div>
      {invalid && (
        <span id={erroId} className="text-destructive text-[13px]">
          {errors.join(', ')}
        </span>
      )}
    </fieldset>
  );
}
