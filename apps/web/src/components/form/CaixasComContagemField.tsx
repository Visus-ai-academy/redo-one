import { CheckboxGroup } from '@base-ui/react/checkbox-group';
import { Field } from '@base-ui/react/field';
import { Fieldset } from '@base-ui/react/fieldset';
import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';
import { CaixaDeSelecao } from '../checkbox/CaixaDeSelecao';
import { useFieldContext } from './context';
import { FieldError } from './field-parts';
import { useCampo } from './use-campo';

export type OpcaoComContagem = {
  valor: string;
  rotulo: ReactNode;
  /** À direita, menor (ex.: "466", "14 médicos", "começa às 13:00"). */
  contagem?: ReactNode;
  /** Não dá para marcar (ex.: turno sem ninguém no robô); a contagem diz por quê. */
  desabilitada?: boolean;
};

/**
 * Lista de caixas de marcar com uma contagem à direita de cada uma (turnos, frentes, prioridades
 * de uma rodada), sobre o CheckboxGroup do Base UI. Com `todos`, ganha a caixa-mãe que marca e
 * desmarca as outras (meio marcada quando só parte está). O valor é a lista dos marcados.
 */
export function CaixasComContagemField({
  label,
  opcoes,
  todos,
  colunas = 1,
  required = false,
  description,
  className,
}: {
  label: string;
  opcoes: readonly OpcaoComContagem[];
  /** Rótulo e contagem da caixa-mãe ("Todas as frentes", "1.487 exames"). */
  todos?: { rotulo: string; contagem?: ReactNode };
  colunas?: 1 | 2;
  required?: boolean;
  description?: ReactNode;
  className?: string;
}) {
  const field = useFieldContext<string[]>();
  const { erros, invalido, aoSair, ref } = useCampo(field);
  const marcados = field.state.value;
  const marcaveis = opcoes.filter((o) => !o.desabilitada).map((o) => o.valor);
  const mudar = (valores: string[]) => {
    field.handleChange(valores);
    aoSair();
  };
  const linha = 'flex min-h-8 items-center gap-2';

  return (
    <Field.Root
      ref={ref}
      name={field.name}
      invalid={invalido}
      touched={field.state.meta.isTouched}
      className={cn('flex flex-col gap-2', className)}
    >
      <Fieldset.Root
        render={<CheckboxGroup value={marcados} onValueChange={mudar} allValues={marcaveis} />}
        className="flex flex-col gap-1"
      >
        <Fieldset.Legend className="mb-1 flex items-baseline gap-1 font-medium">
          {label}
          {required && (
            <span aria-hidden="true" className="text-destructive">
              *
            </span>
          )}
        </Fieldset.Legend>
        {todos && (
          <Field.Item>
            <Field.Label className={linha}>
              <CaixaDeSelecao parent />
              <span className="flex-1 font-medium">{todos.rotulo}</span>
              {todos.contagem != null && (
                <span className="text-subtle-foreground text-xs tabular-nums">
                  {todos.contagem}
                </span>
              )}
            </Field.Label>
          </Field.Item>
        )}
        <div
          className={cn(
            'grid gap-x-3',
            colunas === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1',
            todos && 'pl-6',
          )}
        >
          {opcoes.map((o) => (
            <Field.Item key={o.valor} disabled={o.desabilitada}>
              <Field.Label
                className={cn(linha, o.desabilitada && 'text-subtle-foreground cursor-not-allowed')}
              >
                <CaixaDeSelecao value={o.valor} disabled={o.desabilitada} />
                <span className={cn('min-w-0 flex-1', todos && 'text-[13px]')}>{o.rotulo}</span>
                {o.contagem != null && (
                  <span className="text-subtle-foreground text-xs whitespace-nowrap tabular-nums">
                    {o.contagem}
                  </span>
                )}
              </Field.Label>
            </Field.Item>
          ))}
        </div>
        {description && (
          <Field.Description className="text-subtle-foreground text-xs">
            {description}
          </Field.Description>
        )}
      </Fieldset.Root>
      <FieldError invalid={invalido}>{erros.join(', ')}</FieldError>
    </Field.Root>
  );
}
