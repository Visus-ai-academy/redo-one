import { Button } from '@base-ui/react/button';
import { Trash } from '@phosphor-icons/react';
import { type ReactNode, useEffect, useId, useState } from 'react';
import { z } from 'zod';

import type { AliasMedicoDto } from '../../gen/types/AliasMedicoDto';
import type { MedicoDetalheDto } from '../../gen/types/MedicoDetalheDto';
import type { MedicoDto } from '../../gen/types/MedicoDto';
import type { OutraContaMedicoDto } from '../../gen/types/OutraContaMedicoDto';
import { Abas } from '../abas/Abas';
import { Alerta } from '../alerta/Alerta';
import { mensagemDaApi } from '../alerta/mensagem-da-api';
import { buttonClassName } from '../button/button-class';
import { RodapePainel, RodapeSomenteLeitura } from '../catalogo/rodape-painel';
import { useErroDoPainel } from '../catalogo/use-erro-do-painel';
import { CampoSomenteLeitura } from '../form/CampoSomenteLeitura';
import { useAppForm } from '../form/form';
import { Paginacao } from '../paginacao/Paginacao';
import { usePaginaLocal } from '../paginacao/use-pagina-local';
import { useAlterado } from '../painel/fechamento';
import { PainelLateral } from '../painel/PainelLateral';

export type PainelMedicoProps = {
  /** Sem médico, o painel cria um novo (apelidos e as outras abas aparecem depois de criado). */
  medico?: MedicoDetalheDto;
  /** Níveis ativos. */
  niveis: { id: string; nome: string }[];
  /** Salvar o formulário: editar (médico aberto) ou criar (novo). */
  podeEditar: boolean;
  /** Apelidos: adicionar (POST) e remover (DELETE). */
  podeCriar: boolean;
  podeExcluir: boolean;
  onSalvar: (dados: MedicoDto) => Promise<void>;
  onExcluir?: () => Promise<void>;
  onCriarApelido: (dados: AliasMedicoDto) => Promise<void>;
  onExcluirApelido: (id: string) => Promise<void>;
  /** Outras contas na MobileMed: adicionar e remover (só com `podeEditar`). */
  onAdicionarOutraConta: (dados: OutraContaMedicoDto) => Promise<void>;
  onRemoverOutraConta: (id: string) => Promise<void>;
  onFechar: () => void;
  /** Conteúdo da aba Pagamento; sem ele (sem permissão), a aba não aparece. */
  pagamento?: ReactNode;
  /** Conteúdo da aba Acesso; sem ele (sem permissão), a aba não aparece. */
  acesso?: ReactNode;
  /** Conteúdo da aba Escala (só leitura); sem ele (sem permissão), a aba não aparece. */
  escala?: ReactNode;
  /** Conteúdo da aba Distribuição (robô e arranjos); sem ele (sem permissão), a aba não aparece. */
  distribuicao?: ReactNode;
  /** Conteúdo da aba Histórico (a última); sem ele, a aba não aparece. */
  historico?: ReactNode;
};

const FUNCOES = {
  STAFF: 'Staff',
  FELLOW: 'Fellow (em formação)',
} as const;

const schema = z.object({
  nome: z.string().trim().min(1, 'Informe o nome do médico.'),
  crm: z.string(),
  idMobilemed: z
    .string()
    .refine(
      (v) => v.trim() === '' || /^[1-9]\d{0,9}$/.test(v.trim()),
      'Informe um número inteiro positivo.',
    ),
  email: z
    .string()
    .refine(
      (v) => v.trim() === '' || z.email().safeParse(v.trim()).success,
      'Informe um e-mail válido, como nome@clinica.com.br.',
    ),
  telefone: z.string(),
  nivelId: z.string(),
  funcao: z.string(),
  dataInicioVinculo: z.string(),
  senior: z.boolean(),
  fellowship: z.boolean(),
  ocultoDashboards: z.boolean(),
  ativo: z.boolean(),
  observacoes: z.string(),
});

