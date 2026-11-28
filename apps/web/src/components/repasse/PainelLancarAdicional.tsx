import { useStore } from '@tanstack/react-form';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';

import type { CompetenciaComRepasseDto } from '../../gen/types/CompetenciaComRepasseDto';
import type { LancarAdicionalDto } from '../../gen/types/LancarAdicionalDto';
import type { TarifasLancamentoDto } from '../../gen/types/TarifasLancamentoDto';
import { moeda } from '../../lib/formato';
import { nomeCompetencia, ROTULO_TIPO_ADICIONAL, type TipoAdicional } from '../../lib/repasse';
import { Alerta } from '../alerta/Alerta';
import { mensagemDaApi } from '../alerta/mensagem-da-api';
import type { OpcaoBusca } from '../busca/BuscaSelecao';
import { RodapePainel } from '../catalogo/rodape-painel';
import { DateField } from '../form/DateField';
import { useAppForm } from '../form/form';
import { LinhaDeCampos } from '../form/LinhaDeCampos';
import { useAlterado } from '../painel/fechamento';
import { PainelLateral } from '../painel/PainelLateral';

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const MSG_DESCRICAO = 'Descreva o lançamento: é o que explica o valor no demonstrativo do médico.';

type Valores = {
  medico: OpcaoBusca | null;
  tipo: TipoAdicional | '';
  competencia: string;
  naFechada: boolean;
  motivo: string;
  data: string;
  /** Centavos (negativo é desconto). */
  valor: number | null;
  quantidade: string;
  /** Centavos. */
  unitario: number | null;
  descricao: string;
  referenciaDesde: string;
  referenciaAte: string;
};

/** O esquema depende de a competência escolhida estar fechada (o motivo só vale nela). */
const esquema = (fechada: (c: string) => boolean) =>
  z
    .object({
      medico: z
        .object({ valor: z.string(), rotulo: z.string(), detalhe: z.string().nullish() })
        .nullable(),
      tipo: z.enum(['', 'avulso', 'plantao', 'peer_review']),
      competencia: z.string().min(1, 'Escolha a competência.'),
      naFechada: z.boolean(),
      motivo: z.string().max(1000, 'Use até 1.000 caracteres.'),
      data: z.string(),
      valor: z.number().int().nullable(),
      quantidade: z.string(),
      unitario: z.number().int().nullable(),
      descricao: z.string().max(500, 'Use até 500 caracteres.'),
      referenciaDesde: z.string(),
      referenciaAte: z.string(),
    })
    .superRefine((v, ctx) => {
      const erro = (path: keyof Valores, message: string) =>
        ctx.addIssue({ code: 'custom', path: [path], message });
      if (!v.medico) erro('medico', 'Escolha o médico.');
      if (!v.tipo) erro('tipo', 'Escolha o tipo.');
      if (!DIA.test(v.data)) erro('data', 'Informe a data.');
      if (v.naFechada && fechada(v.competencia) && !v.motivo.trim())
        erro('motivo', 'Informe o motivo de lançar na competência fechada.');
      if (v.tipo === 'avulso') {
        if (v.valor === null || v.valor === 0)
          erro('valor', 'Informe o valor (negativo é desconto).');
        if (v.descricao.trim().length < 3) erro('descricao', MSG_DESCRICAO);
      } else if (v.tipo) {
        const q = Number(v.quantidade);
        if (!/^\d+$/.test(v.quantidade.trim()) || q < 1)
          erro('quantidade', 'Informe a quantidade (1 ou mais).');
        if (!((v.unitario ?? 0) > 0)) erro('unitario', 'Informe o valor unitário, maior que zero.');
      }
      if (v.tipo === 'peer_review') {
        if (!v.referenciaDesde) erro('referenciaDesde', 'Escolha o primeiro mês avaliado.');
        if (!v.referenciaAte) erro('referenciaAte', 'Escolha o último mês avaliado.');
        else if (v.referenciaDesde && v.referenciaAte < v.referenciaDesde)
          erro('referenciaAte', 'O último mês não pode ser antes do primeiro.');
      }
    });

const somarMeses = (competencia: string, meses: number) => {
  const [a, m] = competencia.split('-').map(Number) as [number, number];
  const total = a * 12 + (m - 1) + meses;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
};

/** Do mês avaliado mais antigo que faz sentido (um ano antes) até a própria competência. */
const mesesAvaliados = (competencia: string) =>
  Array.from({ length: 13 }, (_, i) => somarMeses(competencia, -i)).map((c) => ({
    valor: c,
    rotulo: nomeCompetencia(c),
  }));

