import { type ReactNode, useState } from 'react';
import { z } from 'zod';

import type { EquipeDto } from '../../gen/types/EquipeDto';
import type { EquipeItemDto } from '../../gen/types/EquipeItemDto';
import { Abas } from '../abas/Abas';
import { Alerta } from '../alerta/Alerta';
import type { OpcaoBusca } from '../busca/BuscaSelecao';
import { RodapePainel, RodapeSomenteLeitura } from '../catalogo/rodape-painel';
import { useErroDoPainel } from '../catalogo/use-erro-do-painel';
import { CampoSomenteLeitura } from '../form/CampoSomenteLeitura';
import { useAppForm } from '../form/form';
import { PainelLateral } from '../painel/PainelLateral';

export type PainelEquipeProps = {
  /** Sem equipe, o painel cria uma nova. */
  equipe?: EquipeItemDto;
  /** Membros atuais, já com o nome. */
  membros: OpcaoBusca[];
  buscarMedicos: (termo: string) => Promise<OpcaoBusca[]>;
  podeEditar: boolean;
  onSalvar: (dados: EquipeDto) => Promise<void>;
  onExcluir?: () => Promise<void>;
  onFechar: () => void;
  /** Conteúdo da aba Distribuição (arranjos); sem ele, ou criando, a aba não aparece. */
  distribuicao?: ReactNode;
};

const HEX = /^#[0-9a-f]{6}$/i;

const schema = z.object({
  nome: z.string().trim().min(1, 'Informe o nome da equipe.'),
  descricao: z.string(),
  cor: z
    .string()
    .refine(
      (cor) => cor.trim() === '' || HEX.test(cor.trim()),
      'Use o formato #RRGGBB, como #1F7A4D.',
    ),
  ordem: z.string().regex(/^\d{1,4}$/, 'Informe um número inteiro de 0 a 9999.'),
  ativo: z.boolean(),
  membros: z.array(z.object({ valor: z.string(), rotulo: z.string() })),
});

/** Criar, ver e editar uma equipe médica e os membros, no painel ao lado da lista. */
export function PainelEquipe({
  equipe,
  membros,
  buscarMedicos,
  podeEditar,
  onSalvar,
  onExcluir,
  onFechar,
  distribuicao,
}: PainelEquipeProps) {
  const [aba, setAba] = useState('cadastro');
  const { erro, tentar } = useErroDoPainel();
  const form = useAppForm({
    defaultValues: {
      nome: equipe?.nome ?? '',
      descricao: equipe?.descricao ?? '',
      cor: equipe?.cor ?? '',
      ordem: String(equipe?.ordem ?? 0),
      ativo: equipe?.ativo ?? true,
      membros,
    },
    validators: { onSubmit: schema },
    onSubmit: ({ value }) =>
      tentar(() =>
        onSalvar({
          nome: value.nome.trim(),
          descricao: value.descricao.trim() || null,
          cor: value.cor.trim() || null,
          ordem: Number(value.ordem),
          ativo: value.ativo,
          medicoIds: value.membros.map((m) => m.valor),
        }),
      ),
  });

  const campoMembros = (somenteLeitura: boolean) => (
    <form.AppField name="membros">
      {(field) => (
        <field.EscolhaMultiplaField
          label="Membros"
          rotuloAdicionar="Adicionar médico"
          placeholder="Digite o nome do médico"
          chave="medicos"
          buscar={buscarMedicos}
          vazio="Nenhum médico na equipe ainda."
          somenteLeitura={somenteLeitura}
        />
      )}
    </form.AppField>
  );

  const excluir =
    equipe && onExcluir
      ? {
          acao: 'Excluir equipe',
          titulo: `Excluir ${equipe.nome}?`,
          consequencia:
            'A equipe sai do cadastro e os médicos deixam de ser membros dela. Os médicos continuam cadastrados.',
          onConfirmar: () => tentar(onExcluir, 'Não foi possível excluir agora. Tente de novo.'),
        }
      : undefined;

  const cadastro =
    !podeEditar && equipe ? (
      <div className="flex flex-col gap-4 p-4">
        {erro && <Alerta tom="erro">{erro}</Alerta>}
        <CampoSomenteLeitura label="Descrição" value={equipe.descricao ?? '—'} />
        <CampoSomenteLeitura label="Situação" value={equipe.ativo ? 'Ativa' : 'Inativa'} />
        {campoMembros(true)}
        <RodapeSomenteLeitura excluir={excluir} />
      </div>
    ) : (
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
        className="flex flex-col gap-4 p-4"
      >
        {erro && <Alerta tom="erro">{erro}</Alerta>}
        <form.AppField name="nome">
          {(field) => (
            <field.TextField label="Nome" placeholder="Ex.: Equipe 1" autoComplete="off" required />
          )}
        </form.AppField>
        <form.AppField name="descricao">
          {(field) => (
            <field.TextField
              label="Descrição"
              placeholder="Ex.: Neuro da madrugada"
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
                description="Cor do selo nas telas."
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
              description="Inativa, o robô ignora o recorte dela; os membros continuam."
            />
          )}
        </form.AppField>
        {campoMembros(false)}
        <form.AppForm>
          <RodapePainel
            rotuloCriar="Criar equipe"
            editando={Boolean(equipe)}
            excluir={excluir}
            onCancelar={onFechar}
          />
        </form.AppForm>
      </form>
    );

  return (
    <PainelLateral titulo={equipe?.nome ?? 'Nova equipe'} onFechar={onFechar}>
      {equipe && distribuicao ? (
        <Abas
          aria-label="Partes da equipe"
          valor={aba}
          onMudar={setAba}
          abas={[
            { valor: 'cadastro', rotulo: 'Cadastro' },
            { valor: 'distribuicao', rotulo: 'Distribuição' },
          ]}
          className="gap-0 pt-2"
        >
          {aba === 'distribuicao' ? distribuicao : cadastro}
        </Abas>
      ) : (
        cadastro
      )}
    </PainelLateral>
  );
}
