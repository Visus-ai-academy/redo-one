import { Fieldset } from '@base-ui/react/fieldset';
import { z } from 'zod';

import type { DeParaEspecialidadeDto } from '../../gen/types/DeParaEspecialidadeDto';
import type { DeParaEspecialidadeItemDto } from '../../gen/types/DeParaEspecialidadeItemDto';
import type { DeParaPrioridadeDto } from '../../gen/types/DeParaPrioridadeDto';
import type { DeParaPrioridadeItemDto } from '../../gen/types/DeParaPrioridadeItemDto';
import type { DeParaValorDto } from '../../gen/types/DeParaValorDto';
import type { DeParaValorItemDto } from '../../gen/types/DeParaValorItemDto';
import type { SufixoDto } from '../../gen/types/SufixoDto';
import type { SufixoItemDto } from '../../gen/types/SufixoItemDto';
import { Alerta } from '../alerta/Alerta';
import type { OpcaoBusca } from '../busca/BuscaSelecao';
import { useAppForm } from '../form/form';
import { PainelLateral } from '../painel/PainelLateral';
import { RodapePainel } from './rodape-painel';
import { useErroDoPainel } from './use-erro-do-painel';

type Base<Item, Dados> = {
  /** Sem item, o painel cria um novo. */
  item?: Item;
  podeEditar: boolean;
  onSalvar: (dados: Dados) => Promise<void>;
  onExcluir?: () => Promise<void>;
  onFechar: () => void;
};

const textoObrigatorio = (mensagem: string) => z.string().trim().min(1, mensagem);
const opcional = (texto: string) => texto.trim() || null;
const ativoAjuda = 'Inativo não vale na importação, mas fica guardado.';

function excluirDePara(
  nome: string,
  onExcluir: (() => Promise<void>) | undefined,
  tentar: ReturnType<typeof useErroDoPainel>['tentar'],
) {
  return onExcluir
    ? {
        acao: 'Excluir de-para',
        titulo: `Excluir o de-para de “${nome}”?`,
        consequencia:
          'A importação deixa de traduzir esse valor a partir da próxima vez. Para só pausar, desative.',
        onConfirmar: () => tentar(onExcluir, 'Não foi possível excluir agora. Tente de novo.'),
      }
    : undefined;
}

export function PainelDeParaPrioridade({
  item,
  prioridades,
  podeEditar,
  onSalvar,
  onExcluir,
  onFechar,
}: Base<DeParaPrioridadeItemDto, DeParaPrioridadeDto> & {
  prioridades: { id: string; nome: string }[];
}) {
  const { erro, tentar } = useErroDoPainel();
  const form = useAppForm({
    defaultValues: {
      origem: item?.origem ?? '',
      prioridadeId: item?.prioridadeId ?? '',
      ativo: item?.ativo ?? true,
    },
    validators: {
      onSubmit: z.object({
        origem: textoObrigatorio('Informe o valor como chega da MobileMed.'),
        prioridadeId: z.string().min(1, 'Escolha a prioridade.'),
        ativo: z.boolean(),
      }),
    },
    onSubmit: ({ value }) => tentar(() => onSalvar({ ...value, origem: value.origem.trim() })),
  });

  return (
    <PainelLateral titulo={item ? item.origem : 'Novo de-para de prioridade'} onFechar={onFechar}>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
        className="flex flex-col gap-4 p-4"
      >
        {erro && <Alerta tom="erro">{erro}</Alerta>}
        <Fieldset.Root disabled={!podeEditar} className="flex flex-col gap-4">
          <form.AppField name="origem">
            {(field) => (
              <field.TextField
                label="Valor que chega"
                placeholder="Ex.: ELETIVO"
                description="Exatamente como vem no arquivo da MobileMed."
                autoComplete="off"
                required
              />
            )}
          </form.AppField>
          <form.AppField name="prioridadeId">
            {(field) => (
              <field.SelectField
                label="Prioridade"
                placeholder="Escolha a prioridade"
                required
                opcoes={prioridades.map((p) => ({ valor: p.id, rotulo: p.nome }))}
              />
            )}
          </form.AppField>
          <form.AppField name="ativo">
            {(field) => <field.CheckboxField label="Ativo" description={ativoAjuda} />}
          </form.AppField>
        </Fieldset.Root>
        {podeEditar && (
          <form.AppForm>
            <RodapePainel
              rotuloCriar="Criar de-para"
              editando={Boolean(item)}
              excluir={item ? excluirDePara(item.origem, onExcluir, tentar) : undefined}
              onCancelar={onFechar}
            />
          </form.AppForm>
        )}
      </form>
    </PainelLateral>
  );
}

const TIPOS = [
  {
    valor: 'normalizacao',
    rotulo: 'Grafia de especialidade',
    ajuda: 'O valor é outra forma de escrever uma especialidade (MAMO → MAMA).',
  },
  {
    valor: 'regiao_anatomica',
    rotulo: 'Região anatômica',
    ajuda:
      'O valor é uma região do corpo que decide a especialidade de preço (JOELHO → MUSCULO ESQUELETICO).',
  },
  {
    valor: 'invalida',
    rotulo: 'Não é especialidade',
    ajuda:
      'O valor chega no campo especialidade mas não é uma (RX, CT): a especialidade vem do cadastro do exame.',
  },
] as const;

