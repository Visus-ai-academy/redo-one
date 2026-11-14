import { Field } from '@base-ui/react/field';

import { cn } from '../../lib/cn';
import { useFieldContext } from './context';
import { controlClassName } from './control-class';
import { FieldError, FieldLabel } from './field-parts';

type TextAreaFieldProps = {
  label: string;
  placeholder: string;
  required?: boolean;
  description?: string;
  /** Linhas visíveis antes de rolar. */
  rows?: number;
  className?: string;
};

/** Texto longo (observações): mesmo rótulo, ajuda e erro dos outros campos. */
export function TextAreaField({
  label,
  placeholder,
  required = false,
  description,
  rows = 3,
  className,
}: TextAreaFieldProps) {
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
        render={<textarea rows={rows} />}
        required={required}
        placeholder={placeholder}
        value={field.state.value}
        onValueChange={(value) => field.handleChange(value)}
        onBlur={field.handleBlur}
        className={controlClassName('app', 'h-auto resize-y py-2')}
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
