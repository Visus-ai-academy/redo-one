import { CheckboxGroup } from '@base-ui/react/checkbox-group';
import { Field } from '@base-ui/react/field';
import { Fieldset } from '@base-ui/react/fieldset';
import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';
import { BolinhaCor } from '../bolinha-cor/BolinhaCor';
import { CaixaDeSelecao } from '../checkbox/CaixaDeSelecao';
import { marcadasAoMudar, marcadasNaTela } from './caixas-todas';
import { useFieldContext } from './context';
import { FieldError } from './field-parts';
import { Legenda } from './Legenda';
import { useCampo } from './use-campo';

/** Com `cor` (mesmo nula), a opção leva a bolinha da cor (ex.: prioridades da operação). */
type Opcao = { valor: string; rotulo: string; cor?: string | null };

/**
 * Várias caixas de marcar lado a lado, quebrando linha (dias da semana, prioridades), sobre o
 * CheckboxGroup do Base UI. O valor é a lista dos marcados.
 *
 * Com `todas` (rótulo: "Todas", "Todos os dias"…), ganha antes das outras a caixa-mãe do Base UI
 * (`allValues` + `parent`, meio marcada quando só parte está). Aí "Todas" marcada vale `[TODAS]`
 * e nada marcado vale `[]`, que o esquema recusa: use `esquemaCaixasComTodas` no campo
 * (regras em `form/caixas-todas.ts`).
 */
export function CaixasField({
  label,
  opcoes,
  todas,
  required = false,
  description,
  className,
}: {
  label: string;
  opcoes: Opcao[];
  /** Rótulo da caixa-mãe que marca todas ("Todas", "Todos os dias", "Sem restrição"…). */
  todas?: string;
  required?: boolean;
  description?: ReactNode;
  className?: string;
}) {
  const field = useFieldContext<string[]>();
  const { erros, invalido, aoSair, ref } = useCampo(field);
  const valores = opcoes.map((o) => o.valor);
  const doForm = field.state.value;
  const valor = todas ? marcadasNaTela(doForm, valores) : doForm;
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
          <CheckboxGroup
            value={valor}
            allValues={todas ? valores : undefined}
            onValueChange={(novos) => {
              field.handleChange(todas ? marcadasAoMudar(novos, valores) : novos);
              aoSair();
            }}
          />
        }
        className="flex flex-col gap-2"
      >
        <Legenda required={required}>{label}</Legenda>
        {description && (
          <Field.Description className="text-muted-foreground -mt-1 text-[13px]">
            {description}
          </Field.Description>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {todas && (
            <Field.Item className="border-border border-r pr-4">
              <Field.Label className="flex items-center gap-2">
                <CaixaDeSelecao parent />
                {todas}
              </Field.Label>
            </Field.Item>
          )}
          {opcoes.map((opcao) => (
            <Field.Item key={opcao.valor}>
              <Field.Label className="flex items-center gap-2">
                <CaixaDeSelecao value={opcao.valor} />
                {opcao.cor !== undefined && <BolinhaCor cor={opcao.cor} className="size-2.5" />}
                {opcao.rotulo}
              </Field.Label>
            </Field.Item>
          ))}
        </div>
      </Fieldset.Root>
      <FieldError invalid={invalido}>{erros.join(', ')}</FieldError>
    </Field.Root>
  );
}