const opcional = (texto: string) => texto.trim() || null;
/** "2024-03-01" → "01/03/2024" (data sem hora: não passa por fuso). */
const formatarData = (data: string) => data.split('-').reverse().join('/');

/** Cadastro do médico e apelidos; pagamento e acesso em abas próprias, no painel ao lado da lista. */
export function PainelMedico({
  medico,
  niveis,
  podeEditar,
  podeCriar,
  podeExcluir,
  onSalvar,
  onExcluir,
  onCriarApelido,
  onExcluirApelido,
  onAdicionarOutraConta,
  onRemoverOutraConta,
  onFechar,
  pagamento,
  acesso,
  escala,
  distribuicao,
  historico,
}: PainelMedicoProps) {
  const [aba, setAba] = useState('cadastro');
  const [alterado, setAlterado] = useState(false);
  const abas = medico
    ? [
        { valor: 'cadastro', rotulo: 'Cadastro' },
        ...(pagamento ? [{ valor: 'pagamento', rotulo: 'Pagamento' }] : []),
        ...(acesso ? [{ valor: 'acesso', rotulo: 'Acesso' }] : []),
        ...(escala ? [{ valor: 'escala', rotulo: 'Escala' }] : []),
        ...(distribuicao ? [{ valor: 'distribuicao', rotulo: 'Distribuição' }] : []),
        ...(historico ? [{ valor: 'historico', rotulo: 'Histórico' }] : []),
      ]
    : [];

  const cadastro = (
    <>
      {podeEditar ? (
        <FormCadastro
          medico={medico}
          niveis={niveis}
          onSalvar={onSalvar}
          onExcluir={onExcluir}
          onFechar={onFechar}
          onAlterado={setAlterado}
        />
      ) : (
        medico && <CadastroSomenteLeitura medico={medico} onExcluir={onExcluir} />
      )}
      {medico && (
        <OutrasContas
          contas={medico.outrasContas}
          podeEditar={podeEditar}
          onAdicionar={onAdicionarOutraConta}
          onRemover={onRemoverOutraConta}
        />
      )}
      {medico && (
        <Apelidos
          apelidos={medico.aliases}
          podeCriar={podeCriar}
          podeExcluir={podeExcluir}
          onCriar={onCriarApelido}
          onExcluir={onExcluirApelido}
        />
      )}
    </>
  );

  return (
    <PainelLateral
      titulo={medico?.nome ?? 'Novo médico'}
      subtitulo={medico?.crm ? `CRM ${medico.crm}` : undefined}
      onFechar={onFechar}
      alterado={alterado}
    >
      {abas.length > 1 ? (
        <Abas
          aria-label="Partes do cadastro do médico"
          valor={aba}
          onMudar={setAba}
          abas={abas}
          className="gap-0 pt-2"
        >
          {/* O cadastro fica montado (escondido) nas outras abas: voltar a ele não perde o digitado. */}
          <div hidden={aba !== 'cadastro'}>{cadastro}</div>
          {aba === 'pagamento'
            ? pagamento
            : aba === 'acesso'
              ? acesso
              : aba === 'escala'
                ? escala
                : aba === 'distribuicao'
                  ? distribuicao
                  : aba === 'historico'
                    ? historico
                    : null}
        </Abas>
      ) : (
        cadastro
      )}
    </PainelLateral>
  );
}

function excluirMedico(
  medico: MedicoDetalheDto | undefined,
  onExcluir: (() => Promise<void>) | undefined,
  tentar: ReturnType<typeof useErroDoPainel>['tentar'],
) {
  return medico && onExcluir
    ? {
        acao: 'Excluir médico',
        titulo: `Excluir ${medico.nome}?`,
        consequencia:
          'O médico, os apelidos e os dados de pagamento saem do cadastro, e a conta do portal (se houver) deixa de estar ligada a ele. Se algum outro cadastro usa o médico, a exclusão é recusada: desative em vez de excluir.',
        onConfirmar: () => tentar(onExcluir, 'Não foi possível excluir agora. Tente de novo.'),
      }
    : undefined;
}

