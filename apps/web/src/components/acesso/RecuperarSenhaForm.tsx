import { EnvelopeSimple, Info } from '@phosphor-icons/react';
import { useState } from 'react';
import { z } from 'zod';

import { useSenhaControllerSolicitarRecuperacao } from '../../gen/hooks/useSenhaControllerSolicitarRecuperacao';
import { Alerta } from '../alerta/Alerta';
import { useAppForm } from '../form/form';
import { VoltarParaLogin } from './VoltarParaLogin';

const schema = z.object({
  email: z.email('Informe um e-mail válido, como nome@empresa.com.br.'),
});

export function RecuperarSenhaForm() {
  const [enviado, setEnviado] = useState(false);
  const solicitar = useSenhaControllerSolicitarRecuperacao();

  const form = useAppForm({
    defaultValues: { email: '' },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      try {
        await solicitar.mutateAsync({ body: { email: value.email.trim() } });
        setEnviado(true);
      } catch {
        // A mensagem vem de `solicitar.error`.
      }
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <VoltarParaLogin className="self-start" />

      {enviado ? (
        <div role="status" className="flex flex-col gap-5">
          <span className="bg-accent text-accent-foreground flex size-11 items-center justify-center rounded-lg">
            <EnvelopeSimple size={24} aria-hidden />
          </span>
          <div className="flex flex-col gap-2">
            <h1 className="text-[28px] leading-tight font-semibold">Confira seu e-mail</h1>
            <p className="text-muted-foreground leading-relaxed">
              Se o e-mail tiver uma conta no One, o link chega em alguns minutos. Ele vale por 1
              hora e funciona uma vez só.
            </p>
          </div>
          <p className="text-muted-foreground border-t pt-5 leading-normal">
            Não chegou? Veja a caixa de spam ou{' '}
            <button
              type="button"
              onClick={() => setEnviado(false)}
              className="text-primary hover:text-primary-hover font-medium underline underline-offset-2"
            >
              envie de novo
            </button>
            .
          </p>
        </div>
      ) : (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
          className="flex flex-col gap-5"
        >
          <div className="mb-1 flex flex-col gap-2">
            <h1 className="text-[28px] leading-tight font-semibold">Recuperar senha</h1>
            <p className="text-muted-foreground leading-normal">
              Informe o e-mail da sua conta. Enviamos um link para você criar uma nova senha.
            </p>
          </div>

          {solicitar.error && (
            <Alerta tom="erro">
              Não foi possível enviar o link agora. Confira sua conexão e tente de novo.
            </Alerta>
          )}

          <form.AppField name="email">
            {(field) => (
              <field.TextField
                label="E-mail da conta"
                type="email"
                placeholder="nome@empresa.com.br"
                autoComplete="email"
                size="acesso"
                required
              />
            )}
          </form.AppField>

          <form.AppForm>
            <form.SubmitButton size="acesso" pendingLabel="Enviando…" className="mt-1 w-full">
              Enviar link
            </form.SubmitButton>
          </form.AppForm>

          <div className="text-muted-foreground flex items-start gap-3 border-t pt-5 leading-normal">
            <Info size={18} aria-hidden className="text-subtle-foreground mt-px flex-none" />
            <p>
              <strong className="text-foreground font-medium">Entra só com o CPF?</strong> Peça a
              quem administra o One na sua equipe para enviar o link.
            </p>
          </div>
        </form>
      )}
    </div>
  );
}
