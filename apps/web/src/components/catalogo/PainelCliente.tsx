import { Button } from '@base-ui/react/button';
import { Trash } from '@phosphor-icons/react';
import { useId, useState } from 'react';
import { z } from 'zod';

import type { AliasDto } from '../../gen/types/AliasDto';
import type { ClienteDetalheDto } from '../../gen/types/ClienteDetalheDto';
import type { ClienteDto } from '../../gen/types/ClienteDto';
import { formatarCnpj, formatarCpf, soDigitos } from '../../lib/documentos';
import { Alerta } from '../alerta/Alerta';
import { mensagemDaApi } from '../alerta/mensagem-da-api';
import { buttonClassName } from '../button/button-class';
import { CampoSomenteLeitura } from '../form/CampoSomenteLeitura';
import { useAppForm } from '../form/form';
import { Paginacao } from '../paginacao/Paginacao';
import { usePaginaLocal } from '../paginacao/use-pagina-local';
import { PainelLateral } from '../painel/PainelLateral';
import { RodapePainel } from './rodape-painel';
import { UnidadesCliente, type UnidadesClienteProps } from './UnidadesCliente';
import { useErroDoPainel } from './use-erro-do-painel';

export type PainelClienteProps = {
  /** Sem cliente, o painel cria um novo (os apelidos aparecem depois de criado). */
  cliente?: ClienteDetalheDto;
  /** Contratados ativos (empresa que fatura). */
  contratados: { id: string; nome: string }[];
  podeEditar: boolean;
  onSalvar: (dados: ClienteDto) => Promise<void>;
  onExcluir?: () => Promise<void>;
  onCriarApelido: (dados: AliasDto) => Promise<void>;
  onExcluirApelido: (id: string) => Promise<void>;
  /** Unificação (unidades que respondem por um principal); sem ela, a seção não aparece. */
  unificacao?: Omit<UnidadesClienteProps, 'unificadoEm' | 'unidades' | 'podeEditar'>;
  onFechar: () => void;
};

const TIPOS_APELIDO = {
  exato: {
    rotulo: 'Igual a',
    ajuda: 'O nome inteiro que chega é igual ao apelido (sem diferenciar maiúsculas).',
  },
  prefixo: {
    rotulo: 'Começa com',
    ajuda: 'O nome que chega começa com o apelido; o mais longo vence.',
  },
  normalizado: {
    rotulo: 'Igual sem acento e pontuação',
    ajuda: 'Compara ignorando acento, maiúsculas e separadores (CEDI-RJ = cedi rj).',
  },
} as const;

const tamanho = (n: number, mensagem: string) =>
  z.string().refine((v) => v.trim() === '' || soDigitos(v).length === n, mensagem);

const schema = z.object({
  nome: z.string().trim().min(1, 'Informe o nome como aparece na MobileMed.'),
  nomeFantasia: z.string(),
  razaoSocial: z.string(),
  tipoPessoa: z.enum(['PJ', 'PF']),
  cnpj: tamanho(14, 'O CNPJ tem 14 dígitos.'),
  cpf: tamanho(11, 'O CPF tem 11 dígitos.'),
  contratadoId: z.string().min(1, 'Escolha a empresa que fatura.'),
  ativo: z.boolean(),
  ocultoDashboards: z.boolean(),
  observacoes: z.string(),
});

const opcional = (texto: string) => texto.trim() || null;