function FormCadastro({
  medico,
  niveis,
  onSalvar,
  onExcluir,
  onFechar,
  onAlterado,
}: Pick<PainelMedicoProps, 'medico' | 'niveis' | 'onSalvar' | 'onExcluir' | 'onFechar'> & {
  onAlterado: (alterado: boolean) => void;
}) {
  const { erro, tentar } = useErroDoPainel();
  const iniciais = {
    nome: medico?.nome ?? '',
    crm: medico?.crm ?? '',
    idMobilemed: medico?.idMobilemed != null ? String(medico.idMobilemed) : '',
    email: medico?.email ?? '',
    telefone: medico?.telefone ?? '',
    nivelId: medico?.nivel?.id ?? '',
    funcao: medico?.funcao ?? '',
    dataInicioVinculo: medico?.dataInicioVinculo ?? '',
    senior: medico?.senior ?? false,
    fellowship: medico?.fellowship ?? false,
    ocultoDashboards: medico?.ocultoDashboards ?? false,
    ativo: medico?.ativo ?? true,
    observacoes: medico?.observacoes ?? '',
  };
  const form = useAppForm({
    defaultValues: iniciais,
    validators: { onSubmit: schema },
    onSubmit: ({ value }) =>
      tentar(() =>
        onSalvar({
          nome: value.nome.trim(),
          crm: opcional(value.crm),
          idMobilemed: value.idMobilemed.trim() ? Number(value.idMobilemed) : null,
          email: opcional(value.email),
          telefone: opcional(value.telefone),
          ativo: value.ativo,
          ocultoDashboards: value.ocultoDashboards,
          senior: value.senior,
          fellowship: value.fellowship,
          funcao: (value.funcao || null) as MedicoDto['funcao'],
          nivelId: value.nivelId || null,
          dataInicioVinculo: value.dataInicioVinculo || null,
          observacoes: opcional(value.observacoes),
        }),
      ),
  });
  const alterado = useAlterado(form, iniciais);
  useEffect(() => onAlterado(alterado), [alterado, onAlterado]);

  // Nível inativo que o médico já tem continua na lista, para não sumir da tela.
  const opcoesNivel = [
    ...niveis,
    ...(medico?.nivel && !niveis.some((n) => n.id === medico.nivel?.id) ? [medico.nivel] : []),
  ];

  return (
    <form
      method="post"
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
          <field.TextField
            label="Nome"
            placeholder="Ex.: Dr. Augusto Lima"
            description="Nome de exibição; outras grafias que chegam da MobileMed vão nos apelidos."
            autoComplete="off"
            required
          />
        )}
      </form.AppField>
      <div className="flex flex-wrap gap-4">
        <form.AppField name="crm">
          {(field) => (
            <field.TextField
              label="CRM"
              placeholder="Ex.: 123456-SP"
              autoComplete="off"
              className="flex-[1_1_160px]"
            />
          )}
        </form.AppField>
        <form.AppField name="idMobilemed">
          {(field) => (
            <field.NumberField
              label="ID na MobileMed"
              placeholder="Ex.: 1234"
              min={1}
              description="A conta principal: o robô entrega os exames nela."
              className="flex-[1_1_160px]"
            />
          )}
        </form.AppField>
      </div>
      <div className="flex flex-wrap gap-4">
        <form.AppField name="email">
          {(field) => (
            <field.TextField
              label="E-mail"
              type="email"
              placeholder="nome@clinica.com.br"
              autoComplete="off"
              description="Sem e-mail, o médico não recebe o demonstrativo."
              className="flex-[1_1_200px]"
            />
          )}
        </form.AppField>
        <form.AppField name="telefone">
          {(field) => (
            <field.TextField
              label="Telefone"
              mascara="telefone"
              type="tel"
              placeholder="(11) 98888-7777"
              autoComplete="off"
              className="flex-[1_1_160px]"
            />
          )}
        </form.AppField>
      </div>
      <div className="flex flex-wrap gap-4">
        <form.AppField name="nivelId">
          {(field) => (
            <field.SelectField
              label="Nível"
              placeholder="Sem nível"
              description="Usado na tabela de referência do repasse."
              opcoes={[
                { valor: '', rotulo: 'Sem nível' },
                ...opcoesNivel.map((n) => ({ valor: n.id, rotulo: n.nome })),
              ]}
              className="flex-[1_1_160px]"
            />
          )}
        </form.AppField>
        <form.AppField name="funcao">
          {(field) => (
            <field.SelectField
              label="Função"
              placeholder="Não informada"
              opcoes={[
                { valor: '', rotulo: 'Não informada' },
                ...Object.entries(FUNCOES).map(([valor, rotulo]) => ({ valor, rotulo })),
              ]}
              className="flex-[1_1_160px]"
            />
          )}
        </form.AppField>
      </div>
      <form.AppField name="dataInicioVinculo">
        {(field) => (
          <field.TextField
            label="Início do vínculo"
            type="date"
            placeholder="AAAA-MM-DD"
            description="Quando começou a prestar serviço."
          />
        )}
      </form.AppField>
      <form.AppField name="senior">
        {(field) => (
          <field.CheckboxField
            label="Sênior"
            description="Independe da função: um staff pode ou não ser sênior."
          />
        )}
      </form.AppField>
      <form.AppField name="fellowship">
        {(field) => (
          <field.CheckboxField
            label="Fez fellowship"
            description="Formação concluída; entra na classificação da qualidade."
          />
        )}
      </form.AppField>
      <form.AppField name="ocultoDashboards">
        {(field) => (
          <field.CheckboxField
            label="Oculto nos painéis"
            description="Some da volumetria e do painel executivo."
          />
        )}
      </form.AppField>
      <form.AppField name="ativo">
        {(field) => (
          <field.CheckboxField
            label="Ativo"
            description="Inativo some das listas de escolha; o histórico continua."
          />
        )}
      </form.AppField>
      <form.AppField name="observacoes">
        {(field) => (
          <field.TextAreaField label="Observações" placeholder="Ex.: lauda só às terças" />
        )}
      </form.AppField>
      {medico && (
        <CampoSomenteLeitura
          label="Equipes"
          value={medico.equipes.map((e) => e.nome).join(', ') || 'Nenhuma'}
          description="As equipes ficam em Configurações › Equipes médicas."
        />
      )}
      <form.AppForm>
        <RodapePainel
          rotuloCriar="Criar médico"
          editando={Boolean(medico)}
          excluir={excluirMedico(medico, onExcluir, tentar)}
          onCancelar={onFechar}
        />
      </form.AppForm>
    </form>
  );
}

