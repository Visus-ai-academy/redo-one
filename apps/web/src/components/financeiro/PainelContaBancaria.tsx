import { CheckCircle, WarningCircle } from '@phosphor-icons/react';
import { useStore } from '@tanstack/react-form';
import { useState } from 'react';
import { z } from 'zod';

import type { ContaBancariaDetalheDto } from '../../gen/types/ContaBancariaDetalheDto';
import type { ContaBancariaDto } from '../../gen/types/ContaBancariaDto';
import type { EmpresaFinanceiroDto } from '../../gen/types/EmpresaFinanceiroDto';
import { contaPorExtenso, formatarDia } from '../../lib/financeiro';
import { moeda } from '../../lib/formato';
import { centavosDoTexto, textoDeCentavos } from '../../lib/repasse';
import { Alerta } from '../alerta/Alerta';
import { mensagemDaApi } from '../alerta/mensagem-da-api';
import { RodapePainel, RodapeSomenteLeitura } from '../catalogo/rodape-painel';
import { CampoSomenteLeitura } from '../form/CampoSomenteLeitura';
import { DateField } from '../form/DateField';
import { mostrarErrosDoServidor } from '../form/erros-do-servidor';
import { useAppForm } from '../form/form';
import { useAlterado } from '../painel/fechamento';
import { PainelLateral } from '../painel/PainelLateral';

const TIPOS = [
  { valor: 'corrente', rotulo: 'Conta corrente' },
  { valor: 'aplicacao', rotulo: 'Aplicação' },
  { valor: 'caixa', rotulo: 'Caixa' },
];
const INTEGRACOES = [
  { valor: 'nenhuma', rotulo: 'Nenhuma' },
  { valor: 'itau', rotulo: 'Itaú' },
];
const PREFIXO = /^[A-Z][A-Z0-9_]*$/;
const MSG_CREDENCIAL = 'Informe o prefixo das variáveis da credencial (ex.: ITAU_TELEIMAGEM).';

const schema = z
  .object({
    contratadoId: z.string().min(1, 'Escolha a empresa.'),
    apelido: z
      .string()
      .trim()
      .min(1, 'Informe o apelido da conta.')
      .max(80, 'Use até 80 caracteres.'),
    tipo: z.enum(['corrente', 'aplicacao', 'caixa']),
    bancoCodigo: z
      .string()
      .refine(
        (v) => v.trim() === '' || /^\d{3}$/.test(v.trim()),
        'O código do banco tem 3 dígitos (ex.: 341).',
      ),
    agencia: z.string().max(10, 'Use até 10 caracteres.'),
    conta: z.string().max(20, 'Use até 20 caracteres.'),
    digito: z.string().max(2, 'Use até 2 caracteres.'),
    saldoInicial: z
      .string()
      .refine(
        (v) => centavosDoTexto(v, { negativo: true }) !== null,
        'Informe o saldo inicial, com vírgula nos centavos.',
      ),
    saldoInicialEm: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data do saldo inicial.'),
    integracao: z.enum(['nenhuma', 'itau']),
    credencial: z.string(),
    padraoRecebimento: z.boolean(),
    ativa: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.integracao === 'nenhuma') return;
    const credencial = v.credencial.trim().toUpperCase();
    if (!credencial)
      ctx.addIssue({ code: 'custom', path: ['credencial'], message: MSG_CREDENCIAL });
    else if (!PREFIXO.test(credencial))
      ctx.addIssue({
        code: 'custom',
        path: ['credencial'],
        message: 'Use só letras, números e _, começando por letra (ex.: ITAU_TELEIMAGEM).',
      });
  });

const ROTULO_TIPO: Record<string, string> = Object.fromEntries(
  TIPOS.map((t) => [t.valor, t.rotulo]),
);

type PainelContaBancariaProps = {
  /** Sem conta, o painel cria uma nova. */
  conta?: ContaBancariaDetalheDto;
  /** As empresas que usam o financeiro do One. */
  empresas: EmpresaFinanceiroDto[];
  podeEditar: boolean;
  onSalvar: (dados: ContaBancariaDto) => Promise<void>;
  onExcluir?: () => Promise<void>;
  onFechar: () => void;
};

const opcional = (texto: string) => texto.trim() || null;