type Tipo = (typeof TIPOS)[number]['valor'];

export function PainelDeParaEspecialidade({
  item,
  especialidades,
  podeEditar,
  onSalvar,
  onExcluir,
  onFechar,
}: Base<DeParaEspecialidadeItemDto, DeParaEspecialidadeDto> & {
  especialidades: { id: string; nome: string }[];
}) {
  const { erro, tentar } = useErroDoPainel();
  const form = useAppForm({
    defaultValues: {
      tipo: (item?.tipo ?? 'normalizacao') as Tipo,
      origem: item?.origem ?? '',
      especialidadeId: item?.especialidadeId ?? '',
      ativo: item?.ativo ?? true,
      observacoes: item?.observacoes ?? '',
    },
    validators: {
      onSubmit: z
        .object({
          tipo: z.enum(['normalizacao', 'regiao_anatomica', 'invalida']),
          origem: textoObrigatorio('Informe o valor como chega da MobileMed.'),
          especialidadeId: z.string(),
          ativo: z.boolean(),
          observacoes: z.string(),
        })
        .refine((v) => v.tipo === 'invalida' || v.especialidadeId !== '', {
          path: ['especialidadeId'],
          message: 'Escolha a especialidade de destino.',
        }),
    },
    onSubmit: ({ value }) =>
      tentar(() =>
        onSalvar({
          tipo: value.tipo,
          origem: value.origem.trim(),
          especialidadeId: value.tipo === 'invalida' ? null : value.especialidadeId,
          ativo: value.ativo,
          observacoes: opcional(value.observacoes),
        }),
      ),
  });

  return (
    <PainelLateral
      titulo={item ? item.origem : 'Novo de-para de especialidade'}
      onFechar={onFechar}
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
        className="flex flex-col gap-4 p-4"
      >
        {erro && <Alerta tom="erro">{erro}</Alerta>}
        <Fieldset.Root disabled={!podeEditar} className="flex flex-col gap-4">
          <form.Subscribe selector={(estado) => estado.values.tipo}>
            {(tipo) => (
              <>
                <form.AppField name="tipo">
                  {(field) => (
                    <field.SelectField
                      label="Tipo"
                      placeholder="Escolha o tipo"
                      required
                      description={TIPOS.find((t) => t.valor === tipo)?.ajuda}
                      opcoes={TIPOS.map((t) => ({ valor: t.valor, rotulo: t.rotulo }))}
                    />
                  )}
                </form.AppField>
                <form.AppField name="origem">
                  {(field) => (
                    <field.TextField
                      label="Valor que chega"
                      placeholder={tipo === 'regiao_anatomica' ? 'Ex.: JOELHO' : 'Ex.: MAMO'}
                      description="Comparado em maiúsculas; na região anatômica, também sem acento."
                      autoComplete="off"
                      required
                    />
                  )}
                </form.AppField>
                {tipo !== 'invalida' && (
                  <form.AppField name="especialidadeId">
                    {(field) => (
                      <field.SelectField
                        label="Especialidade"
                        placeholder="Escolha a especialidade"
                        required
                        opcoes={especialidades.map((e) => ({ valor: e.id, rotulo: e.nome }))}
                      />
                    )}
                  </form.AppField>
                )}
              </>
            )}
          </form.Subscribe>
          <form.AppField name="observacoes">
            {(field) => (
              <field.TextAreaField
                label="Observações"
                placeholder="Ex.: por que essa regra existe"
              />
            )}
          </form.AppField>
          <form.AppField name="ativo">
            {(field) => <field.CheckboxField label="Ativo" description={ativoAjuda} />}
          </form.AppField>
        </Fieldset.Root>
        {podeEditar && (
          <form.AppForm>
            <RodapePainel
              rotuloCriar="Criar de-para"
              editando={Boolean(item)}
              excluir={item ? excluirDePara(item.origem, onExcluir, tentar) : undefined}
              onCancelar={onFechar}
            />
          </form.AppForm>
        )}
      </form>
    </PainelLateral>
  );
}

