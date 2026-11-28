import { useState } from 'react';
import { z } from 'zod';

import type { AusenciaItemDto } from '../../gen/types/AusenciaItemDto';
import type { CriarAusenciasDto } from '../../gen/types/CriarAusenciasDto';
import { Alerta } from '../alerta/Alerta';
import { mensagemDaApi } from '../alerta/mensagem-da-api';
import type { OpcaoBusca } from '../busca/BuscaSelecao';
import { RodapePainel } from '../catalogo/rodape-painel';
import { CampoSomenteLeitura } from '../form/CampoSomenteLeitura';
import type { OpcaoMarcar } from '../form/CheckboxListField';
import { caixasDaApi, caixasParaApi, esquemaCaixasComTodas, TODAS } from '../form/caixas-todas';
import { DateField } from '../form/DateField';
import { useAppForm } from '../form/form';
import { LinhaDeCampos } from '../form/LinhaDeCampos';
import { useAlterado } from '../painel/fechamento';
import { PainelLateral } from '../painel/PainelLateral';
import { DIAS_DA_SEMANA } from './ausencias';

type Opcao = { valor: string; rotulo: string };
/** Tipo e turno levam a cor (a bolinha antes do nome). */
type OpcaoComCor = Opcao & { cor?: string | null };

const OPCOES_DIAS = DIAS_DA_SEMANA.map((d) => ({ valor: String(d.valor), rotulo: d.rotulo }));

const FALHA_AO_SALVAR = 'Não foi possível salvar agora. Confira sua conexão e tente de novo.';
const DIA = /^\d{4}-\d{2}-\d{2}$/;
/** O pré-preenchimento da Escala: sem recorte pedido, começa em "Todas". */
const ouTodas = (ids: string[]) => (ids.length ? ids : [TODAS]);

const schema = z
  .object({
    medicos: z
      .array(z.object({ valor: z.string(), rotulo: z.string(), detalhe: z.string().nullish() }))
      .min(1, 'Escolha ao menos um médico.'),
    tipoId: z.string().min(1, 'Escolha o tipo.'),
    dataInicio: z.string().regex(DIA, 'Informe o início.'),
    dataFim: z.string().regex(DIA, 'Informe o fim.'),
    frenteIds: esquemaCaixasComTodas('Marque ao menos uma escala.'),
    turnoIds: esquemaCaixasComTodas('Marque ao menos um turno.'),
    diasSemana: esquemaCaixasComTodas('Marque ao menos um dia.'),
    observacoes: z.string().max(2000, 'Use até 2.000 caracteres.'),
  })
  .refine((v) => !DIA.test(v.dataInicio) || !DIA.test(v.dataFim) || v.dataFim >= v.dataInicio, {
    message: 'O fim não pode ser antes do início.',
    path: ['dataFim'],
  });

/** O que a tela Escala manda pelo "Definir ausência" (`?novo=1&medicoId=…&de=…`). */
export type InicialAusencia = {
  medico?: OpcaoBusca | null;
  frenteIds?: string[];
  turnoIds?: string[];
  /** Dia "AAAA-MM-DD": vira o início e o fim. */
  de?: string;
};

export type FormAusenciaProps = {
  /** Sem ausência, o painel lança uma nova (para um ou vários médicos). */
  ausencia?: AusenciaItemDto;
  inicial?: InicialAusencia;
  /** Aviso no topo do formulário (ex.: o médico pedido pela Escala não existe mais). */
  aviso?: string;
  /** Tipos ativos. */
  tipos: OpcaoComCor[];
  /** Com `grupo` (especialidades e modalidades) e `cor`: `opcoesDeFrentes`. */
  frentes: OpcaoMarcar[];
  turnos: OpcaoComCor[];
  buscarMedicos: (termo: string, sinal?: AbortSignal) => Promise<OpcaoBusca[]>;
  /** Na edição, `medicoIds` traz só o médico da ausência. */
  onSalvar: (dados: CriarAusenciasDto) => Promise<void>;
  onFechar: () => void;
};

