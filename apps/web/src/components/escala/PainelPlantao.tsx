import { Button } from '@base-ui/react/button';
import { Link } from '@tanstack/react-router';
import { type ReactNode, useCallback, useState } from 'react';
import { z } from 'zod';
import type { AjusteDiaEdicaoDto } from '../../gen/types/AjusteDiaEdicaoDto';
import type { ConflitoEscalaDto } from '../../gen/types/ConflitoEscalaDto';
import type { OcorrenciaDto } from '../../gen/types/OcorrenciaDto';
import type { PrioridadeEscalaDto } from '../../gen/types/PrioridadeEscalaDto';
import { plural } from '../../lib/formato';
import type { PodeNaTela } from '../../lib/permissoes';
import { Alerta } from '../alerta/Alerta';
import type { OpcaoBusca } from '../busca/BuscaSelecao';
import { buttonClassName } from '../button/button-class';
import { useErroDoPainel } from '../catalogo/use-erro-do-painel';
import { ConfirmarAcao } from '../confirmacao/ConfirmarAcao';
import { useAppForm } from '../form/form';
import { PainelLateral } from '../painel/PainelLateral';
import { AjusteDistribuicaoDia } from './AjusteDistribuicaoDia';
import { dataCurta, diaDaSemana, NOMES_DIAS_LONGOS } from './calendario';
import { ComCor } from './LinhaMedico';
import { useAvisarAlterado } from './use-avisar-alterado';

export type PainelPlantaoProps = {
  ocorrencia: OcorrenciaDto;
  /** Conflitos do médico na janela; o painel mostra os deste plantão. */
  conflitos: readonly ConflitoEscalaDto[];
  /** Editar e ajustar (`escala.editar`), nova cobertura (`escala.criar`), remover (`escala.excluir`). */
  permissoes: PodeNaTela;
  /** `ausencias.criar`. */
  podeDefinirAusencia: boolean;
  onEditar: () => void;
  /** Nova cobertura do titular, ou editar esta cobertura. */
  onCobertura: () => void;
  onRemover: () => Promise<void>;
  /** Produtividade do dia; `null` volta à da escala. */
  onAjustar: (produtividade: number | null, observacoes: string | null) => Promise<void>;
  /** Ajuste do dia da distribuição (`escala.editar`); sem ele, a seção não aparece. */
  distribuicao?: {
    prioridades: PrioridadeEscalaDto[];
    buscarClientes: (termo: string) => Promise<OpcaoBusca[]>;
    onSalvar: (ajuste: AjusteDiaEdicaoDto) => Promise<void>;
  };
  onFechar: () => void;
};

const hora = (iso: string) => iso.slice(11, 16);
const registros = (n: number) => plural(n, { um: 'registro', varios: 'registros' });

function vigencia(o: OcorrenciaDto) {
  if (o.coberturaDe) return `Cobrindo ${o.coberturaDe.medicoNome}`;
  const periodo = o.dataFim
    ? `de ${dataCurta(o.dataInicio)} a ${dataCurta(o.dataFim)}`
    : `desde ${dataCurta(o.dataInicio)}`;
  if (o.gratificado) return `Gratificado, ${periodo}`;
  return o.dataFim ? `Período único, ${periodo}` : `Escala fixa ${periodo}`;
}

