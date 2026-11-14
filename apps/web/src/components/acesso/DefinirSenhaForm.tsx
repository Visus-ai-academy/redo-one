import { Clock } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { z } from 'zod';

import { ResponseError } from '../../gen/.kubb/client';
import { useSenhaControllerDefinir } from '../../gen/hooks/useSenhaControllerDefinir';
import type { InfoLinkDto } from '../../gen/types/InfoLinkDto';
import { ERRO_CONFIRMACAO, regraNovaSenha, senhasIguais } from '../../lib/senha';
import { SESSAO_QUERY_KEY } from '../../lib/sessao';
import { Alerta } from '../alerta/Alerta';
import { buttonClassName } from '../button/button-class';
import { useAppForm } from '../form/form';
import { RequisitosSenha } from '../senha/RequisitosSenha';
import { VoltarParaLogin } from './VoltarParaLogin';

const schema = z
  .object({ senha: regraNovaSenha, confirmacao: z.string() })
  .refine(senhasIguais, ERRO_CONFIRMACAO);

const destaque = 'font-semibold text-foreground';

/** Formulário de Definir senha, para o link de convite ou de recuperação já consultado na API. */
export function DefinirSenhaForm({ token, link }: { token: string; link: InfoLinkDto }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const definir = useSenhaControllerDefinir();
  const [expirou, setExpirou] = useState(false);
  const convite = link.tipo === 'convite';

  const form = useAppForm({
    defaultValues: { senha: '', confirmacao: '' },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      try {
        await definir.mutateAsync({ body: { token, senha: value.senha } });
      } catch (erro) {
        if (ResponseError.is(erro) && erro.status === 404) setExpirou(true);
        return;
      }
      queryClient.removeQueries({ queryKey: SESSAO_QUERY_KEY });
      await navigate({ to: '/', replace: true });
    },
  });

  if (expirou) return <LinkExpirado />;

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
        <h1 className="text-[28px] leading-tight font-semibold">
          {convite ? `Crie sua senha, ${link.nome.split(' ')[0]}` : 'Crie uma nova senha'}
        </h1>
        {convite ? (
          <p className="text-muted-foreground leading-relaxed">
            {link.convidadoPor ? `${link.convidadoPor} convidou você` : 'Você foi convidado'} para o
            One com o papel <strong className={destaque}>{link.papel}</strong>. Sua conta é{' '}
            <strong className={destaque}>{link.email}</strong>.
          </p>
        ) : (
          <p className="text-muted-foreground leading-relaxed">
            Conta <strong className={destaque}>{link.email}</strong>. Ao salvar, as outras sessões
            abertas desta conta são encerradas.
          </p>
        )}
      </div>

      {definir.error && <ErroAoDefinir erro={definir.error} />}

      <form.AppField name="senha">
        {(field) => (
          <field.PasswordField
            label="Nova senha"
            placeholder="Mínimo de 8 caracteres"
            autoComplete="new-password"
            size="acesso"
            required
          />
        )}
      </form.AppField>
      <form.AppField name="confirmacao">
        {(field) => (
          <field.PasswordField
            label="Repita a senha"
            placeholder="Digite a senha de novo"
            autoComplete="new-password"
            size="acesso"
            required
          />
        )}
      </form.AppField>

      <form.Subscribe selector={(state) => state.values}>
        {({ senha, confirmacao }) => <RequisitosSenha senha={senha} confirmacao={confirmacao} />}
      </form.Subscribe>

      <form.AppForm>
        <form.SubmitButton size="acesso" pendingLabel="Salvando…" className="mt-1 w-full">
          {convite ? 'Criar senha e entrar' : 'Salvar nova senha'}
        </form.SubmitButton>
      </form.AppForm>
    </form>
  );
}

function ErroAoDefinir({ erro }: { erro: Error }) {
  if (ResponseError.is(erro) && erro.status === 400) {
    const { problemas } = erro.data as { problemas: string[] };
    return <Alerta tom="erro">{problemas.join(' ')}</Alerta>;
  }
  if (ResponseError.is(erro) && erro.status === 404) return null;
  return (
    <Alerta tom="erro">
      Não foi possível salvar a senha agora. Confira sua conexão e tente de novo.
    </Alerta>
  );
}

/** Link de convite ou recuperação vencido, já usado ou inexistente. */
export function LinkExpirado() {
  return (
    <div className="flex flex-col gap-5">
      <span className="bg-warning-soft text-warning flex size-11 items-center justify-center rounded-lg">
        <Clock size={24} aria-hidden />
      </span>
      <div className="flex flex-col gap-2">
        <h1 className="text-[28px] leading-tight font-semibold">Este link não vale mais</h1>
        <p className="text-muted-foreground leading-relaxed">
          Ele expirou ou já foi usado. Peça um link novo, ou um novo convite a quem administra o One
          na sua equipe.
        </p>
      </div>
      <Link
        to="/recuperar-senha"
        className={buttonClassName({ size: 'acesso', className: 'w-full' })}
      >
        Pedir link novo
      </Link>
      <VoltarParaLogin className="min-h-11 self-center" />
    </div>
  );
}