function CadastroSomenteLeitura({
  medico,
  onExcluir,
}: {
  medico: MedicoDetalheDto;
  onExcluir?: () => Promise<void>;
}) {
  const { erro, tentar } = useErroDoPainel();
  return (
    <div className="flex flex-col gap-4 p-4">
      {erro && <Alerta tom="erro">{erro}</Alerta>}
      <CampoSomenteLeitura label="CRM" value={medico.crm ?? '—'} />
      <CampoSomenteLeitura
        label="ID na MobileMed"
        value={medico.idMobilemed != null ? String(medico.idMobilemed) : '—'}
      />
      <CampoSomenteLeitura label="E-mail" value={medico.email ?? '—'} />
      <CampoSomenteLeitura label="Nível" value={medico.nivel?.nome ?? '—'} />
      <CampoSomenteLeitura label="Função" value={medico.funcao ? FUNCOES[medico.funcao] : '—'} />
      <CampoSomenteLeitura
        label="Início do vínculo"
        value={medico.dataInicioVinculo ? formatarData(medico.dataInicioVinculo) : '—'}
      />
      <CampoSomenteLeitura
        label="Equipes"
        value={medico.equipes.map((e) => e.nome).join(', ') || 'Nenhuma'}
      />
      <CampoSomenteLeitura label="Situação" value={medico.ativo ? 'Ativo' : 'Inativo'} />
      <RodapeSomenteLeitura excluir={excluirMedico(medico, onExcluir, tentar)} />
    </div>
  );
}

const POR_PAGINA_APELIDOS = 5;

