import { Field } from '@base-ui/react/field';
import { useLayoutEffect, useRef } from 'react';

import { cn } from '../../lib/cn';
import { aplicarMascara, type Mascara, posicaoAposDigitos } from '../../lib/mascaras';
import { useFieldContext } from './context';
import { controlClassName } from './control-class';
import { FieldError, FieldLabel } from './field-parts';
import { useCampo } from './use-campo';

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
  /** Formato fixo (CPF, CNPJ, CEP, telefone): ajusta enquanto digita; teclado numérico. */
  mascara?: Mascara;
  /** `false` em códigos, chaves e identificadores (e-mail, busca e máscara já desligam). */
  spellCheck?: boolean;
  /** Teclado do celular sem máscara: `numeric` (códigos, agência) ou `decimal` (valores em R$). */
  inputMode?: 'numeric' | 'decimal';
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
  spellCheck,
  inputMode,
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
  const { erros, invalido, aoSair, ref } = useCampo(field, { aparar: true });
  const semCorretor = Boolean(mascara) || type === 'email' || type === 'search' || type === 'url';

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
        ref={entrada}
        type={mascara === 'telefone' ? 'tel' : type}
        inputMode={mascara ? 'numeric' : type === 'tel' ? 'tel' : inputMode}
        required={required}
        placeholder={placeholder}
        // E-mail, busca e documento: sem corretor, sem maiúscula automática e sem o navegador
        // preencher com os dados de quem está usando (as telas de acesso passam `autoComplete`).
        autoComplete={autoComplete ?? (semCorretor ? 'off' : undefined)}
        spellCheck={spellCheck ?? (semCorretor ? false : undefined)}
        autoCapitalize={semCorretor || spellCheck === false ? 'none' : undefined}
        value={mascara ? aplicarMascara(mascara, field.state.value ?? '') : field.state.value}
        onValueChange={mudar}
        onBlur={aoSair}
        className={controlClassName(size)}
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
