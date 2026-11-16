import { Button } from '@base-ui/react/button';
import { type ReactNode, useState } from 'react';
import { z } from 'zod';

import type { AusenciaItemDto } from '../../gen/types/AusenciaItemDto';
import { dataHoraCurta } from '../../lib/datas';
import { Alerta } from '../alerta/Alerta';
import { buttonClassName } from '../button/button-class';
import { useErroDoPainel } from '../catalogo/use-erro-do-painel';
import { ConfirmarAcao } from '../confirmacao/ConfirmarAcao';
import { Etiqueta } from '../etiqueta/Etiqueta';
import { useAppForm } from '../form/form';
import { diasDaSemana, periodoCompleto, situacaoDaAusencia } from './ausencias';

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5">
      <dt className="text-muted-foreground flex-none">{rotulo}</dt>
      <dd className="text-right break-words tabular-nums">{children}</dd>
    </div>
  );
}

const schemaRecusa = z.object({
  motivo: z.string().trim().min(1, 'Informe o motivo.').max(500, 'Use até 500 caracteres.'),
});

export type DetalheAusenciaProps = {
  ausencia: AusenciaItemDto;
  podeEditar: boolean;
  podeAprovar: boolean;
  onAprovar: () => Promise<void>;
  onRecusar: (motivo: string) => Promise<void>;
  onEditar: () => void;
  onExcluir: () => Promise<void>;
};

/** Conteúdo do painel de uma ausência: dados, decisão (aprovar/recusar), editar e excluir. */
export function DetalheAusencia({
  ausencia,
  podeEditar,
  podeAprovar,
  onAprovar,
  onRecusar,
  onEditar,
  onExcluir,
}: DetalheAusenciaProps) {
  const situacao = situacaoDaAusencia(ausencia.situacao);
  const { erro, tentar } = useErroDoPainel();
  const [aprovando, setAprovando] = useState(false);
  const [recusando, setRecusando] = useState(false);
  const pendente = ausencia.situacao === 'pendente';
  const periodo = periodoCompleto(ausencia);
  const nomes = (lista: { nome: string }[]) => lista.map((item) => item.nome).join(', ');

  const form = useAppForm({
    defaultValues: { motivo: '' },
    validators: { onSubmit: schemaRecusa },
    onSubmit: ({ value }) =>
      tentar(
        async () => onRecusar(value.motivo.trim()),
        'Não foi possível recusar agora. Tente de novo.',
      ),
  });

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Etiqueta tom={situacao.tom}>{situacao.texto}</Etiqueta>
        {ausencia.origem === 'medico' && <Etiqueta tom="info">Pedido pelo portal</Etiqueta>}
      </div>

      <dl className="divide-y">
        <Campo rotulo="Médico">{ausencia.medico.nome}</Campo>
        <Campo rotulo="Tipo">
          <span className="inline-flex items-center gap-2">
            <span
              aria-hidden="true"
              className="border-border size-3 flex-none rounded-full border"
              style={ausencia.tipo.cor ? { backgroundColor: ausencia.tipo.cor } : undefined}
            />
            {ausencia.tipo.nome}
          </span>
        </Campo>
        <Campo rotulo="Período">{periodo}</Campo>
        <Campo rotulo="Dias da semana">
          {ausencia.diasSemana.length > 0
            ? diasDaSemana(ausencia.diasSemana)
            : 'Todos os dias do período'}
        </Campo>
        <Campo rotulo="Turnos">
          {ausencia.turnos.length > 0 ? nomes(ausencia.turnos) : 'Dia inteiro'}
        </Campo>
        <Campo rotulo="Escalas">
          {ausencia.frentes.length > 0 ? nomes(ausencia.frentes) : 'Todas as escalas do médico'}
        </Campo>
        {ausencia.solicitadaPor && (
          <Campo rotulo={ausencia.origem === 'medico' ? 'Pedida por' : 'Lançada por'}>
            {ausencia.solicitadaPor.nome}
          </Campo>
        )}
        <Campo rotulo={ausencia.origem === 'medico' ? 'Pedida em' : 'Lançada em'}>
          {dataHoraCurta(ausencia.criadoEm)}
        </Campo>
        {ausencia.revisadaPor && !pendente && (
          <Campo rotulo={ausencia.situacao === 'recusada' ? 'Recusada por' : 'Aprovada por'}>
            {ausencia.revisadaPor.nome}
          </Campo>
        )}
        {ausencia.revisadaEm && !pendente && (
          <Campo rotulo={ausencia.situacao === 'recusada' ? 'Recusada em' : 'Aprovada em'}>
            {dataHoraCurta(ausencia.revisadaEm)}
          </Campo>
        )}
      </dl>

      {ausencia.motivoRecusa && (
        <section className="flex flex-col gap-1">
          <h3 className="font-medium">Motivo da recusa</h3>
          <p className="text-muted-foreground break-words whitespace-pre-line">
            {ausencia.motivoRecusa}
          </p>
        </section>
      )}

      <section className="flex flex-col gap-1">
        <h3 className="font-medium">Observações</h3>
        <p className="text-muted-foreground break-words whitespace-pre-line">
          {ausencia.observacoes || 'Sem observações.'}
        </p>
      </section>

      {erro && <Alerta tom="erro">{erro}</Alerta>}

      {podeAprovar && pendente && !recusando && (
        <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
          <Button
            type="button"
            onClick={() => setRecusando(true)}
            className={buttonClassName({ variant: 'secondary' })}
          >
            Recusar
          </Button>
          <Button
            type="button"
            disabled={aprovando}
            focusableWhenDisabled
            onClick={async () => {
              setAprovando(true);
              await tentar(onAprovar, 'Não foi possível aprovar agora. Tente de novo.');
              setAprovando(false);
            }}
            className={buttonClassName()}
          >
            {aprovando ? 'Aprovando…' : 'Aprovar'}
          </Button>
        </div>
      )}

      {podeAprovar && pendente && recusando && (
        <form
          noValidate
          className="flex flex-col gap-4 border-t pt-4"
          onSubmit={(evento) => {
            evento.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.AppField name="motivo">
            {(field) => (
              <field.TextAreaField
                label="Motivo da recusa"
                placeholder="Ex.: a escala desses dias já está fechada"
                description="O médico vê este motivo no portal."
                required
              />
            )}
          </form.AppField>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              onClick={() => setRecusando(false)}
              className={buttonClassName({ variant: 'secondary' })}
            >
              Cancelar
            </Button>
            <form.AppForm>
              <form.SubmitButton variant="destructive" pendingLabel="Recusando…">
                Recusar pedido
              </form.SubmitButton>
            </form.AppForm>
          </div>
        </form>
      )}

      {podeEditar && (
        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          <ConfirmarAcao
            acao="Excluir ausência"
            titulo="Excluir esta ausência?"
            consequencia={`A ausência de ${ausencia.medico.nome} (${periodo}) sai da escala e o médico volta a contar como disponível nesses dias.`}
            onConfirmar={() => tentar(onExcluir, 'Não foi possível excluir agora. Tente de novo.')}
          />
          <Button
            type="button"
            onClick={onEditar}
            className={buttonClassName({ variant: 'secondary', className: 'ml-auto' })}
          >
            Editar
          </Button>
        </div>
      )}
    </div>
  );
}
