import { Link } from '@tanstack/react-router';
import { z } from 'zod';

import type { FechamentoComAvisosDto } from '../../gen/types/FechamentoComAvisosDto';
import type { TipoAvisoKey } from '../../gen/types/TipoAviso';
import { tipoDoAviso } from '../../lib/avisos';
import { plural } from '../../lib/formato';
import { Alerta } from '../alerta/Alerta';
import { buttonClassName } from '../button/button-class';
import { useErroDoPainel } from '../catalogo/use-erro-do-painel';
import { Dialogo } from '../dialogo/Dialogo';
import { useAppForm } from '../form/form';
import { useAlterado } from '../painel/fechamento';
import { mesAno } from './competencias';

const schema = z.object({
  motivo: z
    .string()
    .trim()
    .min(1, 'Informe por que a competência fecha com avisos pendentes.')
    .max(500, 'Use até 500 caracteres.'),
});

/**
 * Fechamento recusado por avisos pendentes que impedem: lista os avisos (com o link para a lista
 * filtrada pela competência) e, para quem tem a permissão própria, pede o motivo para fechar mesmo
 * assim. O motivo fica no fechamento e na auditoria.
 */
export function AvisosDoFechamento({
  competencia,
  recusa,
  onFecharMesmoAssim,
  onFechar,
}: {
  competencia: string;
  recusa: FechamentoComAvisosDto;
  onFecharMesmoAssim: (motivo: string) => Promise<void>;
  onFechar: () => void;
}) {
  const { erro, tentar } = useErroDoPainel();
  const form = useAppForm({
    defaultValues: { motivo: '' },
    validators: { onSubmit: schema },
    onSubmit: ({ value }) =>
      tentar(
        () => onFecharMesmoAssim(value.motivo.trim()),
        'Não foi possível fechar agora. Confira sua conexão e tente de novo.',
      ),
  });
  const alterado = useAlterado(form, { motivo: '' });
  const { total, itens } = recusa.avisos;
  const mes = mesAno(competencia);
  const lista = (
    <Link
      to="/avisos"
      search={{ competencia }}
      className={buttonClassName({ variant: recusa.podeFecharComAvisos ? 'secondary' : 'primary' })}
    >
      Ver os avisos
    </Link>
  );

  return (
    <Dialogo
      titulo={`A competência ${mes} tem avisos pendentes`}
      descricao={`${plural(total, { um: 'aviso pendente impede', varios: 'avisos pendentes impedem' })} fechar a competência. Resolva ${total === 1 ? 'o aviso' : 'os avisos'} antes de fechar.`}
      onFechar={onFechar}
      alterado={alterado}
      onEnviar={recusa.podeFecharComAvisos ? () => void form.handleSubmit() : undefined}
      acao={
        recusa.podeFecharComAvisos ? (
          <>
            {lista}
            <form.AppForm>
              <form.SubmitButton pendingLabel="Fechando…">Fechar mesmo assim</form.SubmitButton>
            </form.AppForm>
          </>
        ) : (
          lista
        )
      }
    >
      <ul className="divide-y rounded-lg border">
        {itens.map((a) => (
          <li key={a.id} className="flex flex-col gap-0.5 px-3 py-2">
            <span className="text-muted-foreground text-xs">
              {tipoDoAviso(a.tipo as TipoAvisoKey)}
            </span>
            <Link
              to="/avisos"
              search={{ id: a.id }}
              className="focus-visible:outline-ring break-words hover:underline focus-visible:outline-2"
            >
              {a.valor}
            </Link>
          </li>
        ))}
      </ul>
      {total > itens.length && (
        <p className="text-muted-foreground text-[13px]">
          {`E mais ${plural(total - itens.length, { um: 'aviso', varios: 'avisos' })} na lista.`}
        </p>
      )}
      {erro && <Alerta tom="erro">{erro}</Alerta>}
      {recusa.podeFecharComAvisos && (
        <form.AppField name="motivo">
          {(field) => (
            <field.TextAreaField
              label="Motivo para fechar com avisos"
              required
              placeholder="Ex.: o cliente novo é cadastrado amanhã e a fatura não pode esperar"
              description="Fica no fechamento da competência e na auditoria, com quem fechou."
            />
          )}
        </form.AppField>
      )}
    </Dialogo>
  );
}
