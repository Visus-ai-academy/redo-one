import { useState } from 'react';

import type { CoberturaDto } from '../../gen/types/CoberturaDto';
import { Alerta } from '../alerta/Alerta';
import { mensagemDaApi } from '../alerta/mensagem-da-api';
import type { OpcaoBusca } from '../busca/BuscaSelecao';
import { RodapePainel } from '../catalogo/rodape-painel';
import { FALHA_AO_SALVAR } from '../escala-config/comum';
import { DateField } from '../form/DateField';
import { useAppForm } from '../form/form';
import { LinhaDeCampos } from '../form/LinhaDeCampos';
import { useAlterado } from '../painel/fechamento';
import { PainelLateral } from '../painel/PainelLateral';
import { OPCOES_DIAS } from './alocacao-form';
import { dataCurta } from './calendario';
import {
  type CoberturaAtual,
  esquemaCobertura,
  paraApiCobertura,
  type TitularCobertura,
  valoresCobertura,
} from './cobertura-form';

export type PainelCoberturaProps = {
  titular: TitularCobertura & { medicoNome: string /** "TC Neuro, Manhã". */; local: string };
  /** Dia clicado: início e fim de uma cobertura nova. */
  dia: string;
  /** Cobertura existente (editar). */
  atual?: CoberturaAtual;
  buscarMedicos: (termo: string, sinal?: AbortSignal) => Promise<OpcaoBusca[]>;
  onSalvar: (dados: CoberturaDto) => Promise<void>;
  onFechar: () => void;
};

/** Outro médico assume o vínculo do titular num período, no painel ao lado da escala. */
export function PainelCobertura({
  titular,
  dia,
  atual,
  buscarMedicos,
  onSalvar,
  onFechar,
}: PainelCoberturaProps) {
  const [erro, setErro] = useState<string>();
  const iniciais = valoresCobertura({ titular, dia, atual });
  const form = useAppForm({
    defaultValues: iniciais,
    validators: { onSubmit: esquemaCobertura(titular) },
    onSubmit: async ({ value }) => {
      setErro(undefined);
      try {
        await onSalvar(paraApiCobertura(value));
      } catch (falha) {
        setErro(mensagemDaApi(falha, FALHA_AO_SALVAR));
      }
    },
  });
  const alterado = useAlterado(form, iniciais);
  const vigencia = titular.dataFim
    ? `de ${dataCurta(titular.dataInicio)} a ${dataCurta(titular.dataFim)}`
    : `desde ${dataCurta(titular.dataInicio)}`;

  return (
    <PainelLateral
      titulo={`Cobertura de ${titular.medicoNome}`}
      subtitulo={titular.local}
      alterado={alterado}
      onFechar={onFechar}
    >
      <form
        noValidate
        onSubmit={(evento) => {
          evento.preventDefault();
          void form.handleSubmit();
        }}
        className="flex flex-col gap-4 p-4"
      >
        {erro && <Alerta tom="erro">{erro}</Alerta>}
        <form.AppField name="medico">
          {(field) => (
            <field.BuscaField
              label="Quem cobre"
              placeholder="Digite parte do nome"
              chave="medicos-ativos"
              buscar={buscarMedicos}
              required
            />
          )}
        </form.AppField>
        <LinhaDeCampos className="@[316px]:grid-cols-2">
          <form.AppField name="dataInicio">
            {() => (
              <DateField
                label="De"
                min={titular.dataInicio}
                max={titular.dataFim ?? undefined}
                required
              />
            )}
          </form.AppField>
          <form.AppField name="dataFim">
            {() => (
              <DateField
                label="Até"
                min={titular.dataInicio}
                max={titular.dataFim ?? undefined}
                required
              />
            )}
          </form.AppField>
        </LinhaDeCampos>
        <p className="text-muted-foreground -mt-2 text-[13px]">
          Dentro da escala do titular ({vigencia}).
        </p>
        <form.AppField name="diasSemana">
          {(field) => (
            <field.CaixasField
              label="Dias cobertos"
              opcoes={OPCOES_DIAS.filter((d) => titular.diasSemana.includes(Number(d.valor)))}
              required
              description="Só os dias da escala do titular."
            />
          )}
        </form.AppField>
        <LinhaDeCampos className="@[256px]:grid-cols-2">
          <form.AppField name="horarioInicio">
            {(field) => (
              <field.TextField
                label="Horário início"
                placeholder={titular.horarioInicio}
                mascara="hora"
                autoComplete="off"
              />
            )}
          </form.AppField>
          <form.AppField name="horarioFim">
            {(field) => (
              <field.TextField
                label="Horário fim"
                placeholder={titular.horarioFim}
                mascara="hora"
                autoComplete="off"
              />
            )}
          </form.AppField>
        </LinhaDeCampos>
        <form.AppField name="produtividade">
          {(field) => (
            <field.NumberField
              label="Produtividade"
              unidade="registros por turno"
              placeholder="Ex.: 40"
              min={0}
              description="Vem a do titular. Vazio: não informada."
            />
          )}
        </form.AppField>
        <form.AppField name="observacoes">
          {(field) => (
            <field.TextAreaField label="Observações" placeholder="Ex.: troca combinada com a Ana" />
          )}
        </form.AppField>
        <form.AppForm>
          <RodapePainel
            rotuloCriar="Criar cobertura"
            editando={Boolean(atual)}
            onCancelar={onFechar}
          />
        </form.AppForm>
      </form>
    </PainelLateral>
  );
}
