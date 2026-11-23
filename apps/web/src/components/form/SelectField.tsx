import { Field } from '@base-ui/react/field';

import { cn } from '../../lib/cn';

import { type OpcaoSelect, Select } from '../select/Select';
import { useFieldContext } from './context';
import { FieldError, FieldLabel } from './field-parts';
import { useCampo } from './use-campo';

type SelectFieldProps = {
  label: string;
  opcoes: OpcaoSelect[];
  /** Texto com o campo vazio ("Escolha um papel"). */
  placeholder: string;
  required?: boolean;
  /** Ex.: depende de outro campo ainda vazio; o placeholder diz o porquê. */
  disabled?: boolean;
  description?: string;
  className?: string;
};

/** Seleção no kit de formulário: rótulo com `*`, ajuda e erro abaixo, como os outros campos. */
export function SelectField({
  label,
  opcoes,
  placeholder,
  required = false,
  disabled = false,
  description,
  className,
}: SelectFieldProps) {
  const field = useFieldContext<string>();
  const { erros: errors, invalido: invalid, aoSair, ref } = useCampo(field);

  return (
    <Field.Root
      ref={ref}
      name={field.name}
      invalid={invalid}
      disabled={disabled}
      touched={field.state.meta.isTouched}
      className={cn('flex flex-col gap-2', className)}
    >
      <FieldLabel required={required}>{label}</FieldLabel>
      <Select
        value={field.state.value}
        onValueChange={(valor) => {
          field.handleChange(valor);
          aoSair();
        }}
        opcoes={opcoes}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
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
