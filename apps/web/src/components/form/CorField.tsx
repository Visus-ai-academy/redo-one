import { Field } from '@base-ui/react/field';
import { Fieldset } from '@base-ui/react/fieldset';
import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
import { Check, Prohibit } from '@phosphor-icons/react';
import { useState } from 'react';

import { cn } from '../../lib/cn';
import { coresDoCampo, valorMarcado } from '../../lib/cores-categoria';
import { Dica } from '../dica/Dica';
import { useFieldContext } from './context';
import { FieldError } from './field-parts';
import { Legenda } from './Legenda';
import { useCampo } from './use-campo';

type CorFieldProps = {
  label?: string;
  description?: string;
  /** Com `required`, não há "Sem cor". */
  required?: boolean;
  className?: string;
};

const AMOSTRA = cn(
  'flex size-7 flex-none items-center justify-center rounded-full border',
  'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
  'data-[checked]:ring-foreground data-[checked]:ring-offset-card data-[checked]:ring-2 data-[checked]:ring-offset-2',
);

/**
 * Cor de um item de cadastro (frente, turno, tipo de ausência, equipe, prioridade, regra de
 * tipificação), escolhida na paleta das cores de categoria do `sistema.md`, sobre o RadioGroup do
 * Base UI (setas andam entre as cores). O valor é o "#RRGGBB" escolhido, ou `''` sem cor. Cor já
 * cadastrada fora da paleta aparece como "Cor atual" e continua igual se a pessoa não mexer.
 */
export function CorField({
  label = 'Cor',
  description,
  required = false,
  className,
}: CorFieldProps) {
  const field = useFieldContext<string>();
  const { erros, invalido, aoSair, ref } = useCampo(field);
  const atual = field.state.value ?? '';
  // A "Cor atual" de fora da paleta continua oferecida depois de trocar, para poder voltar a ela.
  const [original] = useState(atual);
  const cores = coresDoCampo(original);

  return (
    <Field.Root
      ref={ref}
      name={field.name}
      invalid={invalido}
      touched={field.state.meta.isTouched}
      className={cn('flex flex-col gap-2', className)}
    >
      <Fieldset.Root
        render={
          <RadioGroup
            value={valorMarcado(atual)}
            onValueChange={(nova) => {
              field.handleChange(nova as string);
              aoSair();
            }}
          />
        }
        className="flex flex-col gap-2"
      >
        <Legenda required={required}>{label}</Legenda>
        <div className="flex flex-wrap gap-2 py-0.5">
          {!required && (
            <Dica rotulo="Sem cor" lado="top">
              <Radio.Root
                value=""
                aria-label="Sem cor"
                className={cn(AMOSTRA, 'border-input bg-card text-subtle-foreground')}
              >
                <Prohibit size={16} aria-hidden />
              </Radio.Root>
            </Dica>
          )}
          {cores.map((c) => (
            <Dica key={c.valor} rotulo={c.nome} lado="top">
              <Radio.Root
                value={c.valor}
                aria-label={c.nome}
                className={AMOSTRA}
                style={{ backgroundColor: c.valor, borderColor: c.valor }}
              >
                <Radio.Indicator className="flex data-[unchecked]:hidden">
                  <Check size={14} weight="bold" className="text-primary-foreground" aria-hidden />
                </Radio.Indicator>
              </Radio.Root>
            </Dica>
          ))}
        </div>
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