/** Cadastro básico do cliente (o que é do catálogo) e os apelidos, no painel ao lado da lista. */
export function PainelCliente({
  cliente,
  contratados,
  podeEditar,
  onSalvar,
  onExcluir,
  onCriarApelido,
  onExcluirApelido,
  unificacao,
  onFechar,
}: PainelClienteProps) {
  const { erro, tentar } = useErroDoPainel();
  const form = useAppForm({
    defaultValues: {
      nome: cliente?.nome ?? '',
      nomeFantasia: cliente?.nomeFantasia ?? '',
      razaoSocial: cliente?.razaoSocial ?? '',
      tipoPessoa: (cliente?.tipoPessoa ?? 'PJ') as 'PJ' | 'PF',
      cnpj: cliente?.cnpj ? formatarCnpj(cliente.cnpj) : '',
      cpf: cliente?.cpf ? formatarCpf(cliente.cpf) : '',
      contratadoId: cliente?.contratado?.id ?? '',
      ativo: cliente?.ativo ?? true,
      ocultoDashboards: cliente?.ocultoDashboards ?? false,
      observacoes: cliente?.observacoes ?? '',
    },
    validators: { onSubmit: schema },
    onSubmit: ({ value }) => {
      const pf = value.tipoPessoa === 'PF';
      return tentar(() =>
        onSalvar({
          nome: value.nome.trim(),
          nomeFantasia: opcional(value.nomeFantasia),
          razaoSocial: opcional(value.razaoSocial),
          tipoPessoa: value.tipoPessoa,
          cnpj: !pf && value.cnpj.trim() ? soDigitos(value.cnpj) : null,
          cpf: pf && value.cpf.trim() ? soDigitos(value.cpf) : null,
          contratadoId: value.contratadoId,
          ativo: value.ativo,
          ocultoDashboards: value.ocultoDashboards,
          observacoes: opcional(value.observacoes),
        }),
      );
    },
  });

  // Contratado inativo que o cliente já usa continua na lista, para não sumir da tela.
  const opcoesContratado = [
    ...contratados,
    ...(cliente?.contratado && !contratados.some((c) => c.id === cliente.contratado?.id)
      ? [{ id: cliente.contratado.id, nome: cliente.contratado.razaoSocial }]
      : []),
  ];

  return (
    <PainelLateral
      titulo={cliente?.nome ?? 'Novo cliente'}
      subtitulo={cliente?.nomeFantasia ?? undefined}
      onFechar={onFechar}
    >
      {podeEditar ? (
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
              <field.TextField
                label="Nome na MobileMed"
                placeholder="Ex.: CEDIDIAG"
                description="Exatamente como chega nos laudos; outras grafias vão nos apelidos."
                autoComplete="off"
                required
              />
            )}
          </form.AppField>
          <form.AppField name="nomeFantasia">
            {(field) => (
              <field.TextField
                label="Nome fantasia"
                placeholder="Ex.: Cedi Diagnósticos"
                autoComplete="off"
              />
            )}
          </form.AppField>
          <form.AppField name="razaoSocial">
            {(field) => (
              <field.TextField
                label="Razão social"
                placeholder="Ex.: Centro de Diagnóstico Ltda"
                autoComplete="off"
              />
            )}
          </form.AppField>
          <form.Subscribe selector={(estado) => estado.values.tipoPessoa}>
            {(tipo) => (
              <div className="flex flex-wrap gap-4">
                <form.AppField name="tipoPessoa">
                  {(field) => (
                    <field.SelectField
                      label="Tipo de pessoa"
                      placeholder="Escolha"
                      opcoes={[
                        { valor: 'PJ', rotulo: 'Pessoa jurídica' },
                        { valor: 'PF', rotulo: 'Pessoa física' },
                      ]}
                      className="flex-[1_1_150px]"
                    />
                  )}
                </form.AppField>
                {tipo === 'PJ' ? (
                  <form.AppField name="cnpj">
                    {(field) => (
                      <field.TextField
                        label="CNPJ"
                        mascara="cnpj"
                        placeholder="00.000.000/0000-00"
                        autoComplete="off"
                        className="flex-[1_1_180px]"
                      />
                    )}
                  </form.AppField>
                ) : (
                  <form.AppField name="cpf">
                    {(field) => (
                      <field.TextField
                        label="CPF"
                        mascara="cpf"
                        placeholder="000.000.000-00"
                        autoComplete="off"
                        className="flex-[1_1_180px]"
                      />
                    )}
                  </form.AppField>
                )}
              </div>
            )}
          </form.Subscribe>
          <form.AppField name="contratadoId">
            {(field) => (
              <field.SelectField
                label="Empresa que fatura"
                placeholder="Escolha o contratado"
                required
                description="Decide em qual demonstrativo o cliente entra e quem emite a nota."
                opcoes={opcoesContratado.map((c) => ({ valor: c.id, rotulo: c.nome }))}
              />
            )}
          </form.AppField>
          <form.AppField name="ocultoDashboards">
            {(field) => (
              <field.CheckboxField
                label="Oculto nos painéis"
                description="Some da volumetria e do painel executivo; continua no faturamento."
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
              <field.TextAreaField label="Observações" placeholder="Ex.: unidade aberta em 2026" />
            )}
          </form.AppField>
          <form.AppForm>
            <RodapePainel
              rotuloCriar="Criar cliente"
              editando={Boolean(cliente)}
              excluir={
                cliente && onExcluir
                  ? {
                      acao: 'Excluir cliente',
                      titulo: `Excluir ${cliente.nome}?`,
                      consequencia:
                        'O cliente e os apelidos saem do cadastro. Se algum outro cadastro usa o cliente, a exclusão é recusada: desative em vez de excluir.',
                      onConfirmar: () =>
                        tentar(onExcluir, 'Não foi possível excluir agora. Tente de novo.'),
                    }
                  : undefined
              }
              onCancelar={onFechar}
            />
          </form.AppForm>
        </form>
      ) : (
        cliente && (
          <div className="flex flex-col gap-4 p-4">
            <CampoSomenteLeitura label="Razão social" value={cliente.razaoSocial ?? '—'} />
            <CampoSomenteLeitura
              label={cliente.tipoPessoa === 'PF' ? 'CPF' : 'CNPJ'}
              value={
                cliente.tipoPessoa === 'PF' ? formatarCpf(cliente.cpf) : formatarCnpj(cliente.cnpj)
              }
            />
            <CampoSomenteLeitura
              label="Empresa que fatura"
              value={cliente.contratado?.razaoSocial ?? '—'}
            />
            <CampoSomenteLeitura label="Situação" value={cliente.ativo ? 'Ativo' : 'Inativo'} />
          </div>
        )
      )}
      {cliente && (
        <Apelidos
          apelidos={cliente.aliases}
          podeEditar={podeEditar}
          onCriar={onCriarApelido}
          onExcluir={onExcluirApelido}
        />
      )}
      {cliente && unificacao && (
        <UnidadesCliente
          unificadoEm={cliente.unificadoEm}
          unidades={cliente.unidades}
          podeEditar={podeEditar}
          {...unificacao}
        />
      )}
    </PainelLateral>
  );
}

