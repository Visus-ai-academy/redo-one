import { useState } from 'react';
import { z } from 'zod';

import { Alerta } from '../alerta/Alerta';
import { mensagemDaApi } from '../alerta/mensagem-da-api';
import { Dialogo } from '../dialogo/Dialogo';
import { useAppForm } from '../form/form';
import { useAlterado } from '../painel/fechamento';

const schema = z.object({
  motivo: z.string().trim().min(1, 'Informe o motivo.').max(1000, 'Use até 1.000 caracteres.'),
});

type DialogoMotivoProps = {
  /** Diz a consequência ("Recalcular o repasse de Novembro/2026?"). */
  titulo: string;
  descricao: string;
  /** O verbo do botão ("Recalcular", "Cancelar lançamento"). */
  acao: string;
  /** O botão enquanto a chamada roda ("Pedindo…"). */
  pendente: string;
  placeholder: string;
  /** Recebe o motivo aparado; se falhar, o erro aparece no diálogo e o motivo fica. */
  onConfirmar: (motivo: string) => Promise<void>;
  onFechar: () => void;
};

/** Ação pontual que pede um motivo obrigatório, que fica no histórico (recálculo, cancelamento). */
export function DialogoMotivo({
  titulo,
  descricao,
  acao,
  pendente,
  placeholder,
  onConfirmar,
  onFechar,
}: DialogoMotivoProps) {
  const [erro, setErro] = useState<string>();
  const form = useAppForm({
    defaultValues: { motivo: '' },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      setErro(undefined);
      try {
        await onConfirmar(value.motivo.trim());
      } catch (falha) {
        setErro(
          mensagemDaApi(
            falha,
            'Não foi possível concluir agora. Confira sua conexão e tente de novo.',
          ),
        );
      }
    },
  });
  const alterado = useAlterado(form, { motivo: '' });

  return (
    <Dialogo
      titulo={titulo}
      descricao={descricao}
      alterado={alterado}
      onFechar={onFechar}
      onEnviar={() => void form.handleSubmit()}
      acao={
        <form.AppForm>
          <form.SubmitButton pendingLabel={pendente}>{acao}</form.SubmitButton>
        </form.AppForm>
      }
    >
      <div className="flex flex-col gap-4">
        {erro && <Alerta tom="erro">{erro}</Alerta>}
        <form.AppField name="motivo">
          {(field) => (
            <field.TextAreaField
              label="Motivo"
              required
              placeholder={placeholder}
              description="Fica no histórico, com quem pediu e quando."
            />
          )}
        </form.AppField>
      </div>
    </Dialogo>
  );
}
