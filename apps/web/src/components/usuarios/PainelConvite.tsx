import { Button } from '@base-ui/react/button';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { ResponseError } from '../../gen/.kubb/client';
import { useUsuariosControllerConvidar } from '../../gen/hooks/useUsuariosControllerConvidar';
import type { PapelAtribuivelDto } from '../../gen/types/PapelAtribuivelDto';
import { Alerta } from '../alerta/Alerta';
import { buttonClassName } from '../button/button-class';
import { useAppForm } from '../form/form';
import { PainelLateral } from '../painel/PainelLateral';

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

type PainelConviteProps = {
  papeis: PapelAtribuivelDto[];
  onConvidado: (id: string, email: string) => void;
  onCancelar: () => void;
};

/** Convite de um usuário novo, no painel ao lado da lista (`?convidar=1`). */
export function PainelConvite({ papeis, onConvidado, onCancelar }: PainelConviteProps) {
  const queryClient = useQueryClient();
  const convidar = useUsuariosControllerConvidar();

  const form = useAppForm({
    defaultValues: { nome: '', email: '', cpf: '', papelIds: [] as string[] },
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

  return (
    <PainelLateral titulo="Convidar usuário" onFechar={onCancelar}>
      <form
        method="post"
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
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              onClick={onCancelar}
              className={buttonClassName({ variant: 'secondary' })}
            >
              Cancelar
            </Button>
            <form.SubmitButton pendingLabel="Enviando…">Enviar convite</form.SubmitButton>
          </div>
        </form.AppForm>
      </form>
    </PainelLateral>
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
