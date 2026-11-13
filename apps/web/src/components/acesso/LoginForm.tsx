import { EnvelopeSimple } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';

import { ResponseError } from '../../gen/.kubb/client';
import { useSessaoControllerEntrar } from '../../gen/hooks/useSessaoControllerEntrar';
import { horaDeBrasilia } from '../../lib/acesso';
import { SESSAO_QUERY_KEY } from '../../lib/sessao';
import { Alerta } from '../alerta/Alerta';
import { useAppForm } from '../form/form';
import { linkClassName } from './link-class';

const schema = z.object({
  identificador: z.string().trim().min(1, 'Informe o e-mail ou o CPF.'),
  senha: z.string().min(1, 'Informe a senha.'),
});

/** Formulário da tela Entrar. `destino` é o caminho interno já validado (ver `destinoSeguro`). */
export function LoginForm({ destino }: { destino: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const entrar = useSessaoControllerEntrar();

  const form = useAppForm({
    defaultValues: { identificador: '', senha: '' },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      try {
        await entrar.mutateAsync({ body: value });
      } catch {
        return; // A mensagem vem de `entrar.error`.
      }
      queryClient.removeQueries({ queryKey: SESSAO_QUERY_KEY });
      await navigate({ href: destino, replace: true });
    },
  });

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
      className="flex flex-col gap-5"
    >
      <div className="mb-1 flex flex-col gap-2">
        <h1 className="text-[28px] leading-tight font-semibold">Entrar</h1>
        <p className="text-muted-foreground">Use o e-mail ou o CPF cadastrado no One.</p>
      </div>

      {entrar.error && <ErroDeLogin erro={entrar.error} />}

      <form.AppField name="identificador">
        {(field) => (
          <field.TextField
            label="E-mail ou CPF"
            placeholder="nome@empresa.com.br ou 000.000.000-00"
            autoComplete="username"
            size="acesso"
            required
          />
        )}
      </form.AppField>

      <form.AppField name="senha">
        {(field) => (
          <field.PasswordField
            label="Senha"
            placeholder="Digite sua senha"
            autoComplete="current-password"
            size="acesso"
            required
            labelAction={
              <Link to="/recuperar-senha" className={linkClassName}>
                Esqueci minha senha
              </Link>
            }
          />
        )}
      </form.AppField>

      <form.AppForm>
        <form.SubmitButton size="acesso" pendingLabel="Entrando…" className="mt-1 w-full">
          Entrar
        </form.SubmitButton>
      </form.AppForm>

      <div className="text-muted-foreground flex items-start gap-3 border-t pt-5 leading-normal">
        <EnvelopeSimple size={18} aria-hidden className="text-subtle-foreground mt-px flex-none" />
        <p>
          <strong className="text-foreground font-medium">Primeiro acesso?</strong> Abra o link do
          convite que chegou no seu e-mail para criar a senha.
        </p>
      </div>
    </form>
  );
}

function ErroDeLogin({ erro }: { erro: Error }) {
  if (ResponseError.is(erro) && erro.status === 429) {
    const { bloqueadoAte } = erro.data as { bloqueadoAte: string };
    return (
      <Alerta tom="bloqueio">
        Acesso bloqueado até {horaDeBrasilia(bloqueadoAte)} por excesso de tentativas. Espere,{' '}
        <Link to="/recuperar-senha" className="font-semibold underline underline-offset-2">
          crie uma nova senha
        </Link>{' '}
        ou peça a quem administra o One para liberar.
      </Alerta>
    );
  }
  if (ResponseError.is(erro) && erro.status === 401) {
    const { message } = erro.data as { message: string };
    return (
      <Alerta tom="erro">
        {message} Depois de 5 tentativas seguidas, o acesso fica bloqueado por 15 minutos.
      </Alerta>
    );
  }
  return (
    <Alerta tom="erro">Não foi possível entrar agora. Confira sua conexão e tente de novo.</Alerta>
  );
}