function Apelidos({
  apelidos,
  podeCriar,
  podeExcluir,
  onCriar,
  onExcluir,
}: {
  apelidos: MedicoDetalheDto['aliases'];
  podeCriar: boolean;
  podeExcluir: boolean;
  onCriar: (dados: AliasMedicoDto) => Promise<void>;
  onExcluir: (id: string) => Promise<void>;
}) {
  const tituloId = useId();
  const [erro, setErro] = useState<string>();
  const pagina = usePaginaLocal(apelidos, POR_PAGINA_APELIDOS);
  const form = useAppForm({
    defaultValues: { nomeOrigem: '' },
    validators: {
      onSubmit: z.object({
        nomeOrigem: z.string().trim().min(1, 'Informe a grafia que chega da MobileMed.'),
      }),
    },
    onSubmit: async ({ value, formApi }) => {
      setErro(undefined);
      try {
        await onCriar({ nomeOrigem: value.nomeOrigem.trim(), observacoes: null });
        formApi.reset();
      } catch (falha) {
        setErro(mensagemDaApi(falha, 'Não foi possível adicionar agora. Tente de novo.'));
      }
    },
  });

  return (
    <section aria-labelledby={tituloId} className="flex flex-col gap-3 border-t p-4">
      <div className="flex flex-col gap-1">
        <h3 id={tituloId} className="text-base font-semibold">
          Apelidos
        </h3>
        <p className="text-muted-foreground text-[13px]">
          Outras grafias do nome que chegam da MobileMed. A comparação ignora acento, maiúsculas,
          “Dr.”/“Dra.” e o que vem entre parênteses.
        </p>
      </div>
      {erro && <Alerta tom="erro">{erro}</Alerta>}
      {apelidos.length === 0 ? (
        <p className="text-muted-foreground">
          Nenhum apelido: só o nome do cadastro é reconhecido.
        </p>
      ) : (
        <ul className="flex flex-col divide-y rounded-md border">
          {pagina.itensDaPagina.map((apelido) => (
            <li key={apelido.id} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1 truncate font-medium">{apelido.nomeOrigem}</span>
              {podeExcluir && (
                <Button
                  type="button"
                  aria-label={`Remover apelido ${apelido.nomeOrigem}`}
                  onClick={async () => {
                    setErro(undefined);
                    try {
                      await onExcluir(apelido.id);
                    } catch (falha) {
                      setErro(
                        mensagemDaApi(falha, 'Não foi possível remover agora. Tente de novo.'),
                      );
                    }
                  }}
                  className={buttonClassName({
                    variant: 'ghost',
                    className: 'text-muted-foreground size-9 flex-none px-0',
                  })}
                >
                  <Trash size={16} aria-hidden />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {pagina.precisaPaginar && (
        <div className="-mx-4 -mb-4">
          <Paginacao
            pagina={pagina.pagina}
            porPagina={pagina.porPagina}
            total={pagina.total}
            onIrPara={pagina.irPara}
          />
        </div>
      )}
      {podeCriar && (
        <form
          method="post"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
          className="flex flex-col gap-3"
        >
          <form.AppField name="nomeOrigem">
            {(field) => (
              <field.TextField
                label="Grafia na origem"
                placeholder="Ex.: Dr. A. Lima (E2)"
                autoComplete="off"
              />
            )}
          </form.AppField>
          <form.AppForm>
            <form.SubmitButton
              pendingLabel="Adicionando…"
              variant="secondary"
              className="self-start"
            >
              Adicionar apelido
            </form.SubmitButton>
          </form.AppForm>
        </form>
      )}
    </section>
  );
}

const POR_PAGINA_CONTAS = 5;
const ERRO_ID_CONTA = 'Informe o ID da conta na MobileMed, um número inteiro positivo.';

/**
 * Outras contas do médico na MobileMed (o login do dia): a importação e a carga do robô o
 * reconhecem por elas; os exames continuam indo para a conta principal.
 */
function OutrasContas({
  contas,
  podeEditar,
  onAdicionar,
  onRemover,
}: {
  contas: MedicoDetalheDto['outrasContas'];
  podeEditar: boolean;
  onAdicionar: (dados: OutraContaMedicoDto) => Promise<void>;
  onRemover: (id: string) => Promise<void>;
}) {
  const tituloId = useId();
  const [erro, setErro] = useState<string>();
  const pagina = usePaginaLocal(contas, POR_PAGINA_CONTAS);
  const form = useAppForm({
    defaultValues: { idMobilemed: '', observacao: '' },
    validators: {
      onSubmit: z.object({
        idMobilemed: z
          .string()
          .refine(
            (v) => /^[1-9]\d{0,9}$/.test(v.trim()) && Number(v) <= 2_147_483_647,
            ERRO_ID_CONTA,
          ),
        observacao: z.string(),
      }),
    },
    onSubmit: async ({ value, formApi }) => {
      setErro(undefined);
      try {
        await onAdicionar({
          idMobilemed: Number(value.idMobilemed.trim()),
          observacao: opcional(value.observacao),
        });
        formApi.reset();
      } catch (falha) {
        setErro(mensagemDaApi(falha, 'Não foi possível adicionar agora. Tente de novo.'));
      }
    },
  });

  return (
    <section aria-labelledby={tituloId} className="flex flex-col gap-3 border-t p-4">
      <div className="flex flex-col gap-1">
        <h3 id={tituloId} className="text-base font-semibold">
          Outras contas na MobileMed
        </h3>
        <p className="text-muted-foreground text-[13px]">
          Contas além da principal, pelas quais o médico também entra. A importação e a carga do
          robô reconhecem o médico por elas; os exames continuam indo para a principal.
        </p>
      </div>
      {erro && <Alerta tom="erro">{erro}</Alerta>}
      {contas.length === 0 ? (
        <p className="text-muted-foreground">Nenhuma: só a conta principal é reconhecida.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-md border">
          {pagina.itensDaPagina.map((conta) => (
            <li key={conta.id} className="flex items-center gap-3 px-3 py-2">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium tabular-nums">{conta.idMobilemed}</span>
                {conta.observacao && (
                  <span
                    title={conta.observacao}
                    className="text-muted-foreground truncate text-[13px]"
                  >
                    {conta.observacao}
                  </span>
                )}
              </div>
              {podeEditar && (
                <Button
                  type="button"
                  aria-label={`Remover conta ${conta.idMobilemed}`}
                  onClick={async () => {
                    setErro(undefined);
                    try {
                      await onRemover(conta.id);
                    } catch (falha) {
                      setErro(
                        mensagemDaApi(falha, 'Não foi possível remover agora. Tente de novo.'),
                      );
                    }
                  }}
                  className={buttonClassName({
                    variant: 'ghost',
                    className: 'text-muted-foreground size-9 flex-none px-0',
                  })}
                >
                  <Trash size={16} aria-hidden />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {pagina.precisaPaginar && (
        <div className="-mx-4 -mb-4">
          <Paginacao
            pagina={pagina.pagina}
            porPagina={pagina.porPagina}
            total={pagina.total}
            onIrPara={pagina.irPara}
          />
        </div>
      )}
      {podeEditar && (
        <form
          method="post"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
          className="flex flex-col gap-3"
        >
          <div className="flex flex-wrap gap-4">
            <form.AppField name="idMobilemed">
              {(field) => (
                <field.NumberField
                  label="ID da conta"
                  placeholder="Ex.: 19053"
                  min={1}
                  required
                  className="flex-[1_1_140px]"
                />
              )}
            </form.AppField>
            <form.AppField name="observacao">
              {(field) => (
                <field.TextField
                  label="Observação"
                  placeholder="Ex.: login do plantão"
                  autoComplete="off"
                  className="flex-[2_1_200px]"
                />
              )}
            </form.AppField>
          </div>
          <form.AppForm>
            <div className="flex flex-wrap items-center gap-3">
              <form.SubmitButton pendingLabel="Adicionando…" variant="secondary">
                Adicionar conta
              </form.SubmitButton>
              <form.RequiredLegend />
            </div>
          </form.AppForm>
        </form>
      )}
    </section>
  );
}
