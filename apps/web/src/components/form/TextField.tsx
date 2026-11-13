import { Field } from '@base-ui/react/field';

import { useFieldContext } from './context';

type TextFieldProps = {
  label: string;
  type?: 'text' | 'email' | 'password' | 'search' | 'tel' | 'url';
  description?: string;
};

export function TextField({ label, type = 'text', description }: TextFieldProps) {
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
      className="flex flex-col gap-1.5"
    >
      <Field.Label className="text-sm font-medium">{label}</Field.Label>
      <Field.Control
        type={type}
        value={field.state.value}
        onValueChange={(value) => field.handleChange(value)}
        onBlur={field.handleBlur}
        className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 data-[invalid]:border-destructive data-[invalid]:ring-destructive/20 h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
      />
      {description && (
        <Field.Description className="text-muted-foreground text-sm">
          {description}
        </Field.Description>
      )}
      <Field.Error match={invalid} className="text-destructive text-sm">
        {errors.join(', ')}
      </Field.Error>
    </Field.Root>
  );
}
