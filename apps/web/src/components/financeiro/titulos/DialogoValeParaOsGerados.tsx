import { useState } from 'react';

import type { TituloAjustavelDto } from '../../../gen/types/TituloAjustavelDto';
import { formatarDia } from '../../../lib/financeiro';
import { plural } from '../../../lib/formato';
import { numeroDoTitulo, type TipoTitulo } from '../../../lib/titulos';
import { Alerta } from '../../alerta/Alerta';
import { mensagemDaApi } from '../../alerta/mensagem-da-api';
import { Dialogo } from '../../dialogo/Dialogo';
import { OpcoesField } from '../../escala/campos';
import { useAppForm } from '../../form/form';

/**
 * Ao salvar a recorrência que já gerou títulos: a mudança vale também para os gerados em aberto,
 * sem baixa e não editados à mão (com a lista e a contagem), ou só para os próximos.
 */
export function DialogoValeParaOsGerados({
  tipo,
  ajustaveis,
  onConfirmar,
  onFechar,
}: {
  tipo: TipoTitulo;
  ajustaveis: TituloAjustavelDto[];
  onConfirmar: (aplicarAosGerados: boolean) => Promise<void>;
  onFechar: () => void;
}) {
  const [erro, setErro] = useState<string>();
  const quantos = plural(ajustaveis.length, { um: 'título', varios: 'títulos' });
  const form = useAppForm({
    defaultValues: { alcance: 'todos' },
    onSubmit: async ({ value }) => {
      setErro(undefined);
      try {
        await onConfirmar(value.alcance === 'todos');
      } catch (falha) {
        setErro(mensagemDaApi(falha, 'Não foi possível salvar agora. Tente de novo.'));
      }
    },
  });

  return (
    <Dialogo
      titulo="Salvar a alteração da recorrência?"
      descricao="Os títulos que ainda vão ser gerados saem com os dados novos."
      onFechar={onFechar}
      onEnviar={() => void form.handleSubmit()}
      acao={
        <form.AppForm>
          <form.SubmitButton pendingLabel="Salvando…">Salvar alteração</form.SubmitButton>
        </form.AppForm>
      }
    >
      {erro && <Alerta tom="erro">{erro}</Alerta>}
      <form.AppField name="alcance">
        {() => (
          <OpcoesField
            label="Vale para"
            opcoes={[
              { valor: 'todos', rotulo: `Também nos ${quantos} já gerados, em aberto e sem baixa` },
              { valor: 'proximos', rotulo: 'Só nos que ainda vão ser gerados' },
            ]}
          />
        )}
      </form.AppField>
      <ul className="text-muted-foreground flex flex-col gap-0.5 text-[13px] tabular-nums">
        {ajustaveis.slice(0, 12).map((t) => (
          <li key={t.id}>{`${numeroDoTitulo(tipo, t.numero)} · ${formatarDia(t.vencimento)}`}</li>
        ))}
        {ajustaveis.length > 12 && <li>{`e mais ${ajustaveis.length - 12}`}</li>}
      </ul>
      <p className="text-muted-foreground text-[13px]">
        Título pago, com baixa ou editado à mão não muda.
      </p>
    </Dialogo>
  );
}
