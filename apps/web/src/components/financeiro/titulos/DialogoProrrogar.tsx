import { useState } from 'react';
import { z } from 'zod';

import { formatarDia } from '../../../lib/financeiro';
import { Alerta } from '../../alerta/Alerta';
import { mensagemDaApi } from '../../alerta/mensagem-da-api';
import { Dialogo } from '../../dialogo/Dialogo';
import { DateField } from '../../form/DateField';
import { mostrarErrosDoServidor } from '../../form/erros-do-servidor';
import { useAppForm } from '../../form/form';
import { useAlterado } from '../../painel/fechamento';

/** Prorrogar o vencimento: novo dia e motivo; o vencimento original fica guardado no título. */
export function DialogoProrrogar({
  numero,
  vencimento,
  emissaoEm,
  onProrrogar,
  onFechar,
}: {
  /** "P-0045". */
  numero: string;
  vencimento: string;
  emissaoEm: string;
  onProrrogar: (dados: { vencimento: string; motivo: string }) => Promise<void>;
  onFechar: () => void;
}) {
  const [erro, setErro] = useState<string>();
  const schema = z.object({
    vencimento: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe o novo vencimento.')
      .refine((v) => v !== vencimento, 'Escolha um vencimento diferente do atual.')
      .refine((v) => v >= emissaoEm, 'O vencimento não pode ser antes da emissão.'),
    motivo: z.string().trim().min(1, 'Informe o motivo.').max(1000, 'Use até 1.000 caracteres.'),
  });
  const iniciais = { vencimento: '', motivo: '' };
  const form = useAppForm({
    defaultValues: iniciais,
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      setErro(undefined);
      try {
        await onProrrogar({ vencimento: value.vencimento, motivo: value.motivo.trim() });
      } catch (falha) {
        if (!mostrarErrosDoServidor(form, falha)) {
          setErro(mensagemDaApi(falha, 'Não foi possível prorrogar agora. Tente de novo.'));
        }
      }
    },
  });
  const alterado = useAlterado(form, iniciais);

  return (
    <Dialogo
      titulo="Prorrogar vencimento"
      descricao={`${numero} · vence em ${formatarDia(vencimento)}. O vencimento original fica guardado.`}
      alterado={alterado}
      onFechar={onFechar}
      onEnviar={() => void form.handleSubmit()}
      acao={
        <form.AppForm>
          <form.SubmitButton pendingLabel="Prorrogando…">Prorrogar</form.SubmitButton>
        </form.AppForm>
      }
    >
      {erro && <Alerta tom="erro">{erro}</Alerta>}
      <form.AppField name="vencimento">
        {() => <DateField label="Novo vencimento" required min={emissaoEm} />}
      </form.AppField>
      <form.AppField name="motivo">
        {(field) => (
          <field.TextAreaField
            label="Motivo"
            required
            placeholder="Ex.: fornecedor aceitou pagar no mês que vem"
            description="Fica no histórico, com quem pediu e quando."
          />
        )}
      </form.AppField>
    </Dialogo>
  );
}