export type PainelLancarAdicionalProps = {
  /** Competências com repasse (a tela junta o mês atual e o seguinte, abertos). */
  competencias: CompetenciaComRepasseDto[];
  competenciaInicial: string;
  medicoInicial?: OpcaoBusca;
  /** Dia de hoje em Brasília ("AAAA-MM-DD"), a data sugerida. */
  hoje: string;
  /** `repasse.adicional.lancar_fechada`. */
  podeLancarNaFechada: boolean;
  tarifas: (competencia: string) => Promise<TarifasLancamentoDto>;
  buscarMedicos: (termo: string, sinal?: AbortSignal) => Promise<OpcaoBusca[]>;
  onSalvar: (dados: LancarAdicionalDto) => Promise<void>;
  onFechar: () => void;
};

/**
 * Lançar um adicional (Avulso, Plantão ou Peer Review) no `PainelLateral`. Por quantidade, o valor
 * unitário já vem com a tarifa vigente e o total é calculado. Na competência fechada, o adicional
 * vai para a próxima aberta; com a permissão própria, pode entrar nela mesma, com motivo (o que
 * pede o recálculo e gera uma versão nova).
 */
export function PainelLancarAdicional({
  competencias,
  competenciaInicial,
  medicoInicial,
  hoje,
  podeLancarNaFechada,
  tarifas,
  buscarMedicos,
  onSalvar,
  onFechar,
}: PainelLancarAdicionalProps) {
  const [erro, setErro] = useState<string>();
  const fechadas = new Set(
    competencias.filter((c) => c.status === 'fechada').map((c) => c.competencia),
  );
  const iniciais: Valores = {
    medico: medicoInicial ?? null,
    tipo: '',
    competencia: competenciaInicial,
    naFechada: false,
    motivo: '',
    data: hoje,
    valor: null,
    quantidade: '',
    unitario: null,
    descricao: '',
    referenciaDesde: '',
    referenciaAte: '',
  };
  const form = useAppForm({
    defaultValues: iniciais,
    validators: { onSubmit: esquema((c) => fechadas.has(c)) },
    onSubmit: async ({ value: v }) => {
      setErro(undefined);
      const naFechada = v.naFechada && fechadas.has(v.competencia);
      const porQuantidade = v.tipo !== 'avulso';
      try {
        await onSalvar({
          medicoId: v.medico?.valor ?? '',
          tipo: v.tipo as TipoAdicional,
          competencia: v.competencia,
          data: v.data,
          ...(porQuantidade
            ? {
                quantidade: Number(v.quantidade),
                valorUnitarioCentavos: v.unitario ?? undefined,
              }
            : { valorCentavos: v.valor ?? undefined }),
          ...(v.descricao.trim() && { descricao: v.descricao.trim() }),
          ...(v.tipo === 'peer_review' && {
            referenciaDesde: v.referenciaDesde,
            referenciaAte: v.referenciaAte,
          }),
          ...(naFechada && { lancarNaFechada: true, motivo: v.motivo.trim() }),
        });
      } catch (falha) {
        setErro(
          mensagemDaApi(
            falha,
            'Não foi possível lançar agora. Confira sua conexão e tente de novo.',
          ),
        );
      }
    },
  });
  const alterado = useAlterado(form, iniciais);
  const v = useStore(form.store, (s) => s.values);

  const fechada = fechadas.has(v.competencia);
  const naFechada = fechada && v.naFechada;
  const consulta = useQuery({
    queryKey: ['repasse-tarifas', v.competencia],
    queryFn: () => tarifas(v.competencia),
  });
  const t = consulta.data;
  const tarifasVigentes = t && (naFechada ? t.tarifasDaCompetencia : t.tarifasDestino);
  const competenciaDaTarifa = t && (naFechada ? t.competencia : t.destino);
  const sugerida =
    tarifasVigentes && v.tipo && v.tipo !== 'avulso'
      ? v.tipo === 'plantao'
        ? tarifasVigentes.plantaoCentavos
        : tarifasVigentes.peerReviewCentavos
      : null;

  // O unitário segue a tarifa vigente enquanto a pessoa não digitar outro valor nele.
  const automatico = useRef<number | null>(null);
  useEffect(() => {
    if (sugerida === null) return;
    const atual = form.getFieldValue('unitario');
    if (atual !== null && atual !== automatico.current) return;
    automatico.current = sugerida;
    form.setFieldValue('unitario', sugerida);
  }, [sugerida, form]);

  const unitario = v.unitario;
  const quantidade = /^\d+$/.test(v.quantidade.trim()) ? Number(v.quantidade) : null;
  const total = unitario !== null && quantidade ? unitario * quantidade : null;

  const opcoesCompetencia = competencias.map((c) => ({
    valor: c.competencia,
    rotulo: `${nomeCompetencia(c.competencia)}${c.status === 'fechada' ? ' (fechada)' : ''}`,
  }));

  return (
    <PainelLateral titulo="Lançar adicional" alterado={alterado} onFechar={onFechar}>
      <form
        noValidate
        onSubmit={(evento) => {
          evento.preventDefault();
          void form.handleSubmit();
        }}
        className="flex flex-col gap-5 p-4"
      >
        {erro && <Alerta tom="erro">{erro}</Alerta>}
        <form.AppField name="medico">
          {(field) => (
            <field.BuscaField
              label="Médico"
              required
              chave="medicos-repasse"
              placeholder="Ex.: Maria Souza"
              buscar={buscarMedicos}
            />
          )}
        </form.AppField>
        <form.AppField name="tipo">
          {(field) => (
            <field.OpcoesField
              label="Tipo"
              required
              opcoes={(['avulso', 'plantao', 'peer_review'] as const).map((tipo) => ({
                valor: tipo,
                rotulo: ROTULO_TIPO_ADICIONAL[tipo],
              }))}
            />
          )}
        </form.AppField>
        <form.AppField name="competencia">
          {(field) => (
            <field.SelectField
              label="Competência"
              required
              placeholder="Escolha a competência"
              opcoes={opcoesCompetencia}
            />
          )}
        </form.AppField>
        {fechada && t && (
          <Alerta tom="atencao" role="note">
            {naFechada
              ? `O adicional entra em ${nomeCompetencia(v.competencia)}, que está fechada: o repasse dela é recalculado e ganha uma versão nova.`
              : `${nomeCompetencia(v.competencia)} está fechada: o adicional entra em ${nomeCompetencia(t.destino)}, a próxima aberta.`}
          </Alerta>
        )}
        {fechada && podeLancarNaFechada && (
          <form.AppField name="naFechada">
            {(field) => (
              <field.InterruptorField
                label="Lançar na própria competência fechada"
                description={`Pede o motivo e gera uma versão nova do repasse de ${nomeCompetencia(v.competencia)}.`}
              />
            )}
          </form.AppField>
        )}
        {naFechada && (
          <form.AppField name="motivo">
            {(field) => (
              <field.TextAreaField
                label="Motivo"
                required
                placeholder="Ex.: plantão de 15/11 que ficou de fora"
                description="Fica no histórico do recálculo, com quem pediu e quando."
              />
            )}
          </form.AppField>
        )}
        <form.AppField name="data">
          {() => <DateField label="Data" required className="max-w-[240px]" />}
        </form.AppField>

        {v.tipo === 'avulso' && (
          <form.AppField name="valor">
            {(field) => (
              <field.MoedaField
                label="Valor"
                required
                negativo
                placeholder="-120,00"
                description="Negativo é desconto."
              />
            )}
          </form.AppField>
        )}

        {(v.tipo === 'plantao' || v.tipo === 'peer_review') && (
          <>
            {v.tipo === 'peer_review' && (
              <LinhaDeCampos>
                <form.AppField name="referenciaDesde">
                  {(field) => (
                    <field.SelectField
                      label="Meses avaliados de"
                      required
                      placeholder="Escolha o mês"
                      opcoes={mesesAvaliados(v.competencia)}
                    />
                  )}
                </form.AppField>
                <form.AppField name="referenciaAte">
                  {(field) => (
                    <field.SelectField
                      label="até"
                      required
                      placeholder="Escolha o mês"
                      opcoes={mesesAvaliados(v.competencia)}
                    />
                  )}
                </form.AppField>
              </LinhaDeCampos>
            )}
            <LinhaDeCampos>
              <form.AppField name="quantidade">
                {(field) => (
                  <field.NumberField label="Quantidade" required placeholder="Ex.: 3" min={1} />
                )}
              </form.AppField>
              <form.AppField name="unitario">
                {(field) => <field.MoedaField label="Valor unitário" required />}
              </form.AppField>
            </LinhaDeCampos>
            <p className="text-muted-foreground text-[13px] tabular-nums" aria-live="polite">
              Total:{' '}
              <strong className="text-foreground font-semibold">
                {total === null ? '—' : moeda(total / 100)}
              </strong>
              {sugerida !== null && unitario === sugerida && competenciaDaTarifa && (
                <>
                  {' '}
                  · tarifa {v.tipo === 'plantao' ? 'do plantão' : 'do Peer Review'} vigente em{' '}
                  {nomeCompetencia(competenciaDaTarifa)}
                </>
              )}
            </p>
          </>
        )}

        <form.AppField name="descricao">
          {(field) => (
            <field.TextAreaField
              label="Descrição"
              required={v.tipo === 'avulso'}
              placeholder={
                v.tipo === 'avulso'
                  ? 'Ex.: Desconto de equipamento'
                  : 'Ex.: Plantões de fim de semana'
              }
              description="Aparece no demonstrativo do médico."
            />
          )}
        </form.AppField>
        <form.AppForm>
          <RodapePainel rotuloCriar="Lançar adicional" editando={false} onCancelar={onFechar} />
        </form.AppForm>
      </form>
    </PainelLateral>
  );
}
