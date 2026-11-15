import { Field } from '@base-ui/react/field';
import { useLayoutEffect, useRef } from 'react';

import { cn } from '../../lib/cn';
import { aplicarMascara, type Mascara, posicaoAposDigitos } from '../../lib/mascaras';
import { useFieldContext } from './context';
import { controlClassName } from './control-class';
import { FieldError, FieldLabel } from './field-parts';

type TextFieldProps = {
  label: string;
  /** Exemplo do formato esperado (`nome@empresa.com.br`, `Ex.: Maria Souza`). Nunca substitui o rótulo. */
  placeholder: string;
  required?: boolean;
  type?: 'text' | 'email' | 'search' | 'tel' | 'url' | 'date';
  description?: string;
  autoComplete?: string;
  /** `acesso`: controles de 44px das telas de login, recuperação e convite. */
  size?: 'app' | 'acesso';
  /** Formato fixo (CPF, CNPJ, CEP, telefone): ajusta enquanto digita; teclado numérico. */
  mascara?: Mascara;
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
  mascara,
  className,
}: TextFieldProps) {
  const field = useFieldContext<string>();
  const entrada = useRef<HTMLInputElement>(null);

  // Onde o cursor deve ficar depois que a máscara reescreve o valor (aplicado logo após o React
  // atualizar o campo, antes da próxima tecla).
  const cursorPendente = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = entrada.current;
    const posicao = cursorPendente.current;
    if (el === null || posicao === null) return;
    cursorPendente.current = null;
    if (document.activeElement === el) el.setSelectionRange(posicao, posicao);
  });

  const mudar = (valor: string) => {
    if (!mascara) return field.handleChange(valor);
    // O cursor fica depois do mesmo dígito, mesmo quando a pontuação entra ou sai.
    const el = entrada.current;
    const digitosAntes = valor
      .slice(0, el?.selectionStart ?? valor.length)
      .replace(/\D/g, '').length;
    const formatado = aplicarMascara(mascara, valor);
    cursorPendente.current = posicaoAposDigitos(formatado, digitosAntes);
    field.handleChange(formatado);
  };
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
        ref={entrada}
        type={mascara === 'telefone' ? 'tel' : type}
        inputMode={mascara ? 'numeric' : undefined}
        required={required}
        placeholder={placeholder}
        autoComplete={autoComplete}
        value={mascara ? aplicarMascara(mascara, field.state.value ?? '') : field.state.value}
        onValueChange={mudar}
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
