import { Field } from '@base-ui/react/field';

import { cn } from '../../lib/cn';
import { CampoData } from '../campo-data/CampoData';
import { useFieldContext } from './context';
import { FieldError, FieldLabel } from './field-parts';
import { useCampo } from './use-campo';

type DateFieldProps = {
  label: string;
  required?: boolean;
  description?: string;
  /** Primeiro e último dia que se pode escolher, "AAAA-MM-DD". */
  min?: string;
  max?: string;
  className?: string;
};

/**
 * Data no kit de formulário, sobre o `CampoData` (digitar dd/mm/aaaa ou escolher no calendário).
 * O valor do campo é "AAAA-MM-DD" ("" sem data), como o do <input type="date">.
 */
export function DateField({
  label,
  required = false,
  description,
  min,
  max,
  className,
}: DateFieldProps) {
  const field = useFieldContext<string>();
  const { erros, invalido, aoSair, ref } = useCampo(field);

  return (
    <Field.Root
      ref={ref}
      name={field.name}
      invalid={invalido}
      touched={field.state.meta.isTouched}
      className={cn('flex flex-col gap-2', className)}
    >
      <FieldLabel required={required}>{label}</FieldLabel>
      <CampoData
        value={field.state.value ?? ''}
        onValueChange={field.handleChange}
        onBlur={aoSair}
        required={required}
        min={min}
        max={max}
      />
      {description && (
        <Field.Description className="text-muted-foreground text-[13px]">
          {description}
        </Field.Description>
      )}
      <FieldError invalid={invalido}>{erros.join(', ')}</FieldError>
    </Field.Root>
  );
}