export function PainelDeParaValor({
  item,
  buscarExames,
  podeEditar,
  onSalvar,
  onExcluir,
  onFechar,
}: Base<DeParaValorItemDto, DeParaValorDto> & {
  buscarExames: (termo: string) => Promise<OpcaoBusca[]>;
}) {
  const { erro, tentar } = useErroDoPainel();
  const form = useAppForm({
    defaultValues: {
      estudoDescricao: item?.estudoDescricao ?? '',
      valores: item ? String(item.valores) : '',
      exame: (item?.exameId
        ? { valor: item.exameId, rotulo: item.destinoNome ?? '' }
        : null) as OpcaoBusca | null,
      ativo: item?.ativo ?? true,
    },
    validators: {
      onSubmit: z.object({
        estudoDescricao: textoObrigatorio('Informe a descrição do estudo como chega da MobileMed.'),
        valores: z
          .string()
          .regex(
            /^\d{1,3}(\.\d{1,2})?$/,
            'Informe quantas unidades o laudo vale, de 0 a 999, com até 2 casas.',
          ),
        exame: z.custom<OpcaoBusca | null>(),
        ativo: z.boolean(),
      }),
    },
    onSubmit: ({ value }) =>
      tentar(() =>
        onSalvar({
          estudoDescricao: value.estudoDescricao.trim(),
          valores: Number(value.valores),
          exameId: value.exame?.valor ?? null,
          ativo: value.ativo,
        }),
      ),
  });

  return (
    <PainelLateral
      titulo={item ? item.estudoDescricao : 'Novo de-para de valores'}
      onFechar={onFechar}
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
        className="flex flex-col gap-4 p-4"
      >
        <p className="text-muted-foreground">
          Vale para o laudo que chega com VALORES zerado. Sem de-para, ele conta como 1.
        </p>
        {erro && <Alerta tom="erro">{erro}</Alerta>}
        <Fieldset.Root disabled={!podeEditar} className="flex flex-col gap-4">
          <form.AppField name="estudoDescricao">
            {(field) => (
              <field.TextField
                label="Descrição do estudo"
                placeholder="Ex.: RM CRANIO"
                description="Grafias que diferem só em acento, maiúsculas ou pontuação são a mesma."
                autoComplete="off"
                required
              />
            )}
          </form.AppField>
          <form.AppField name="valores">
            {(field) => (
              <field.NumberField
                label="Vale (unidades)"
                placeholder="Ex.: 2"
                min={0}
                max={999}
                step={0.01}
                required
              />
            )}
          </form.AppField>
          <form.AppField name="exame">
            {(field) => (
              <field.BuscaField
                label="Exame do catálogo"
                placeholder="Digite o nome do exame"
                chave="exames"
                buscar={buscarExames}
                description="Opcional: completa categoria e especialidade de estudo que não está no catálogo."
              />
            )}
          </form.AppField>
          <form.AppField name="ativo">
            {(field) => <field.CheckboxField label="Ativo" description={ativoAjuda} />}
          </form.AppField>
        </Fieldset.Root>
        {podeEditar && (
          <form.AppForm>
            <RodapePainel
              rotuloCriar="Criar de-para"
              editando={Boolean(item)}
              excluir={item ? excluirDePara(item.estudoDescricao, onExcluir, tentar) : undefined}
              onCancelar={onFechar}
            />
          </form.AppForm>
        )}
      </form>
    </PainelLateral>
  );
}

export function PainelSufixo({
  item,
  podeEditar,
  onSalvar,
  onExcluir,
  onFechar,
}: Base<SufixoItemDto, SufixoDto>) {
  const { erro, tentar } = useErroDoPainel();
  const form = useAppForm({
    defaultValues: {
      sufixo: item?.sufixo ?? '',
      ativo: item?.ativo ?? true,
      observacoes: item?.observacoes ?? '',
    },
    validators: {
      onSubmit: z.object({
        sufixo: textoObrigatorio('Informe o sufixo.'),
        ativo: z.boolean(),
        observacoes: z.string(),
      }),
    },
    onSubmit: ({ value }) =>
      tentar(() =>
        onSalvar({
          sufixo: value.sufixo.trim(),
          ativo: value.ativo,
          observacoes: opcional(value.observacoes),
        }),
      ),
  });

  return (
    <PainelLateral titulo={item ? item.sufixo : 'Novo sufixo'} onFechar={onFechar}>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
        className="flex flex-col gap-4 p-4"
      >
        <p className="text-muted-foreground">
          Cortado do fim do nome do cliente antes de achar o cadastro (ex.: “CLINICA-CT” vira
          “CLINICA”).
        </p>
        {erro && <Alerta tom="erro">{erro}</Alerta>}
        <Fieldset.Root disabled={!podeEditar} className="flex flex-col gap-4">
          <form.AppField name="sufixo">
            {(field) => (
              <field.TextField
                label="Sufixo"
                placeholder="Ex.: _PLANTÃO"
                autoComplete="off"
                required
              />
            )}
          </form.AppField>
          <form.AppField name="observacoes">
            {(field) => (
              <field.TextAreaField label="Observações" placeholder="Ex.: unidades de plantão" />
            )}
          </form.AppField>
          <form.AppField name="ativo">
            {(field) => <field.CheckboxField label="Ativo" description={ativoAjuda} />}
          </form.AppField>
        </Fieldset.Root>
        {podeEditar && (
          <form.AppForm>
            <RodapePainel
              rotuloCriar="Criar sufixo"
              editando={Boolean(item)}
              excluir={
                item && onExcluir
                  ? {
                      acao: 'Excluir sufixo',
                      titulo: `Excluir o sufixo “${item.sufixo}”?`,
                      consequencia:
                        'A importação deixa de cortar esse sufixo a partir da próxima vez. Para só pausar, desative.',
                      onConfirmar: () =>
                        tentar(onExcluir, 'Não foi possível excluir agora. Tente de novo.'),
                    }
                  : undefined
              }
              onCancelar={onFechar}
            />
          </form.AppForm>
        )}
      </form>
    </PainelLateral>
  );
}
