import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { ResponseError } from '../../gen/.kubb/client';
import { useUsuariosControllerConvidar } from '../../gen/hooks/useUsuariosControllerConvidar';
import type { PapelAtribuivelDto } from '../../gen/types/PapelAtribuivelDto';
import { Alerta } from '../alerta/Alerta';
import { Dialogo } from '../dialogo/Dialogo';
import { useAppForm } from '../form/form';
import { useAlterado } from '../painel/fechamento';

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
  papelIds: z.array(z.string()).min(1, 'Escolha pelo menos um papel.'),
});

type DialogoConviteProps = {
  papeis: PapelAtribuivelDto[];
  onConvidado: (id: string, email: string) => void;
  onCancelar: () => void;
};

const INICIAIS = { nome: '', email: '', cpf: '', papelIds: [] as string[] };

/** Convite de um usuário novo, num diálogo sobre a lista (`?convidar=1`): tarefa curta e atômica. */
export function DialogoConvite({ papeis, onConvidado, onCancelar }: DialogoConviteProps) {
  const queryClient = useQueryClient();
  const convidar = useUsuariosControllerConvidar();

  const form = useAppForm({
    defaultValues: INICIAIS,
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
            papelIds: value.papelIds,
          },
        });
      } catch {
        return; // A mensagem vem de `convidar.error`.
      }
      await queryClient.invalidateQueries({ queryKey: [{ url: '/usuarios' }] });
      onConvidado(criado.id, email);
    },
  });

  const alterado = useAlterado(form, INICIAIS);

  return (
    <Dialogo
      titulo="Convidar usuário"
      descricao="A pessoa recebe um e-mail com o link para criar a senha. O link vale por 7 dias."
      alterado={alterado}
      onFechar={onCancelar}
      onEnviar={() => void form.handleSubmit()}
      acao={
        <form.AppForm>
          <form.SubmitButton pendingLabel="Enviando…">Enviar convite</form.SubmitButton>
        </form.AppForm>
      }
    >
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
            mascara="cpf"
            placeholder="000.000.000-00"
            autoComplete="off"
            description="Com o CPF, a pessoa também pode entrar digitando o CPF."
          />
        )}
      </form.AppField>
      <form.AppField name="papelIds">
        {(field) => (
          <field.CheckboxListField
            label="Papéis"
            required
            description="A pessoa pode tudo o que algum dos papéis permite. Aparecem só papéis com permissões que você também tem."
            opcoes={papeis
              .filter((papel) => papel.atribuivel)
              .map((papel) => ({ valor: papel.id, rotulo: papel.nome }))}
          />
        )}
      </form.AppField>
      <form.AppForm>
        <form.RequiredLegend />
      </form.AppForm>
    </Dialogo>
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
