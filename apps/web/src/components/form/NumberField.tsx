import { Field } from '@base-ui/react/field';

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
 * Número no kit de formulário. O valor fica como texto (o que a pessoa digitou); o schema Zod
 * valida e converte, para o erro poder dizer o que está errado em vez de virar `NaN`.
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
      <Field.Control
        type="number"
        inputMode={step < 1 ? 'decimal' : 'numeric'}
        min={min}
        max={max}
        step={step}
        required={required}
        placeholder={placeholder}
        value={field.state.value}
        onValueChange={(value) => field.handleChange(value)}
        onBlur={field.handleBlur}
        className={controlClassName('app', 'tabular-nums')}
      />
      {description && (
        <Field.Description className="text-muted-foreground text-[13px]">
          {description}
        </Field.Description>
      )}
      <FieldError invalid={invalid}>{errors.join(', ')}</FieldError>
    </Field.Root>
  );
}
