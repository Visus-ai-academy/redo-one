import { Field } from '@base-ui/react/field';
import { type ReactNode, useId } from 'react';

import { cn } from '../../lib/cn';
import { EscolhaSegmentada } from '../escolha-segmentada/EscolhaSegmentada';
import { useFieldContext } from './context';
import { FieldError, MarcaObrigatorio } from './field-parts';
import { useCampo } from './use-campo';

/**
 * Uma escolha entre 2 ou 3 opções de rótulo curto, sem explicação própria (Pessoa jurídica |
 * Pessoa física, Receita | Despesa), em botões lado a lado (`EscolhaSegmentada`, sobre o
 * ToggleGroup do Base UI). Opções com ajuda, rótulos que são frases ou mais de 3 opções: o
 * `OpcoesField`. O valor é o `valor` da opção marcada; `''` enquanto nada foi escolhido.
 */
export function SegmentadaField({
  label,
  opcoes,
  required = false,
  description,
  disabled,
  className,
}: {
  label: string;
  opcoes: readonly { valor: string; rotulo: string }[];
  required?: boolean;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const field = useFieldContext<string>();
  const { erros, invalido, aoSair, ref } = useCampo(field);
  const tituloId = useId();
  return (
    <Field.Root
      ref={ref}
      name={field.name}
      invalid={invalido}
      disabled={disabled}
      touched={field.state.meta.isTouched}
      className={cn('flex flex-col gap-2', className)}
    >
      <div className="flex flex-col gap-2">
        {/* Título do grupo de botões (o ToggleGroup é o grupo, nomeado por ele). */}
        <span className="font-medium">
          <span id={tituloId}>{label}</span>
          {required && <MarcaObrigatorio />}
        </span>
        <EscolhaSegmentada
          aria-labelledby={tituloId}
          aria-invalid={invalido}
          opcoes={opcoes}
          valor={field.state.value}
          disabled={disabled}
          onMudar={(novo) => {
            field.handleChange(novo);
            aoSair();
          }}
          className="self-start"
        />
        {description && (
          <Field.Description className="text-muted-foreground text-[13px]">
            {description}
          </Field.Description>
        )}
      </div>
      <FieldError invalid={invalido}>{erros.join(', ')}</FieldError>
    </Field.Root>
  );
}
