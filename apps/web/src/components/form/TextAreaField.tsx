import { Field } from '@base-ui/react/field';
import type { KeyboardEvent } from 'react';

import { cn } from '../../lib/cn';
import { useFieldContext } from './context';
import { controlClassName } from './control-class';
import { FieldError, FieldLabel } from './field-parts';
import { useCampo } from './use-campo';

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
  const { erros, invalido, aoSair, ref } = useCampo(field, { aparar: true });

  // Enter quebra a linha; Ctrl/⌘+Enter envia o formulário (passa pelo `onSubmit` da tela).
  const enviarComAtalho = (evento: KeyboardEvent<HTMLElement>) => {
    if (evento.key !== 'Enter' || !(evento.ctrlKey || evento.metaKey)) return;
    evento.preventDefault();
    const formulario = (evento.target as HTMLTextAreaElement).form;
    if (formulario) formulario.requestSubmit();
    else void field.form.handleSubmit();
  };

  return (
    <Field.Root
      ref={ref}
      name={field.name}
      invalid={invalido}
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
        onBlur={aoSair}
        onKeyDown={enviarComAtalho}
        className={controlClassName('app', 'h-auto resize-y py-2')}
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
