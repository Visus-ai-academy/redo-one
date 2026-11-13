import { Field } from '@base-ui/react/field';

import { cn } from '../../lib/cn';
import { useFieldContext } from './context';
import { controlClassName } from './control-class';
import { FieldError, FieldLabel } from './field-parts';

type TextFieldProps = {
  label: string;
  /** Exemplo do formato esperado (`nome@empresa.com.br`, `Ex.: Maria Souza`). Nunca substitui o rótulo. */
  placeholder: string;
  required?: boolean;
  type?: 'text' | 'email' | 'search' | 'tel' | 'url';
  description?: string;
  autoComplete?: string;
  /** `acesso`: controles de 44px das telas de login, recuperação e convite. */
  size?: 'app' | 'acesso';
  className?: string;
};

export function TextField({
  label,
  placeholder,
  required = false,
  type = 'text',
  description,
  autoComplete,
  size = 'app',
  className,
}: TextFieldProps) {
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
      className={cn('flex flex-col gap-1.5', className)}
    >
      <FieldLabel required={required}>{label}</FieldLabel>
      <Field.Control
        type={type}
        required={required}
        placeholder={placeholder}
        autoComplete={autoComplete}
        value={field.state.value}
        onValueChange={(value) => field.handleChange(value)}
        onBlur={field.handleBlur}
        className={controlClassName(size)}
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
