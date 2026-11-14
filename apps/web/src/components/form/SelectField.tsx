import { Field } from '@base-ui/react/field';

import { cn } from '../../lib/cn';

import { type OpcaoSelect, Select } from '../select/Select';
import { useFieldContext } from './context';
import { FieldError, FieldLabel } from './field-parts';

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
      <Select
        value={field.state.value}
        onValueChange={(valor) => {
          field.handleChange(valor);
          field.handleBlur();
        }}
        opcoes={opcoes}
        placeholder={placeholder}
        required={required}
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