/** Formulário único de ausência (lançar e editar), no painel lateral. */
export function FormAusencia({
  ausencia,
  inicial = {},
  aviso,
  tipos,
  frentes,
  turnos,
  buscarMedicos,
  onSalvar,
  onFechar,
}: FormAusenciaProps) {
  const [erro, setErro] = useState<string>();
  // Ausência com tipo hoje inativo: o tipo dela continua na lista para não sumir da edição.
  const opcoesTipo =
    ausencia && !tipos.some((t) => t.valor === ausencia.tipo.id)
      ? [...tipos, { valor: ausencia.tipo.id, rotulo: ausencia.tipo.nome, cor: ausencia.tipo.cor }]
      : tipos;

  // Sem `ausencias.observacoes.ver` a API manda o texto nulo: o campo some, o nulo volta como veio
  // e a API preserva o texto gravado.
  const observacoesOcultas = Boolean(
    ausencia && ausencia.observacoes == null && ausencia.temObservacoes,
  );

  const iniciais = {
    medicos: ausencia
      ? [{ valor: ausencia.medico.id, rotulo: ausencia.medico.nome }]
      : inicial.medico
        ? [inicial.medico]
        : ([] as OpcaoBusca[]),
    tipoId: ausencia?.tipo.id ?? '',
    dataInicio: ausencia?.dataInicio ?? inicial.de ?? '',
    dataFim: ausencia?.dataFim ?? inicial.de ?? '',
    frenteIds: ausencia
      ? caixasDaApi(
          ausencia.todasFrentes,
          ausencia.frentes.map((f) => f.id),
        )
      : ouTodas(inicial.frenteIds ?? []),
    turnoIds: ausencia
      ? caixasDaApi(
          ausencia.todosTurnos,
          ausencia.turnos.map((t) => t.id),
        )
      : ouTodas(inicial.turnoIds ?? []),
    diasSemana: ausencia
      ? caixasDaApi(ausencia.todosDias, ausencia.diasSemana.map(String))
      : [TODAS],
    observacoes: ausencia?.observacoes ?? '',
  };
  const form = useAppForm({
    defaultValues: iniciais,
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      setErro(undefined);
      try {
        await onSalvar({
          medicoIds: value.medicos.map((m) => m.valor),
          tipoId: value.tipoId,
          dataInicio: value.dataInicio,
          dataFim: value.dataFim,
          todasFrentes: caixasParaApi(value.frenteIds).todas,
          frenteIds: caixasParaApi(value.frenteIds).ids,
          todosTurnos: caixasParaApi(value.turnoIds).todas,
          turnoIds: caixasParaApi(value.turnoIds).ids,
          todosDias: caixasParaApi(value.diasSemana).todas,
          diasSemana: caixasParaApi(value.diasSemana)
            .ids.map(Number)
            .sort((a, b) => a - b),
          observacoes: observacoesOcultas ? null : value.observacoes.trim() || null,
        });
      } catch (falha) {
        setErro(mensagemDaApi(falha, FALHA_AO_SALVAR));
      }
    },
  });

  const alterado = useAlterado(form, iniciais);

  return (
    <PainelLateral
      titulo={ausencia ? 'Editar ausência' : 'Nova ausência'}
      subtitulo={ausencia?.medico.nome}
      alterado={alterado}
      onFechar={onFechar}
    >
      <form
        noValidate
        onSubmit={(evento) => {
          evento.preventDefault();
          void form.handleSubmit();
        }}
        className="flex flex-col gap-5 p-4"
      >
        {aviso && <Alerta tom="atencao">{aviso}</Alerta>}
        {erro && <Alerta tom="erro">{erro}</Alerta>}
        {ausencia ? (
          <CampoSomenteLeitura
            label="Médico"
            value={ausencia.medico.nome}
            description="Para outro médico, lance uma nova ausência."
          />
        ) : (
          <form.AppField name="medicos">
            {(field) => (
              <field.EscolhaMultiplaField
                label="Médicos"
                required
                rotuloAdicionar="Adicionar médico"
                placeholder="Digite o nome do médico"
                chave="medicos-ausencia"
                buscar={buscarMedicos}
                vazio="Nenhum médico escolhido."
                descricaoDaBusca="Escolha um ou vários: cada médico ganha a sua ausência."
              />
            )}
          </form.AppField>
        )}
        <form.AppField name="tipoId">
          {(field) => (
            <field.SelectField
              label="Tipo"
              placeholder="Escolha o tipo"
              opcoes={opcoesTipo}
              required
            />
          )}
        </form.AppField>
        <LinhaDeCampos className="@[316px]:grid-cols-2">
          <form.AppField name="dataInicio">
            {() => <DateField label="Início" required />}
          </form.AppField>
          <form.AppField name="dataFim">{() => <DateField label="Fim" required />}</form.AppField>
        </LinhaDeCampos>
        {frentes.length > 0 && (
          <form.AppField name="frenteIds">
            {(field) => (
              <field.CheckboxListField label="Escalas" required todas="Todas" opcoes={frentes} />
            )}
          </form.AppField>
        )}
        {turnos.length > 0 && (
          <form.AppField name="turnoIds">
            {(field) => (
              <field.CheckboxListField
                label="Turnos"
                required
                todas="O dia inteiro"
                opcoes={turnos}
              />
            )}
          </form.AppField>
        )}
        <form.AppField name="diasSemana">
          {(field) => (
            <field.CaixasField
              label="Dias da semana"
              required
              todas="Todos os dias"
              opcoes={OPCOES_DIAS}
            />
          )}
        </form.AppField>
        {observacoesOcultas ? (
          <div className="flex flex-col gap-1">
            <span className="font-medium">Observações</span>
            <p className="text-muted-foreground">Há observação (sem permissão para ver)</p>
          </div>
        ) : (
          <form.AppField name="observacoes">
            {(field) => (
              <field.TextAreaField
                label="Observações"
                placeholder="Ex.: Congresso em São Paulo"
                description="Visível para quem gere a escala; não escreva diagnóstico."
              />
            )}
          </form.AppField>
        )}
        <form.AppForm>
          <RodapePainel
            rotuloCriar="Lançar ausência"
            editando={Boolean(ausencia)}
            onCancelar={onFechar}
          />
        </form.AppForm>
      </form>
    </PainelLateral>
  );
}
