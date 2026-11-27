import { Field } from '@base-ui/react/field';
import { Fieldset } from '@base-ui/react/fieldset';
import { RadioGroup } from '@base-ui/react/radio-group';
import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';
import { ListaDeOpcoes, type OpcaoDaLista } from '../opcoes/ListaDeOpcoes';
import { useFieldContext } from './context';
import { FieldError } from './field-parts';
import { Legenda } from './Legenda';
import { useCampo } from './use-campo';

/**
 * Uma escolha entre poucas opções, todas à vista (opções redondas), sobre o RadioGroup do Base
 * UI. Para opções com explicação própria (`ajuda`) ou rótulos que são frases; para 2–3 rótulos
 * curtos sem explicação, o `SegmentadaField`. O valor é o `valor` da opção marcada. Com
 * `required`, leva o `*` e mostra o erro do esquema (ex.: "Escolha o tipo.") abaixo das opções.
 */
export function OpcoesField({
  label,
  opcoes,
  required = false,
  description,
  direcao,
  disabled,
  className,
}: {
  label: string;
  opcoes: readonly OpcaoDaLista[];
  required?: boolean;
  description?: ReactNode;
  direcao?: 'linha' | 'coluna';
  disabled?: boolean;
  className?: string;
}) {
  const field = useFieldContext<string>();
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
      <Fieldset.Root
        render={
          <RadioGroup
            value={field.state.value}
            disabled={disabled}
            onValueChange={(novo) => {
              field.handleChange(novo as string);
              aoSair();
            }}
          />
        }
        className="flex flex-col gap-2"
      >
        <Legenda required={required}>{label}</Legenda>
        <ListaDeOpcoes opcoes={opcoes} direcao={direcao} />
        {description && (
          <Field.Description className="text-muted-foreground text-[13px]">
            {description}
          </Field.Description>
        )}
      </Fieldset.Root>
      <FieldError invalid={invalido}>{erros.join(', ')}</FieldError>
    </Field.Root>
  );
}
