import { Button } from '@base-ui/react/button';
import { type ReactNode, useState } from 'react';
import { z } from 'zod';

import type { AvisoDto } from '../../gen/types/AvisoDto';
import { situacaoDoAviso, tipoDoAviso } from '../../lib/avisos';
import { dataHoraCurta } from '../../lib/datas';
import { Alerta } from '../alerta/Alerta';
import { buttonClassName } from '../button/button-class';
import { useErroDoPainel } from '../catalogo/use-erro-do-painel';
import { Etiqueta } from '../etiqueta/Etiqueta';
import { useAppForm } from '../form/form';

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className="text-right break-words tabular-nums">{children}</dd>
    </div>
  );
}

const schema = z.object({ motivo: z.string().max(300, 'Use até 300 caracteres.') });

/** Conteúdo do painel de um aviso de cadastro, com a triagem (ignorar ou reabrir). */
export function DetalheAviso({
  aviso,
  podeTriar,
  procurar,
  onIgnorar,
  onReabrir,
}: {
  aviso: AvisoDto;
  podeTriar: boolean;
  /** Atalho para o cadastro onde o nome deveria estar (link da tela certa, já com a busca). */
  procurar?: ReactNode;
  onIgnorar?: (motivo: string | null) => Promise<void>;
  onReabrir?: () => Promise<void>;
}) {
  const situacao = situacaoDoAviso(aviso.status);
  const { erro, tentar } = useErroDoPainel();
  const [reabrindo, setReabrindo] = useState(false);
  const form = useAppForm({
    defaultValues: { motivo: '' },
    validators: { onSubmit: schema },
    onSubmit: ({ value }) =>
      tentar(
        async () => onIgnorar?.(value.motivo.trim() || null),
        'Não foi possível ignorar agora. Tente de novo.',
      ),
  });
  const decisao = aviso.status === 'ignorado' ? 'Ignorado' : 'Resolvido';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <span>
          <Etiqueta tom={situacao.tom}>{situacao.texto}</Etiqueta>
        </span>
        {aviso.status === 'resolvido' && (
          <Alerta tom="sucesso" role="status">
            Uma importação achou o cadastro deste nome. O aviso saiu da lista de pendentes.
          </Alerta>
        )}
      </div>

      <dl className="divide-y">
        <Campo rotulo={tipoDoAviso(aviso.tipo)}>{aviso.valor}</Campo>
        <Campo rotulo="Laudos na última importação">
          {aviso.ocorrencias.toLocaleString('pt-BR')}
        </Campo>
        <Campo rotulo="Apareceu em">{dataHoraCurta(aviso.primeiraVezEm)}</Campo>
        <Campo rotulo="Visto por último em">{dataHoraCurta(aviso.ultimaVezEm)}</Campo>
        {aviso.decididoPor && <Campo rotulo={`${decisao} por`}>{aviso.decididoPor.nome}</Campo>}
        {aviso.decididoEm && aviso.status !== 'pendente' && (
          <Campo rotulo={`${decisao} em`}>{dataHoraCurta(aviso.decididoEm)}</Campo>
        )}
        {aviso.motivo && <Campo rotulo="Motivo">{aviso.motivo}</Campo>}
      </dl>

      {aviso.status === 'pendente' && procurar && (
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-[13px]">
            Se o cadastro já existe com outra grafia, acrescente este nome como apelido ou variação.
            A próxima importação resolve o aviso.
          </p>
          <div>{procurar}</div>
        </div>
      )}

      {erro && <Alerta tom="erro">{erro}</Alerta>}

      {podeTriar && aviso.status === 'pendente' && (
        <form
          className="flex flex-col gap-4 border-t pt-4"
          onSubmit={(evento) => {
            evento.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.AppField name="motivo">
            {(field) => (
              <field.TextAreaField
                label="Motivo"
                placeholder="Ex.: cliente de teste da MobileMed"
                description="Opcional. Fica registrado com quem ignorou."
              />
            )}
          </form.AppField>
          <div className="flex justify-end">
            <form.AppForm>
              <form.SubmitButton variant="secondary" pendingLabel="Ignorando…">
                Ignorar aviso
              </form.SubmitButton>
            </form.AppForm>
          </div>
        </form>
      )}

      {podeTriar && aviso.status === 'ignorado' && (
        <div className="flex justify-end border-t pt-4">
          <Button
            type="button"
            disabled={reabrindo}
            onClick={async () => {
              setReabrindo(true);
              await tentar(
                async () => onReabrir?.(),
                'Não foi possível reabrir agora. Tente de novo.',
              );
              setReabrindo(false);
            }}
            className={buttonClassName({ variant: 'secondary' })}
          >
            {reabrindo ? 'Reabrindo…' : 'Reabrir aviso'}
          </Button>
        </div>
      )}
    </div>
  );
}
