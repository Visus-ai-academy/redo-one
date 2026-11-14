import { Field } from '@base-ui/react/field';
import { NumberField as BaseNumberField } from '@base-ui/react/number-field';

import { cn } from '../../lib/cn';
import { useFieldContext } from './context';
import { controlClassName } from './control-class';
import { FieldError, FieldLabel } from './field-parts';

type NumberFieldProps = {
  label: string;
  placeholder: string;
  required?: boolean;
  description?: string;
  min?: number;
  max?: number;
  /** `0.01` para valores com centavos; padrão inteiro. */
  step?: number;
  className?: string;
};

/**
 * Número no kit de formulário, sobre o NumberField do Base UI (aceita só número, setas sobem e
 * descem pelo `step`). O valor do campo fica como texto ("" quando vazio); o schema Zod valida e
 * converte.
 */
export function NumberField({
  label,
  placeholder,
  required = false,
  description,
  min,
  max,
  step = 1,
  className,
}: NumberFieldProps) {
  const field = useFieldContext<string>();
  const errors = field.state.meta.errors.map((error) =>
    typeof error === 'string' ? error : (error as { message?: string } | undefined)?.message,
  );
  const invalid = errors.length > 0;

  return (
    <Field.Root
      name={field.name}
      invalid={invalid}
      touched={field.state.meta.isTouched}
      className={cn('flex flex-col gap-2', className)}
    >
      <FieldLabel required={required}>{label}</FieldLabel>
      <BaseNumberField.Root
        value={field.state.value.trim() === '' ? null : Number(field.state.value)}
        onValueChange={(valor) => field.handleChange(valor === null ? '' : String(valor))}
        min={min}
        max={max}
        step={step}
        required={required}
        // Sem separador de milhar: código e ID (990001) não viram "990.001".
        format={{ useGrouping: false, maximumFractionDigits: step < 1 ? 2 : 0 }}
        locale="pt-BR"
      >
        <BaseNumberField.Input
          placeholder={placeholder}
          onBlur={field.handleBlur}
          className={controlClassName('app', 'tabular-nums')}
        />
      </BaseNumberField.Root>
      {description && (
        <Field.Description className="text-muted-foreground text-[13px]">
          {description}
        </Field.Description>
      )}
      <FieldError invalid={invalid}>{errors.join(', ')}</FieldError>
    </Field.Root>
  );
}
