import { useState } from 'react';
import { z } from 'zod';

import type { TipoAusenciaDto } from '../../gen/types/TipoAusenciaDto';
import type { TipoAusenciaItemDto } from '../../gen/types/TipoAusenciaItemDto';
import { Alerta } from '../alerta/Alerta';
import { mensagemDaApi } from '../alerta/mensagem-da-api';
import { RodapePainel, RodapeSomenteLeitura } from '../catalogo/rodape-painel';
import { CampoSomenteLeitura } from '../form/CampoSomenteLeitura';
import { useAppForm } from '../form/form';
import { PainelLateral } from '../painel/PainelLateral';
import {
  comunsParaApi,
  esquemaComuns,
  FALHA_AO_EXCLUIR,
  FALHA_AO_SALVAR,
  valoresComuns,
} from './comum';

const AJUDA_GRAVIDADE = 'Com várias ausências no mesmo dia, vale a de maior gravidade.';

const schema = z.object({
  ...esquemaComuns,
  nome: z.string().trim().min(1, 'Informe o nome.'),
  gravidade: z.string().regex(/^\d{1,3}$/, 'Informe um número inteiro de 0 a 999.'),
  soGestor: z.boolean(),
  contaComoFalta: z.boolean(),
});

export type PainelTipoAusenciaProps = {
  /** Sem tipo, o painel cria um novo. */
  tipo?: TipoAusenciaItemDto;
  podeEditar: boolean;
  onSalvar: (dados: TipoAusenciaDto) => Promise<void>;
  onExcluir?: () => Promise<void>;
  onFechar: () => void;
};

const simNao = (valor: boolean) => (valor ? 'Sim' : 'Não');

/** Motivo de afastamento do médico (férias, congresso, falta): criar, ver e editar. */
export function PainelTipoAusencia({
  tipo,
  podeEditar,
  onSalvar,
  onExcluir,
  onFechar,
}: PainelTipoAusenciaProps) {
  const [erro, setErro] = useState<string>();
  const titulo = tipo?.nome ?? 'Novo tipo de ausência';

  const form = useAppForm({
    defaultValues: {
      ...valoresComuns(tipo),
      nome: tipo?.nome ?? '',
      gravidade: String(tipo?.gravidade ?? 0),
      soGestor: tipo?.soGestor ?? false,
      contaComoFalta: tipo?.contaComoFalta ?? false,
    },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      setErro(undefined);
      try {
        await onSalvar({
          nome: value.nome.trim(),
          gravidade: Number(value.gravidade),
          soGestor: value.soGestor,
          contaComoFalta: value.contaComoFalta,
          ...comunsParaApi(value),
        });
      } catch (falha) {
        setErro(mensagemDaApi(falha, FALHA_AO_SALVAR));
      }
    },
  });

  const excluir =
    tipo && onExcluir
      ? {
          acao: 'Excluir tipo de ausência',
          titulo: `Excluir ${tipo.nome}?`,
          consequencia: `${tipo.nome} sai das opções de ausência. Se alguma ausência usa este tipo, a exclusão é recusada: desative em vez de excluir.`,
          onConfirmar: async () => {
            setErro(undefined);
            try {
              await onExcluir();
            } catch (falha) {
              setErro(mensagemDaApi(falha, FALHA_AO_EXCLUIR));
            }
          },
        }
      : undefined;

  if (!podeEditar && tipo) {
    return (
      <PainelLateral titulo={titulo} onFechar={onFechar}>
        <div className="flex flex-col gap-4 p-4">
          {erro && <Alerta tom="erro">{erro}</Alerta>}
          <CampoSomenteLeitura
            label="Gravidade"
            value={String(tipo.gravidade)}
            description={AJUDA_GRAVIDADE}
          />
          <CampoSomenteLeitura label="Só o gestor lança" value={simNao(tipo.soGestor)} />
          <CampoSomenteLeitura label="Conta como falta" value={simNao(tipo.contaComoFalta)} />
          <CampoSomenteLeitura label="Descrição" value={tipo.descricao ?? '—'} />
          <CampoSomenteLeitura label="Situação" value={tipo.ativo ? 'Ativo' : 'Inativo'} />
          <RodapeSomenteLeitura excluir={excluir} />
        </div>
      </PainelLateral>
    );
  }

  return (
    <PainelLateral titulo={titulo} onFechar={onFechar}>
      <form
        noValidate
        onSubmit={(evento) => {
          evento.preventDefault();
          void form.handleSubmit();
        }}
        className="flex flex-col gap-4 p-4"
      >
        {erro && <Alerta tom="erro">{erro}</Alerta>}
        <form.AppField name="nome">
          {(field) => (
            <field.TextField label="Nome" placeholder="Ex.: Férias" autoComplete="off" required />
          )}
        </form.AppField>
        <form.AppField name="gravidade">
          {(field) => (
            <field.NumberField
              label="Gravidade"
              placeholder="0"
              min={0}
              max={999}
              required
              description={AJUDA_GRAVIDADE}
            />
          )}
        </form.AppField>
        <form.AppField name="soGestor">
          {(field) => (
            <field.CheckboxField
              label="Só o gestor lança"
              description="O médico não pede esta ausência pelo portal."
            />
          )}
        </form.AppField>
        <form.AppField name="contaComoFalta">
          {(field) => (
            <field.CheckboxField
              label="Conta como falta"
              description="Entra na contagem de faltas dos indicadores."
            />
          )}
        </form.AppField>
        <form.AppField name="descricao">
          {(field) => (
            <field.TextField
              label="Descrição"
              placeholder="Ex.: Período de férias combinado com a coordenação"
              autoComplete="off"
            />
          )}
        </form.AppField>
        <div className="flex flex-wrap gap-4">
          <form.AppField name="cor">
            {(field) => (
              <field.TextField
                label="Cor"
                placeholder="#1F7A4D"
                autoComplete="off"
                description="Cor da ausência na escala."
                className="flex-[1_1_160px]"
              />
            )}
          </form.AppField>
          <form.AppField name="ordem">
            {(field) => (
              <field.NumberField
                label="Ordem"
                placeholder="0"
                min={0}
                max={9999}
                required
                description="Menor aparece primeiro."
                className="flex-[1_1_120px]"
              />
            )}
          </form.AppField>
        </div>
        <form.AppField name="ativo">
          {(field) => (
            <field.CheckboxField
              label="Ativo"
              description="Inativo some das opções ao lançar ausência, mas as antigas ficam."
            />
          )}
        </form.AppField>
        <form.AppForm>
          <RodapePainel
            rotuloCriar="Criar tipo de ausência"
            editando={Boolean(tipo)}
            onCancelar={onFechar}
            excluir={excluir}
          />
        </form.AppForm>
      </form>
    </PainelLateral>
  );
}
