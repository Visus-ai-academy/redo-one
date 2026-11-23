import { CheckboxGroup } from '@base-ui/react/checkbox-group';
import { Field } from '@base-ui/react/field';
import { Fieldset } from '@base-ui/react/fieldset';

import { cn } from '../../lib/cn';
import { BolinhaCor } from '../bolinha-cor/BolinhaCor';
import { CaixaDeSelecao } from '../checkbox/CaixaDeSelecao';
import { agruparOpcoes, temGrupos } from '../select/grupos';
import { useFieldContext } from './context';
import { FieldError } from './field-parts';
import { useCampo } from './use-campo';

export type OpcaoMarcar = {
  valor: string;
  rotulo: string;
  /** Subtítulo (ex.: "Especialidades"); sem ele, a opção fica num grupo sem subtítulo. */
  grupo?: string;
  /** Com a chave, mostra a bolinha da cor antes do nome (sem cor, só o contorno). */
  cor?: string | null;
  /** Fica à vista, mas não se marca nem desmarca (ex.: papel que você não pode atribuir). */
  desabilitada?: boolean;
};

type CheckboxListFieldProps = {
  label: string;
  opcoes: OpcaoMarcar[];
  required?: boolean;
  description?: string;
  className?: string;
};

/**
 * Várias escolhas de uma lista curta (ex.: especialidades de uma subespecialidade), sobre o
 * Fieldset e o CheckboxGroup do Base UI. Opções com `grupo` ficam sob subtítulos; com `cor`, ganham
 * a bolinha.
 */
export function CheckboxListField({
  label,
  opcoes,
  required = false,
  description,
  className,
}: CheckboxListFieldProps) {
  const field = useFieldContext<string[]>();
  const { erros: errors, invalido: invalid, aoSair, ref } = useCampo(field);

  return (
    <Field.Root
      ref={ref}
      name={field.name}
      invalid={invalid}
      touched={field.state.meta.isTouched}
      className={cn('flex flex-col gap-2', className)}
    >
      <Fieldset.Root
        render={
          <CheckboxGroup
            value={field.state.value}
            onValueChange={(valores) => {
              field.handleChange(valores);
              aoSair();
            }}
          />
        }
        className="flex flex-col gap-2"
      >
        <Fieldset.Legend className="flex items-baseline gap-1 font-medium">
          {label}
          {required && (
            <span aria-hidden="true" className="text-destructive">
              *
            </span>
          )}
        </Fieldset.Legend>
        {description && (
          <Field.Description className="text-muted-foreground -mt-1 text-[13px]">
            {description}
          </Field.Description>
        )}
        {temGrupos(opcoes)
          ? agruparOpcoes(opcoes).map(({ grupo, items }) => (
              <Fieldset.Root key={grupo ?? ''} className="flex flex-col gap-2">
                {grupo && (
                  <Fieldset.Legend className="text-subtle-foreground text-xs font-medium">
                    {grupo}
                  </Fieldset.Legend>
                )}
                {items.map(item)}
              </Fieldset.Root>
            ))
          : opcoes.map(item)}
      </Fieldset.Root>
      <FieldError invalid={invalid}>{errors.join(', ')}</FieldError>
    </Field.Root>
  );
}

function item(opcao: OpcaoMarcar) {
  return (
    <Field.Item key={opcao.valor}>
      <Field.Label className="flex items-center gap-2">
        <CaixaDeSelecao value={opcao.valor} disabled={opcao.desabilitada} />
        {'cor' in opcao && <BolinhaCor cor={opcao.cor ?? null} />}
        {opcao.rotulo}
      </Field.Label>
    </Field.Item>
  );
}