function produtividade(o: OcorrenciaDto) {
  if (o.produtividade === null) return 'Não informada';
  const doDia = registros(o.produtividade);
  if (!o.ajustada) return doDia;
  return `${doDia} (na escala: ${o.produtividadeEscala === null ? 'não informada' : o.produtividadeEscala})`;
}

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-subtle-foreground text-[13px]">{rotulo}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Um plantão (médico num dia): os dados e o que dá para fazer com ele, ao lado da escala. */
export function PainelPlantao({
  ocorrencia: o,
  conflitos,
  permissoes,
  podeDefinirAusencia,
  onEditar,
  onCobertura,
  onRemover,
  onAjustar,
  distribuicao,
  onFechar,
}: PainelPlantaoProps) {
  const { erro, tentar } = useErroDoPainel();
  // As seções de ajuste avisam se têm alteração não salva: fechar pergunta antes de descartar.
  const [alterados, setAlterados] = useState({ produtividade: false, distribuicao: false });
  const alterouProdutividade = useCallback(
    (produtividade: boolean) => setAlterados((a) => ({ ...a, produtividade })),
    [],
  );
  const alterouDistribuicao = useCallback(
    (distribuicao: boolean) => setAlterados((a) => ({ ...a, distribuicao })),
    [],
  );
  const ehCobertura = Boolean(o.coberturaDe);
  // Nova cobertura cria (POST); a cobertura aberta se edita.
  const podeCobertura = ehCobertura ? permissoes.editar : permissoes.criar;
  const doPlantao = conflitos
    .filter(
      (c) =>
        c.data === o.data && (c.a.alocacaoId === o.alocacaoId || c.b.alocacaoId === o.alocacaoId),
    )
    .map((c) => (c.a.alocacaoId === o.alocacaoId ? c.b : c.a));
  const dia = `${NOMES_DIAS_LONGOS[diaDaSemana(o.data)]}, ${dataCurta(o.data)}`;
  const local = `${o.frenteRotulo}, ${o.turnoNome}`;

  return (
    <PainelLateral
      titulo={o.medicoNome}
      subtitulo={dia}
      alterado={alterados.produtividade || alterados.distribuicao}
      onFechar={onFechar}
    >
      <div className="flex flex-col gap-4 p-4">
        {erro && <Alerta tom="erro">{erro}</Alerta>}
        {doPlantao.length > 0 && (
          <Alerta tom="atencao">
            Este plantão se sobrepõe a outro do médico no mesmo turno:{' '}
            {doPlantao
              .map((p) => `${p.frenteRotulo}, ${p.turnoNome} (${hora(p.inicio)}–${hora(p.fim)})`)
              .join('; ')}
            .
          </Alerta>
        )}
        <dl className="flex flex-col gap-3">
          <Linha rotulo="Onde">
            <span className="flex flex-wrap gap-x-3 gap-y-0.5">
              <ComCor cor={o.frenteCor}>{o.frenteRotulo}</ComCor>
              <ComCor cor={o.turnoCor}>{o.turnoNome}</ComCor>
            </span>
          </Linha>
          <Linha rotulo="Horário">
            <span className="tabular-nums">
              {o.horarioInicio}–{o.horarioFim}
            </span>
          </Linha>
          <Linha rotulo="Produtividade">
            <span className="tabular-nums">{produtividade(o)}</span>
          </Linha>
          <Linha rotulo="Vigência">{vigencia(o)}</Linha>
          {o.cobertoPor && <Linha rotulo="Cobertura">Coberto por {o.cobertoPor.medicoNome}</Linha>}
          {o.ausente && (
            <Linha rotulo="Ausência">
              {o.tipoAusenciaNome ? (
                <ComCor cor={o.tipoAusenciaCor}>{o.tipoAusenciaNome}</ComCor>
              ) : (
                'Ausente'
              )}
            </Linha>
          )}
        </dl>

        {(permissoes.editar || podeCobertura || podeDefinirAusencia || permissoes.excluir) && (
          <div className="flex flex-wrap gap-2 border-t pt-4">
            {permissoes.editar && !ehCobertura && (
              <Button
                type="button"
                onClick={onEditar}
                className={buttonClassName({ variant: 'secondary' })}
              >
                Editar alocação
              </Button>
            )}
            {podeCobertura && (
              <Button
                type="button"
                onClick={onCobertura}
                className={buttonClassName({ variant: 'secondary' })}
              >
                {ehCobertura ? 'Editar cobertura' : 'Cobertura'}
              </Button>
            )}
            {podeDefinirAusencia && (
              <Link
                to="/escala/ausencias"
                search={{
                  novo: 1,
                  medicoId: o.medicoId,
                  frenteId: o.frenteId,
                  turnoId: o.turnoId,
                  de: o.data,
                }}
                className={buttonClassName({ variant: 'secondary' })}
              >
                Definir ausência
              </Link>
            )}
            {permissoes.excluir && (
              <ConfirmarAcao
                acao={ehCobertura ? 'Remover cobertura' : 'Remover alocação'}
                titulo={
                  ehCobertura
                    ? `Remover a cobertura de ${o.medicoNome}?`
                    : `Remover a alocação de ${o.medicoNome}?`
                }
                consequencia={
                  ehCobertura
                    ? `${o.medicoNome} deixa de cobrir ${o.coberturaDe?.medicoNome} em todos os dias da cobertura, e o titular volta a esses plantões.`
                    : `${o.medicoNome} sai de ${local} em todos os dias, e as coberturas desta alocação saem junto. Para tirar só um dia, use Definir ausência.`
                }
                onConfirmar={() =>
                  tentar(onRemover, 'Não foi possível remover agora. Tente de novo.')
                }
              />
            )}
          </div>
        )}

        {permissoes.editar && !o.gratificado && (
          <AjusteDoDia
            // Depois de salvar, o formulário parte do que ficou gravado.
            key={`${o.produtividade}|${o.ajustada}`}
            ocorrencia={o}
            onAjustar={(p, obs) => tentar(() => onAjustar(p, obs))}
            onAlterado={alterouProdutividade}
          />
        )}
        {permissoes.editar && distribuicao && (
          <AjusteDistribuicaoDia
            alocacaoId={o.alocacaoId}
            data={o.data}
            prioridades={distribuicao.prioridades}
            buscarClientes={distribuicao.buscarClientes}
            onSalvar={(ajuste) => tentar(() => distribuicao.onSalvar(ajuste))}
            onAlterado={alterouDistribuicao}
          />
        )}
      </div>
    </PainelLateral>
  );
}

