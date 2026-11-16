import { Fieldset } from '@base-ui/react/fieldset';
import { useState } from 'react';
import { z } from 'zod';

import type { TurnoDto } from '../../gen/types/TurnoDto';
import type { TurnoItemDto } from '../../gen/types/TurnoItemDto';
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
  TIPOS_TURNO,
  valoresComuns,
} from './comum';
import { formatarDuracao, formatarHorario, horarioValido, normalizarHorario } from './horario';

const horario = z.string().refine(horarioValido, 'Use HH:MM, como 07:00.');

const schema = z.object({
  ...esquemaComuns,
  nome: z.string().trim().min(1, 'Informe o nome do turno.'),
  tipo: z.enum(['fixo', 'lista'], 'Escolha o tipo.'),
  horarioInicio: horario,
  horarioFim: horario,
  especialidadeIds: z.array(z.string()),
  modalidadeIds: z.array(z.string()),
});

type Opcao = { id: string; nome: string };

export type PainelTurnoProps = {
  /** Sem turno, o painel cria um novo. */
  turno?: TurnoItemDto;
  /** Especialidades e modalidades ativas do catálogo, para marcar no turno. */
  especialidades: Opcao[];
  modalidades: Opcao[];
  podeEditar: boolean;
  onSalvar: (dados: TurnoDto) => Promise<void>;
  onExcluir?: () => Promise<void>;
  onFechar: () => void;
};

/** Bloco de horário da escala: criar, ver e editar, no painel ao lado da lista. */
export function PainelTurno({
  turno,
  especialidades,
  modalidades,
  podeEditar,
  onSalvar,
  onExcluir,
  onFechar,
}: PainelTurnoProps) {
  const [erro, setErro] = useState<string>();
  const titulo = turno?.nome ?? 'Novo turno';

  // Item inativo no catálogo que o turno já tem continua marcável, para não sumir ao salvar.
  const opcoesCom = (ativas: Opcao[], marcados: string[] = []) => [
    ...ativas.map((o) => ({ valor: o.id, rotulo: o.nome })),
    ...marcados
      .filter((id) => !ativas.some((o) => o.id === id))
      .map((id) => ({
        valor: id,
        rotulo:
          turno?.frentes.find((f) => f.especialidadeId === id || f.modalidadeId === id)?.rotulo ??
          'Sem nome',
        inativa: true,
      })),
  ];
  const opcoesEspecialidades = opcoesCom(especialidades, turno?.especialidadeIds);
  const opcoesModalidades = opcoesCom(modalidades, turno?.modalidadeIds);

  const form = useAppForm({
    defaultValues: {
      ...valoresComuns(turno),
      nome: turno?.nome ?? '',
      tipo: (turno?.tipo ?? 'fixo') as string,
      horarioInicio: turno?.horarioInicio ?? '',
      horarioFim: turno?.horarioFim ?? '',
      especialidadeIds: turno?.especialidadeIds ?? [],
      modalidadeIds: turno?.modalidadeIds ?? [],
    },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      setErro(undefined);
      try {
        await onSalvar({
          nome: value.nome.trim(),
          tipo: value.tipo as TurnoDto['tipo'],
          horarioInicio: normalizarHorario(value.horarioInicio),
          horarioFim: normalizarHorario(value.horarioFim),
          especialidadeIds: value.especialidadeIds,
          modalidadeIds: value.modalidadeIds,
          ...comunsParaApi(value),
        });
      } catch (falha) {
        setErro(mensagemDaApi(falha, FALHA_AO_SALVAR));
      }
    },
  });

  if (!podeEditar && turno) {
    return (
      <PainelLateral titulo={titulo} onFechar={onFechar}>
        <div className="flex flex-col gap-4 p-4">
          <CampoSomenteLeitura label="Tipo" value={rotuloDe(TIPOS_TURNO, turno.tipo)} />
          <CampoSomenteLeitura
            label="Horário"
            value={`${formatarHorario(turno.horarioInicio, turno.horarioFim)} (${formatarDuracao(turno.duracaoMin)})`}
          />
          <CampoSomenteLeitura
            label="Especialidades e modalidades"
            value={turno.frentes.map((f) => f.rotulo).join(', ') || '—'}
          />
          <CampoSomenteLeitura label="Descrição" value={turno.descricao ?? '—'} />
          <CampoSomenteLeitura label="Situação" value={turno.ativo ? 'Ativo' : 'Inativo'} />
        </div>
      </PainelLateral>
    );
  }

  return (
    <PainelLateral
      titulo={titulo}
      subtitulo={
        turno
          ? `${formatarHorario(turno.horarioInicio, turno.horarioFim)} (${formatarDuracao(turno.duracaoMin)})`
          : undefined
      }
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
        <form.AppField name="nome">
          {(field) => (
            <field.TextField label="Nome" placeholder="Ex.: Manhã" autoComplete="off" required />
          )}
        </form.AppField>
        <form.AppField name="tipo">
          {(field) => (
            <field.SelectField
              label="Tipo"
              placeholder="Escolha o tipo"
              opcoes={TIPOS_TURNO}
              required
              description="Lista: a Lista de 24 h, com gratificação e regra própria no robô."
            />
          )}
        </form.AppField>
        <div className="flex flex-wrap gap-4">
          <form.AppField name="horarioInicio">
            {(field) => (
              <field.TextField
                label="Início"
                placeholder="07:00"
                autoComplete="off"
                required
                className="flex-[1_1_120px]"
              />
            )}
          </form.AppField>
          <form.AppField name="horarioFim">
            {(field) => (
              <field.TextField
                label="Fim"
                placeholder="13:00"
                autoComplete="off"
                required
                className="flex-[1_1_120px]"
              />
            )}
          </form.AppField>
        </div>
        <p className="text-muted-foreground -mt-2 text-[13px]">
          Fim antes do início: o turno passa da meia-noite; igual ao início: 24 h.
        </p>
        <Fieldset.Root className="flex flex-col gap-3">
          <Fieldset.Legend className="text-foreground font-medium">
            Especialidades e modalidades deste turno
          </Fieldset.Legend>
          <p className="text-muted-foreground -mt-1 text-[13px]">
            Onde os médicos do turno laudam. Vêm do catálogo de classificação dos exames.
          </p>
          <div className="flex flex-wrap gap-4">
            <form.AppField name="especialidadeIds">
              {(field) => (
                <field.SelecaoMultiplaField
                  label="Especialidades"
                  opcoes={opcoesEspecialidades}
                  className="flex-[1_1_180px]"
                />
              )}
            </form.AppField>
            <form.AppField name="modalidadeIds">
              {(field) => (
                <field.SelecaoMultiplaField
                  label="Modalidades"
                  opcoes={opcoesModalidades}
                  className="flex-[1_1_180px]"
                />
              )}
            </form.AppField>
          </div>
        </Fieldset.Root>
        <form.AppField name="descricao">
          {(field) => (
            <field.TextField
              label="Descrição"
              placeholder="Ex.: Plantão da manhã, de segunda a sexta"
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
                description="Cor do turno na grade da escala."
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
              description="Inativo some da montagem da escala, mas as alocações antigas ficam."
            />
          )}
        </form.AppField>
        <form.AppForm>
          <RodapePainel
            rotuloCriar="Criar turno"
            editando={Boolean(turno)}
            onCancelar={onFechar}
            excluir={
              turno && onExcluir
                ? {
                    acao: 'Excluir turno',
                    titulo: `Excluir ${turno.nome}?`,
                    consequencia: `${turno.nome} sai da escala. Se há alocações nele, a exclusão é recusada: desative em vez de excluir.`,
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
