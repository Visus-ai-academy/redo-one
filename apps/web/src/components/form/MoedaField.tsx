import { Field } from '@base-ui/react/field';
import { useLayoutEffect, useRef, useState } from 'react';

import { cn } from '../../lib/cn';
import { centavosDaMoeda, formatarMoedaDigitando, textoDaMoeda } from '../../lib/moeda-digitando';
import { useFieldContext } from './context';
import { controlClassName } from './control-class';
import { FieldError, FieldLabel } from './field-parts';
import { useCampo } from './use-campo';

type MoedaFieldProps = {
  label: string;
  /** Exemplo do valor, sem o "R$" (ele já fica fixo no campo): `0,00`, `1.200,00`. */
  placeholder?: string;
  required?: boolean;
  description?: string;
  /** Aceita valor negativo (desconto, estorno, saldo devedor). */
  negativo?: boolean;
  disabled?: boolean;
  className?: string;
};

/** Quantos caracteres que contam (dígito, vírgula, sinal) há antes da posição. */
const contaveis = (texto: string) => texto.replace(/[^\d,-]/g, '').length;

function posicaoAposContaveis(texto: string, n: number) {
  if (n <= 0) return 0;
  let vistos = 0;
  for (let i = 0; i < texto.length; i++) {
    if (/[\d,-]/.test(texto[i] ?? '') && ++vistos === n) return i + 1;
  }
  return texto.length;
}

/**
 * Dinheiro no kit de formulário: "R$" fixo à esquerda, milhar com ponto enquanto digita e vírgula
 * nos centavos; ao sair, completa as duas casas ("1.200" vira "1.200,00"). O valor do campo é em
 * **centavos inteiros** (`number`), ou `null` vazio: o que a API recebe e devolve, sem conversão
 * na tela. Teclado decimal no celular.
 */
export function MoedaField({
  label,
  placeholder = '0,00',
  required = false,
  description,
  negativo = false,
  disabled,
  className,
}: MoedaFieldProps) {
  const field = useFieldContext<number | null>();
  const valor = field.state.value ?? null;
  const [texto, setTexto] = useState(() => textoDaMoeda(valor));
  // Valor trocado por fora (reset do formulário, valor sugerido): o texto acompanha.
  if (centavosDaMoeda(texto) !== valor) setTexto(textoDaMoeda(valor));

  const entrada = useRef<HTMLInputElement>(null);
  const cursorPendente = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = entrada.current;
    const posicao = cursorPendente.current;
    if (el === null || posicao === null) return;
    cursorPendente.current = null;
    if (document.activeElement === el) el.setSelectionRange(posicao, posicao);
  });

  const { erros, invalido, aoSair, ref } = useCampo(field);

  return (
    <Field.Root
      ref={ref}
      name={field.name}
      invalid={invalido}
      disabled={disabled}
      touched={field.state.meta.isTouched}
      className={cn('flex flex-col gap-2', className)}
    >
      <FieldLabel required={required}>{label}</FieldLabel>
      <div className="relative">
        <span
          aria-hidden
          className="text-muted-foreground pointer-events-none absolute inset-y-0 left-3 flex items-center"
        >
          R$
        </span>
        <Field.Control
          ref={entrada}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          required={required}
          placeholder={placeholder}
          value={texto}
          onValueChange={(novo) => {
            const el = entrada.current;
            const cursor = el?.selectionStart ?? novo.length;
            const formatado = formatarMoedaDigitando(novo, { negativo });
            cursorPendente.current =
              cursor >= novo.length
                ? formatado.length
                : posicaoAposContaveis(formatado, contaveis(novo.slice(0, cursor)));
            setTexto(formatado);
            field.handleChange(centavosDaMoeda(formatado));
          }}
          onBlur={() => {
            setTexto(textoDaMoeda(centavosDaMoeda(texto)));
            aoSair();
          }}
          className={controlClassName('app', 'pl-9 text-right tabular-nums')}
        />
      </div>
      {description && (
        <Field.Description className="text-muted-foreground text-[13px]">
          {description}
        </Field.Description>
      )}
      <FieldError invalid={invalido}>{erros.join(', ')}</FieldError>
    </Field.Root>
  );
}