const esquemaAjuste = z.object({
  produtividade: z.string().regex(/^\d+$/, 'Informe um número inteiro igual ou maior que zero.'),
  observacoes: z.string().max(500, 'Use até 500 caracteres.'),
});

function AjusteDoDia({
  ocorrencia: o,
  onAjustar,
  onAlterado,
}: {
  ocorrencia: OcorrenciaDto;
  onAjustar: (produtividade: number | null, observacoes: string | null) => Promise<void>;
  onAlterado: (alterado: boolean) => void;
}) {
  const iniciais = {
    produtividade: o.produtividade === null ? '' : String(o.produtividade),
    observacoes: '',
  };
  const form = useAppForm({
    defaultValues: iniciais,
    validators: { onSubmit: esquemaAjuste },
    onSubmit: ({ value }) =>
      onAjustar(Number(value.produtividade), value.observacoes.trim() || null),
  });
  useAvisarAlterado(form, iniciais, onAlterado);

  return (
    <section aria-labelledby="ajuste-do-dia" className="flex flex-col gap-3 border-t pt-4">
      <div className="flex flex-col gap-1">
        <h3 id="ajuste-do-dia" className="font-semibold">
          Produtividade do dia
        </h3>
        <p className="text-muted-foreground text-[13px]">
          Só neste dia; os outros seguem a da escala.
        </p>
      </div>
      <form
        noValidate
        onSubmit={(evento) => {
          evento.preventDefault();
          void form.handleSubmit();
        }}
        className="flex flex-col gap-3"
      >
        <form.AppField name="produtividade">
          {(field) => (
            <field.NumberField label="Registros neste dia" placeholder="Ex.: 30" min={0} required />
          )}
        </form.AppField>
        <form.AppField name="observacoes">
          {(field) => (
            <field.TextField label="Motivo" placeholder="Ex.: saiu mais cedo" autoComplete="off" />
          )}
        </form.AppField>
        <div className="flex flex-wrap justify-end gap-2">
          {o.ajustada && (
            <Button
              type="button"
              onClick={() => void onAjustar(null, null)}
              className={buttonClassName({ variant: 'secondary' })}
            >
              Voltar à da escala
            </Button>
          )}
          <form.AppForm>
            <form.SubmitButton pendingLabel="Salvando…">Salvar produtividade</form.SubmitButton>
          </form.AppForm>
        </div>
      </form>
    </section>
  );
}
