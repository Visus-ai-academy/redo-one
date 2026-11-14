import { X } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { useId } from 'react';
import { z } from 'zod';

import { ResponseError } from '../../gen/.kubb/client';
import { useUsuariosControllerConvidar } from '../../gen/hooks/useUsuariosControllerConvidar';
import type { PapelAtribuivelDto } from '../../gen/types/PapelAtribuivelDto';
import { Alerta } from '../alerta/Alerta';
import { buttonClassName } from '../button/button-class';
import { useAppForm } from '../form/form';

const soDigitos = (texto: string) => texto.replace(/\D/g, '');

const schema = z.object({
  nome: z.string().trim().min(1, 'Informe o nome.'),
  email: z.email('Informe um e-mail válido, como nome@empresa.com.br.'),
  cpf: z
    .string()
    .refine(
      (cpf) => cpf.trim() === '' || soDigitos(cpf).length === 11,
      'O CPF precisa ter 11 dígitos.',
    ),
  papelId: z.string().min(1, 'Escolha o papel.'),
});

type PainelConviteProps = {
  papeis: PapelAtribuivelDto[];
  onConvidado: (id: string, email: string) => void;
  onCancelar: () => void;
};

/** Convite de um usuário novo, no painel ao lado da lista (`?convidar=1`). */
export function PainelConvite({ papeis, onConvidado, onCancelar }: PainelConviteProps) {
  const queryClient = useQueryClient();
  const convidar = useUsuariosControllerConvidar();
  const tituloId = useId();

  const form = useAppForm({
    defaultValues: { nome: '', email: '', cpf: '', papelId: '' },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      const email = value.email.trim().toLowerCase();
      let criado: { id: string };
      try {
        criado = await convidar.mutateAsync({
          body: {
            nome: value.nome.trim(),
            email,
            cpf: value.cpf.trim() ? soDigitos(value.cpf) : null,
            papelId: value.papelId,
          },
        });
      } catch {
        return; // A mensagem vem de `convidar.error`.
      }
      await queryClient.invalidateQueries({ queryKey: [{ url: '/usuarios' }] });
      onConvidado(criado.id, email);
    },
  });

  return (
    <aside
      aria-labelledby={tituloId}
      className="bg-card flex min-w-0 flex-[1_1_340px] flex-col self-start rounded-lg border lg:max-w-[400px]"
    >
      <div className="flex items-center justify-between gap-3 border-b p-4">
        <h2 id={tituloId} className="text-base font-semibold">
          Convidar usuário
        </h2>
        <button
          type="button"
          onClick={onCancelar}
          aria-label="Fechar painel"
          className={buttonClassName({ variant: 'ghost', className: 'size-9 flex-none px-0' })}
        >
          <X size={18} aria-hidden />
        </button>
      </div>
      <form
        noValidate
        onSubmit={(evento) => {
          evento.preventDefault();
          void form.handleSubmit();
        }}
        className="flex flex-col gap-4 p-4"
      >
        <p className="text-muted-foreground">
          A pessoa recebe um e-mail com o link para criar a senha. O link vale por 7 dias.
        </p>
        {convidar.error && <ErroDoConvite erro={convidar.error} />}
        <form.AppField name="nome">
          {(field) => (
            <field.TextField
              label="Nome"
              placeholder="Ex.: Maria Souza"
              autoComplete="off"
              required
            />
          )}
        </form.AppField>
        <form.AppField name="email">
          {(field) => (
            <field.TextField
              label="E-mail"
              type="email"
              placeholder="nome@empresa.com.br"
              autoComplete="off"
              required
            />
          )}
        </form.AppField>
        <form.AppField name="cpf">
          {(field) => (
            <field.TextField
              label="CPF"
              placeholder="000.000.000-00"
              autoComplete="off"
              description="Com o CPF, a pessoa também pode entrar digitando o CPF."
            />
          )}
        </form.AppField>
        <form.AppField name="papelId">
          {(field) => (
            <field.SelectField
              label="Papel"
              placeholder="Escolha um papel"
              required
              description="Aparecem só papéis com permissões que você também tem."
              opcoes={papeis
                .filter((papel) => papel.atribuivel)
                .map((papel) => ({ valor: papel.id, rotulo: papel.nome }))}
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
            <form.SubmitButton pendingLabel="Enviando…">Enviar convite</form.SubmitButton>
          </div>
        </form.AppForm>
      </form>
    </aside>
  );
}

function ErroDoConvite({ erro }: { erro: Error }) {
  if (
    ResponseError.is(erro) &&
    (erro.status === 409 || erro.status === 403 || erro.status === 400)
  ) {
    const { message } = erro.data as { message?: string };
    if (message) return <Alerta tom="erro">{message}</Alerta>;
  }
  return (
    <Alerta tom="erro">
      Não foi possível enviar o convite agora. Confira sua conexão e tente de novo.
    </Alerta>
  );
}
