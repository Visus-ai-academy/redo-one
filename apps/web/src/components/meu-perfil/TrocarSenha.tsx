import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';

import { ResponseError } from '../../gen/.kubb/client';
import { contaControllerObterQueryKey } from '../../gen/hooks/useContaControllerObter';
import { useContaControllerTrocarSenha } from '../../gen/hooks/useContaControllerTrocarSenha';
import { dataDeBrasilia } from '../../lib/datas';
import { ERRO_CONFIRMACAO, regraNovaSenha, senhasIguais } from '../../lib/senha';
import { Alerta } from '../alerta/Alerta';
import { useAppForm } from '../form/form';
import { Painel } from '../painel/Painel';
import { RequisitosSenha } from '../senha/RequisitosSenha';

const schema = z
  .object({
    senhaAtual: z.string().min(1, 'Informe a senha atual.'),
    senha: regraNovaSenha,
    confirmacao: z.string(),
  })
  .refine(senhasIguais, ERRO_CONFIRMACAO);

function avisoDeTroca(sessoesEncerradas: number) {
  if (sessoesEncerradas === 0) return 'Senha trocada.';
  if (sessoesEncerradas === 1) return 'Senha trocada. A outra sessão foi encerrada.';
  return `Senha trocada. As outras ${sessoesEncerradas} sessões foram encerradas.`;
}

/** Seção Senha de Meu perfil; é o destino de "Segurança" na central (âncora #seguranca). */
export function TrocarSenha({ senhaAlteradaEm }: { senhaAlteradaEm: string | null }) {
  const queryClient = useQueryClient();
  const trocar = useContaControllerTrocarSenha();
  const [aviso, setAviso] = useState<string>();

  const form = useAppForm({
    defaultValues: { senhaAtual: '', senha: '', confirmacao: '' },
    validators: { onSubmit: schema },
    onSubmit: async ({ value, formApi }) => {
      setAviso(undefined);
      let resultado: { sessoesEncerradas: number };
      try {
        resultado = await trocar.mutateAsync({
          body: { senhaAtual: value.senhaAtual, novaSenha: value.senha },
        });
      } catch {
        return; // A mensagem vem de `trocar.error`.
      }
      // A data da troca e a lista de sessões mudaram: recarrega antes de avisar, para o aviso e
      // a data nova aparecerem juntos.
      await queryClient.invalidateQueries({ queryKey: contaControllerObterQueryKey() });
      formApi.reset();
      setAviso(avisoDeTroca(resultado.sessoesEncerradas));
    },
  });

  return (
    <Painel
      id="seguranca"
      titulo="Senha"
      descricao={`${senhaAlteradaEm ? `Trocada pela última vez em ${dataDeBrasilia(senhaAlteradaEm)}. ` : ''}Ao trocar, suas outras sessões são encerradas.`}
    >
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
        className="flex flex-col gap-4 p-4"
      >
        {aviso && <Alerta tom="sucesso">{aviso}</Alerta>}
        {trocar.error && <ErroAoTrocar erro={trocar.error} />}
        <form.AppField name="senhaAtual">
          {(field) => (
            <field.PasswordField
              label="Senha atual"
              placeholder="Digite sua senha atual"
              autoComplete="current-password"
              required
              className="md:max-w-[calc(50%-8px)]"
            />
          )}
        </form.AppField>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-4">
          <form.AppField name="senha">
            {(field) => (
              <field.PasswordField
                label="Nova senha"
                placeholder="Mínimo de 8 caracteres"
                autoComplete="new-password"
                required
              />
            )}
          </form.AppField>
          <form.AppField name="confirmacao">
            {(field) => (
              <field.PasswordField
                label="Repita a nova senha"
                placeholder="Digite a senha de novo"
                autoComplete="new-password"
                required
              />
            )}
          </form.AppField>
        </div>
        <form.Subscribe selector={(state) => state.values}>
          {({ senha, confirmacao }) => <RequisitosSenha senha={senha} confirmacao={confirmacao} />}
        </form.Subscribe>
        <form.AppForm>
          <div className="flex justify-end">
            <form.SubmitButton pendingLabel="Trocando…">Trocar senha</form.SubmitButton>
          </div>
        </form.AppForm>
      </form>
    </Painel>
  );
}

function ErroAoTrocar({ erro }: { erro: Error }) {
  if (ResponseError.is(erro) && erro.status === 400) {
    const { message, problemas } = erro.data as { message?: string; problemas?: string[] };
    return <Alerta tom="erro">{problemas?.length ? problemas.join(' ') : message}</Alerta>;
  }
  return (
    <Alerta tom="erro">
      Não foi possível trocar a senha agora. Confira sua conexão e tente de novo.
    </Alerta>
  );
}