/** Conta bancária da empresa: criar, ver e editar, no painel ao lado da lista. */
export function PainelContaBancaria({
  conta,
  empresas,
  podeEditar,
  onSalvar,
  onExcluir,
  onFechar,
}: PainelContaBancariaProps) {
  const [erro, setErro] = useState<string>();
  const iniciais = {
    // Com uma empresa só, ela já vem escolhida.
    contratadoId: conta?.contratadoId ?? (empresas.length === 1 ? (empresas[0]?.id ?? '') : ''),
    apelido: conta?.apelido ?? '',
    tipo: conta?.tipo ?? ('corrente' as const),
    bancoCodigo: conta?.bancoCodigo ?? '',
    agencia: conta?.agencia ?? '',
    conta: conta?.conta ?? '',
    digito: conta?.digito ?? '',
    saldoInicial: conta ? textoDeCentavos(conta.saldoInicialCentavos) : '',
    saldoInicialEm: conta?.saldoInicialEm ?? '',
    integracao: conta?.integracao ?? ('nenhuma' as const),
    credencial: conta?.credencial ?? '',
    padraoRecebimento: conta?.padraoRecebimento ?? false,
    ativa: conta?.ativa ?? true,
  };
  const form = useAppForm({
    defaultValues: iniciais,
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      setErro(undefined);
      try {
        await onSalvar({
          contratadoId: value.contratadoId,
          apelido: value.apelido.trim(),
          tipo: value.tipo,
          bancoCodigo: opcional(value.bancoCodigo),
          agencia: opcional(value.agencia),
          conta: opcional(value.conta),
          digito: opcional(value.digito),
          saldoInicialCentavos: centavosDoTexto(value.saldoInicial, { negativo: true }) ?? 0,
          saldoInicialEm: value.saldoInicialEm,
          integracao: value.integracao,
          credencial:
            value.integracao === 'nenhuma' ? null : value.credencial.trim().toUpperCase() || null,
          padraoRecebimento: value.padraoRecebimento,
          ativa: value.ativa,
        });
      } catch (falha) {
        if (!mostrarErrosDoServidor(form, falha)) {
          setErro(
            mensagemDaApi(
              falha,
              'Não foi possível salvar agora. Confira sua conexão e tente de novo.',
            ),
          );
        }
      }
    },
  });
  const alterado = useAlterado(form, iniciais);
  const integracao = useStore(form.store, (s) => s.values.integracao);
  const credencial = useStore(form.store, (s) => s.values.credencial.trim().toUpperCase());

  const excluir =
    conta && onExcluir
      ? {
          acao: 'Excluir conta',
          titulo: `Excluir ${conta.apelido}?`,
          consequencia:
            'A conta sai do cadastro. Com baixas ou títulos ligados, a exclusão é recusada: desative em vez de excluir.',
          onConfirmar: async () => {
            setErro(undefined);
            try {
              await onExcluir();
            } catch (falha) {
              setErro(mensagemDaApi(falha, 'Não foi possível excluir agora. Tente de novo.'));
            }
          },
        }
      : undefined;

  if (!podeEditar && conta) {
    return (
      <PainelLateral titulo={conta.apelido} subtitulo={conta.empresaNome} onFechar={onFechar}>
        <div className="flex flex-col gap-4 p-4">
          {erro && <Alerta tom="erro">{erro}</Alerta>}
          <CampoSomenteLeitura label="Tipo" value={ROTULO_TIPO[conta.tipo] ?? conta.tipo} />
          <CampoSomenteLeitura label="Banco · agência · conta" value={contaPorExtenso(conta)} />
          <CampoSomenteLeitura
            label="Saldo inicial"
            value={`${moeda(conta.saldoInicialCentavos / 100)} em ${formatarDia(conta.saldoInicialEm)}`}
          />
          <CampoSomenteLeitura
            label="Padrão para recebimento"
            value={conta.padraoRecebimento ? 'Sim' : 'Não'}
          />
          <CampoSomenteLeitura
            label="Integração"
            value={conta.integracao === 'itau' ? `Itaú (${conta.credencial})` : 'Nenhuma'}
          />
          <CampoSomenteLeitura label="Situação" value={conta.ativa ? 'Ativa' : 'Inativa'} />
          <RodapeSomenteLeitura excluir={excluir} />
        </div>
      </PainelLateral>
    );
  }

  const conferida = conta && conta.integracao === integracao && conta.credencial === credencial;
  return (
    <PainelLateral
      titulo={conta?.apelido ?? 'Nova conta bancária'}
      subtitulo={conta?.empresaNome}
      onFechar={onFechar}
      alterado={alterado}
    >
      <form
        method="post"
        noValidate
        onSubmit={(evento) => {
          evento.preventDefault();
          void form.handleSubmit();
        }}
        className="flex flex-col gap-4 p-4"
      >
        {erro && <Alerta tom="erro">{erro}</Alerta>}
        <div className="flex flex-wrap gap-4">
          <form.AppField name="contratadoId">
            {(field) => (
              <field.SelectField
                label="Empresa"
                required
                placeholder="Escolha a empresa"
                opcoes={empresas.map((e) => ({ valor: e.id, rotulo: e.nome }))}
                description={
                  empresas.length === 0
                    ? 'Nenhuma empresa usa o financeiro do One: marque isso no contratado.'
                    : undefined
                }
                className="flex-[1_1_180px]"
              />
            )}
          </form.AppField>
          <form.AppField name="tipo">
            {(field) => (
              <field.SelectField
                label="Tipo"
                required
                placeholder="Escolha o tipo"
                opcoes={TIPOS}
                className="flex-[1_1_160px]"
              />
            )}
          </form.AppField>
        </div>
        <form.AppField name="apelido">
          {(field) => (
            <field.TextField
              label="Apelido"
              required
              placeholder="Ex.: Itaú cobrança"
              autoComplete="off"
            />
          )}
        </form.AppField>
        <div className="flex flex-wrap gap-4">
          <form.AppField name="bancoCodigo">
            {(field) => (
              <field.TextField
                label="Banco"
                placeholder="341"
                inputMode="numeric"
                autoComplete="off"
                className="flex-[1_1_64px]"
              />
            )}
          </form.AppField>
          <form.AppField name="agencia">
            {(field) => (
              <field.TextField
                label="Agência"
                placeholder="0123"
                inputMode="numeric"
                autoComplete="off"
                className="flex-[1_1_80px]"
              />
            )}
          </form.AppField>
          <form.AppField name="conta">
            {(field) => (
              <field.TextField
                label="Conta"
                placeholder="45678"
                inputMode="numeric"
                autoComplete="off"
                className="flex-[2_1_96px]"
              />
            )}
          </form.AppField>
          <form.AppField name="digito">
            {(field) => (
              <field.TextField
                label="Dígito"
                placeholder="9"
                autoComplete="off"
                className="flex-[1_1_48px]"
              />
            )}
          </form.AppField>
        </div>
        <div className="flex flex-wrap gap-4">
          <form.AppField name="saldoInicial">
            {(field) => (
              <field.TextField
                label="Saldo inicial (R$)"
                required
                placeholder="Ex.: 250.000,00"
                inputMode="decimal"
                spellCheck={false}
                description="Vírgula nos centavos. Pode ser negativo."
                className="flex-[1_1_160px]"
              />
            )}
          </form.AppField>
          <form.AppField name="saldoInicialEm">
            {() => (
              <DateField
                label="Saldo em"
                required
                description="O One conta o saldo a partir deste dia."
                className="flex-[1_1_160px]"
              />
            )}
          </form.AppField>
        </div>
        <form.AppField name="padraoRecebimento">
          {(field) => (
            <field.InterruptorField
              label="Padrão para recebimento"
              description="Onde o cliente paga quando a regra não diz outra conta. Marcar esta desmarca a anterior da empresa."
            />
          )}
        </form.AppField>
        <form.AppField name="ativa">
          {(field) => (
            <field.InterruptorField
              label="Ativa"
              description="Inativa some das listas de escolha, mas continua nos lançamentos que já a usam."
            />
          )}
        </form.AppField>

        <fieldset className="mt-2 flex flex-col gap-4">
          <legend className="mb-2 font-semibold">Integração com o banco</legend>
          <form.AppField name="integracao">
            {(field) => (
              <field.SelectField label="Integração" placeholder="Nenhuma" opcoes={INTEGRACOES} />
            )}
          </form.AppField>
          {integracao !== 'nenhuma' && (
            <form.AppField name="credencial">
              {(field) => (
                <field.TextField
                  label="Credencial"
                  required
                  placeholder="ITAU_TELEIMAGEM"
                  autoComplete="off"
                  spellCheck={false}
                  description="Prefixo das variáveis no servidor. O One nunca mostra nem guarda o valor."
                />
              )}
            </form.AppField>
          )}
          {integracao !== 'nenhuma' &&
            (conferida ? (
              <ul
                aria-label="Variáveis da credencial"
                className="flex flex-col gap-1.5 text-[13px]"
              >
                {conta.variaveisCredencial.map((v) => (
                  <li key={v.nome} className="flex flex-wrap items-center gap-x-2">
                    {v.configurada ? (
                      <CheckCircle size={16} aria-hidden className="text-success flex-none" />
                    ) : (
                      <WarningCircle size={16} aria-hidden className="text-warning flex-none" />
                    )}
                    <span className="font-mono">{v.nome}</span>
                    <span className={v.configurada ? 'text-success' : 'text-warning'}>
                      {v.configurada ? 'Configurada no servidor' : 'Não encontrada no servidor'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-[13px]">
                Salve para conferir se as variáveis existem no servidor.
              </p>
            ))}
        </fieldset>

        <form.AppForm>
          <RodapePainel
            rotuloCriar="Criar conta"
            editando={Boolean(conta)}
            excluir={excluir}
            onCancelar={onFechar}
          />
        </form.AppForm>
      </form>
    </PainelLateral>
  );
}
