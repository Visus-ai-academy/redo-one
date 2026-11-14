import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';

import { useContaControllerAtualizar } from '../../gen/hooks/useContaControllerAtualizar';
import { contaControllerObterQueryKey } from '../../gen/hooks/useContaControllerObter';
import type { MinhaContaDto } from '../../gen/types/MinhaContaDto';
import { cpfMascarado } from '../../lib/cpf';
import { SESSAO_QUERY_KEY } from '../../lib/sessao';
import { Alerta } from '../alerta/Alerta';
import { CampoSomenteLeitura } from '../form/CampoSomenteLeitura';
import { useAppForm } from '../form/form';
import { Painel } from '../painel/Painel';

const schema = z.object({ nome: z.string().trim().min(1, 'Informe o nome.') });

export function DadosDaConta({ conta }: { conta: MinhaContaDto }) {
  const queryClient = useQueryClient();
  const atualizar = useContaControllerAtualizar();
  const [salvo, setSalvo] = useState(false);

  const form = useAppForm({
    defaultValues: { nome: conta.nome },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      setSalvo(false);
      try {
        await atualizar.mutateAsync({ body: { nome: value.nome.trim() } });
      } catch {
        return; // A mensagem vem de `atualizar.error`.
      }
      setSalvo(true);
      // O nome aparece no menu (sessão) e no cabeçalho desta tela (conta).
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: SESSAO_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: contaControllerObterQueryKey() }),
      ]);
    },
  });

  return (
    <Painel titulo="Dados da conta">
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
        className="flex flex-col gap-4 p-4"
      >
        {salvo && <Alerta tom="sucesso">Dados salvos.</Alerta>}
        {atualizar.error && (
          <Alerta tom="erro">
            Não foi possível salvar agora. Confira sua conexão e tente de novo.
          </Alerta>
        )}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-4">
          <form.AppField name="nome">
            {(field) => (
              <field.TextField
                label="Nome"
                placeholder="Seu nome completo"
                autoComplete="name"
                required
              />
            )}
          </form.AppField>
          <CampoSomenteLeitura
            label="E-mail"
            value={conta.email}
            description="Para trocar, fale com quem administra o One."
          />
          <CampoSomenteLeitura label="CPF" value={cpfMascarado(conta.cpfFinal)} />
          <CampoSomenteLeitura label="Papel" value={conta.papel.nome} />
        </div>
        <form.AppForm>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <form.RequiredLegend />
            <form.SubmitButton pendingLabel="Salvando…">Salvar dados</form.SubmitButton>
          </div>
        </form.AppForm>
      </form>
    </Painel>
  );
}
