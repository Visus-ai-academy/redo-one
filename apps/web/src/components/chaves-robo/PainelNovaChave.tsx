import { useQueryClient } from '@tanstack/react-query';
import { useId } from 'react';
import { z } from 'zod';

import { ResponseError } from '../../gen/.kubb/client';
import { useChavesRoboControllerCriar } from '../../gen/hooks/useChavesRoboControllerCriar';
import type { PermissaoRoboDto } from '../../gen/types/PermissaoRoboDto';
import { Alerta } from '../alerta/Alerta';
import { buttonClassName } from '../button/button-class';
import { CaixaDeSelecao } from '../checkbox/CaixaDeSelecao';
import { useAppForm } from '../form/form';
import { PainelLateral } from '../painel/PainelLateral';

export type ChaveGerada = { id: string; chave: string; nome: string };

const VALIDADES = [
  { valor: '365', rotulo: '1 ano' },
  { valor: '90', rotulo: '90 dias' },
  { valor: 'sem', rotulo: 'Sem validade' },
];

const schema = z.object({
  nome: z.string().trim().min(1, 'Informe o nome do robô.').max(80, 'Use no máximo 80 caracteres.'),
  descricao: z.string().trim().max(200, 'Use no máximo 200 caracteres.'),
  permissoes: z.array(z.string()).min(1, 'Marque ao menos uma permissão.'),
  validade: z.enum(['365', '90', 'sem']),
});

type PainelNovaChaveProps = {
  permissoes: PermissaoRoboDto[];
  onCriada: (gerada: ChaveGerada) => void;
  onCancelar: () => void;
};

/** Criação de uma chave de robô, no painel ao lado da lista (`?nova=1`). */
export function PainelNovaChave({ permissoes, onCriada, onCancelar }: PainelNovaChaveProps) {
  const queryClient = useQueryClient();
  const criar = useChavesRoboControllerCriar();
  const legendaId = useId();
  const erroId = useId();

  const form = useAppForm({
    defaultValues: {
      nome: '',
      descricao: '',
      permissoes: [] as string[],
      validade: '365' as '365' | '90' | 'sem',
    },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      const nome = value.nome.trim();
      let criada: { id: string; chave: string };
      try {
        criada = await criar.mutateAsync({
          body: {
            nome,
            descricao: value.descricao.trim() || null,
            permissoes: value.permissoes,
            validadeDias: value.validade === 'sem' ? null : value.validade === '90' ? 90 : 365,
          },
        });
      } catch {
        return; // A mensagem vem de `criar.error`.
      }
      await queryClient.invalidateQueries({ queryKey: [{ url: '/chaves-robo' }] });
      onCriada({ ...criada, nome });
    },
  });

  return (
    <PainelLateral titulo="Nova chave" onFechar={onCancelar}>
      <form
        noValidate
        onSubmit={(evento) => {
          evento.preventDefault();
          void form.handleSubmit();
        }}
        className="flex flex-col gap-4 p-4"
      >
        {criar.error && <ErroDaCriacao erro={criar.error} />}
        <form.AppField name="nome">
          {(field) => (
            <field.TextField
              label="Nome do robô"
              placeholder="Ex.: Importação de laudos"
              autoComplete="off"
              required
            />
          )}
        </form.AppField>
        <form.AppField name="descricao">
          {(field) => (
            <field.TextField
              label="O que ele faz"
              placeholder="Ex.: Traz os laudos da MobileMed a cada 30 min"
              autoComplete="off"
            />
          )}
        </form.AppField>
        <form.Field name="permissoes">
          {(field) => {
            const erro = field.state.meta.errors
              .map((e) => (typeof e === 'string' ? e : (e as { message?: string })?.message))
              .find(Boolean);
            return (
              <fieldset
                aria-describedby={erro ? erroId : undefined}
                className="m-0 flex min-w-0 flex-col gap-2 p-0"
              >
                <legend id={legendaId} className="mb-1 flex items-baseline gap-1 font-medium">
                  Permissões
                  <span aria-hidden="true" className="text-destructive">
                    *
                  </span>
                </legend>
                <span className="text-muted-foreground text-[13px]">
                  Marque só o que o robô precisa. Robôs não abrem telas.
                </span>
                {permissoes.map((permissao) => (
                  // biome-ignore lint/a11y/noLabelWithoutControl: o Checkbox do Base UI renderiza o input dentro do label.
                  <label key={permissao.chave} className="flex min-h-8 items-start gap-2">
                    <CaixaDeSelecao
                      className="mt-0.5"
                      checked={field.state.value.includes(permissao.chave)}
                      onCheckedChange={(marcada) =>
                        field.handleChange(
                          marcada
                            ? [...field.state.value, permissao.chave]
                            : field.state.value.filter((chave) => chave !== permissao.chave),
                        )
                      }
                    />
                    <span className="flex min-w-0 flex-col">
                      <span>{permissao.rotulo}</span>
                      <code className="text-subtle-foreground font-mono text-xs">
                        {permissao.chave}
                      </code>
                    </span>
                  </label>
                ))}
                {erro && (
                  <span id={erroId} className="text-destructive text-[13px]">
                    {erro}
                  </span>
                )}
              </fieldset>
            );
          }}
        </form.Field>
        <form.AppField name="validade">
          {(field) => (
            <field.SelectField
              label="Validade"
              placeholder="Escolha a validade"
              required
              opcoes={VALIDADES}
              description="Ao vencer, o robô para de funcionar. Gere a chave nova antes e revogue a antiga."
            />
          )}
        </form.AppField>
        <form.AppForm>
          <form.RequiredLegend />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancelar}
              className={buttonClassName({ variant: 'secondary' })}
            >
              Cancelar
            </button>
            <form.SubmitButton pendingLabel="Criando…">Criar chave</form.SubmitButton>
          </div>
        </form.AppForm>
      </form>
    </PainelLateral>
  );
}

function ErroDaCriacao({ erro }: { erro: Error }) {
  if (ResponseError.is(erro) && (erro.status === 400 || erro.status === 403)) {
    const { message } = erro.data as { message?: string | string[] };
    const texto = Array.isArray(message) ? message.join(' ') : message;
    if (texto) return <Alerta tom="erro">{texto}</Alerta>;
  }
  return (
    <Alerta tom="erro">
      Não foi possível criar a chave agora. Confira sua conexão e tente de novo.
    </Alerta>
  );
}
