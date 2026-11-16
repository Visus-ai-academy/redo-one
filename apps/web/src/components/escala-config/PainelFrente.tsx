import { useState } from 'react';
import { z } from 'zod';

import type { FrenteDto } from '../../gen/types/FrenteDto';
import type { FrenteItemDto } from '../../gen/types/FrenteItemDto';
import { Alerta } from '../alerta/Alerta';
import { mensagemDaApi } from '../alerta/mensagem-da-api';
import { RodapePainel } from '../catalogo/rodape-painel';
import { CampoSomenteLeitura } from '../form/CampoSomenteLeitura';
import { useAppForm } from '../form/form';
import { PainelLateral } from '../painel/PainelLateral';
import {
  comunsParaApi,
  esquemaComuns,
  FALHA_AO_EXCLUIR,
  FALHA_AO_SALVAR,
  rotuloDe,
  TIPOS_FRENTE,
  valoresComuns,
} from './comum';

type Opcao = { id: string; nome: string };

const schema = z
  .object({
    ...esquemaComuns,
    tipo: z.enum(['especialidade', 'modalidade'], 'Escolha o tipo.'),
    destinoId: z.string(),
    rotulo: z.string(),
  })
  .superRefine((valor, ctx) => {
    if (!valor.destinoId)
      ctx.addIssue({
        code: 'custom',
        path: ['destinoId'],
        message: valor.tipo === 'modalidade' ? 'Escolha a modalidade.' : 'Escolha a especialidade.',
      });
  });

export type PainelFrenteProps = {
  /** Sem frente, o painel cria uma nova. */
  frente?: FrenteItemDto;
  /** Opções do catálogo. */
  especialidades: Opcao[];
  modalidades: Opcao[];
  podeEditar: boolean;
  onSalvar: (dados: FrenteDto) => Promise<void>;
  onExcluir?: () => Promise<void>;
  onFechar: () => void;
};

/** Onde o médico lauda num turno (uma especialidade ou uma modalidade do catálogo). */
export function PainelFrente({
  frente,
  especialidades,
  modalidades,
  podeEditar,
  onSalvar,
  onExcluir,
  onFechar,
}: PainelFrenteProps) {
  const [erro, setErro] = useState<string>();
  const titulo = frente?.rotulo ?? 'Nova frente';

  // Destino inativo no catálogo continua escolhível na frente que já aponta para ele.
  const comAtual = (opcoes: Opcao[], id: string | null | undefined) =>
    frente && id && !opcoes.some((o) => o.id === id)
      ? [...opcoes, { id, nome: frente.destinoNome }]
      : opcoes;
  const opcoesPorTipo = {
    especialidade: comAtual(especialidades, frente?.especialidadeId),
    modalidade: comAtual(modalidades, frente?.modalidadeId),
  };

  const form = useAppForm({
    defaultValues: {
      ...valoresComuns(frente),
      tipo: (frente?.tipo ?? 'especialidade') as string,
      destinoId: frente?.especialidadeId ?? frente?.modalidadeId ?? '',
      rotulo: frente?.rotulo ?? '',
    },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      setErro(undefined);
      const tipo = value.tipo as FrenteDto['tipo'];
      try {
        await onSalvar({
          tipo,
          especialidadeId: tipo === 'especialidade' ? value.destinoId : null,
          modalidadeId: tipo === 'modalidade' ? value.destinoId : null,
          rotulo: value.rotulo.trim() || null,
          ...comunsParaApi(value),
        });
      } catch (falha) {
        setErro(mensagemDaApi(falha, FALHA_AO_SALVAR));
      }
    },
  });

  if (!podeEditar && frente) {
    return (
      <PainelLateral titulo={titulo} onFechar={onFechar}>
        <div className="flex flex-col gap-4 p-4">
          <CampoSomenteLeitura label="Tipo" value={rotuloDe(TIPOS_FRENTE, frente.tipo)} />
          <CampoSomenteLeitura
            label={rotuloDe(TIPOS_FRENTE, frente.tipo)}
            value={frente.destinoNome}
          />
          <CampoSomenteLeitura label="Descrição" value={frente.descricao ?? '—'} />
          <CampoSomenteLeitura label="Situação" value={frente.ativo ? 'Ativa' : 'Inativa'} />
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
        <form.AppField
          name="tipo"
          listeners={{
            // Trocou o tipo: o destino escolhido era da outra lista.
            onChange: () => form.setFieldValue('destinoId', ''),
          }}
        >
          {(field) => (
            <field.SelectField
              label="Tipo"
              placeholder="Escolha o tipo"
              opcoes={TIPOS_FRENTE}
              required
            />
          )}
        </form.AppField>
        <form.Subscribe selector={(estado) => estado.values.tipo}>
          {(tipo) => {
            const modalidade = tipo === 'modalidade';
            const opcoes = modalidade ? opcoesPorTipo.modalidade : opcoesPorTipo.especialidade;
            return (
              <form.AppField name="destinoId">
                {(field) => (
                  <field.SelectField
                    // Remonta ao trocar o tipo: rótulo, opções e valor mudam juntos.
                    key={tipo}
                    label={modalidade ? 'Modalidade' : 'Especialidade'}
                    placeholder={modalidade ? 'Escolha a modalidade' : 'Escolha a especialidade'}
                    opcoes={opcoes.map((o) => ({ valor: o.id, rotulo: o.nome }))}
                    required
                    description="Do catálogo de classificação dos exames."
                  />
                )}
              </form.AppField>
            );
          }}
        </form.Subscribe>
        <form.Subscribe
          selector={(estado) => {
            const { tipo, destinoId } = estado.values;
            const opcoes =
              tipo === 'modalidade' ? opcoesPorTipo.modalidade : opcoesPorTipo.especialidade;
            return opcoes.find((o) => o.id === destinoId)?.nome ?? '';
          }}
        >
          {(destinoNome) => (
            <form.AppField name="rotulo">
              {(field) => (
                <field.TextField
                  label="Rótulo"
                  placeholder={destinoNome || 'Ex.: MSK'}
                  autoComplete="off"
                  description="Nome na escala. Vazio: o nome do catálogo."
                />
              )}
            </form.AppField>
          )}
        </form.Subscribe>
        <form.AppField name="descricao">
          {(field) => (
            <field.TextField
              label="Descrição"
              placeholder="Ex.: Exames de joelho, ombro e coluna"
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
                description="Cor da frente na grade da escala."
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
              label="Ativa"
              description="Inativa some da montagem dos turnos, mas as alocações antigas ficam."
            />
          )}
        </form.AppField>
        <form.AppForm>
          <RodapePainel
            rotuloCriar="Criar frente"
            editando={Boolean(frente)}
            onCancelar={onFechar}
            excluir={
              frente && onExcluir
                ? {
                    acao: 'Excluir frente',
                    titulo: `Excluir ${frente.rotulo}?`,
                    consequencia: `${frente.rotulo} sai da escala e dos turnos. Se há alocações nela, a exclusão é recusada: desative em vez de excluir.`,
                    onConfirmar: async () => {
                      setErro(undefined);
                      try {
                        await onExcluir();
                      } catch (falha) {
                        setErro(mensagemDaApi(falha, FALHA_AO_EXCLUIR));
                      }
                    },
                  }
                : undefined
            }
          />
        </form.AppForm>
      </form>
    </PainelLateral>
  );
}