const POR_PAGINA_APELIDOS = 5;

function Apelidos({
  apelidos,
  podeEditar,
  onCriar,
  onExcluir,
}: {
  apelidos: ClienteDetalheDto['aliases'];
  podeEditar: boolean;
  onCriar: (dados: AliasDto) => Promise<void>;
  onExcluir: (id: string) => Promise<void>;
}) {
  const tituloId = useId();
  const [erro, setErro] = useState<string>();
  const pagina = usePaginaLocal(apelidos, POR_PAGINA_APELIDOS);
  const form = useAppForm({
    defaultValues: { tipo: 'exato' as AliasDto['tipo'], padrao: '' },
    validators: {
      onSubmit: z.object({
        tipo: z.enum(['exato', 'prefixo', 'normalizado']),
        padrao: z.string().trim().min(1, 'Informe a grafia que chega da MobileMed.'),
      }),
    },
    onSubmit: async ({ value, formApi }) => {
      setErro(undefined);
      try {
        await onCriar({ tipo: value.tipo, padrao: value.padrao.trim(), observacoes: null });
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
          Outras grafias com que o cliente chega da MobileMed (ex.: unidades e plantões).
        </p>
      </div>
      {erro && <Alerta tom="erro">{erro}</Alerta>}
      {apelidos.length === 0 ? (
        <p className="text-muted-foreground">
          Nenhum apelido: só o nome na MobileMed é reconhecido.
        </p>
      ) : (
        <ul className="flex flex-col divide-y rounded-md border">
          {pagina.itensDaPagina.map((apelido) => (
            <li key={apelido.id} className="flex items-center gap-3 px-3 py-2">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{apelido.padrao}</span>
                <span className="text-muted-foreground text-[13px]">
                  {TIPOS_APELIDO[apelido.tipo].rotulo}
                </span>
              </span>
              {podeEditar && (
                <Button
                  type="button"
                  aria-label={`Remover apelido ${apelido.padrao}`}
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
      {podeEditar && (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
          className="flex flex-col gap-3"
        >
          <form.Subscribe selector={(estado) => estado.values.tipo}>
            {(tipo) => (
              <form.AppField name="tipo">
                {(field) => (
                  <field.SelectField
                    label="Tipo do apelido"
                    placeholder="Escolha o tipo"
                    description={TIPOS_APELIDO[tipo].ajuda}
                    opcoes={Object.entries(TIPOS_APELIDO).map(([valor, t]) => ({
                      valor,
                      rotulo: t.rotulo,
                    }))}
                  />
                )}
              </form.AppField>
            )}
          </form.Subscribe>
          <form.AppField name="padrao">
            {(field) => (
              <field.TextField
                label="Grafia na origem"
                placeholder="Ex.: PRN TELE_"
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
