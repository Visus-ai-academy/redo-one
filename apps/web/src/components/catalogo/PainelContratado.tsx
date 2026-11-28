import { useState } from 'react';
import { z } from 'zod';

import type { ContratadoDto } from '../../gen/types/ContratadoDto';
import type { ContratadoItemDto } from '../../gen/types/ContratadoItemDto';
import { ordenarContratados } from '../../lib/catalogo';
import { formatarCep, formatarCnpj, soDigitos } from '../../lib/documentos';
import { Alerta } from '../alerta/Alerta';
import { mensagemDaApi } from '../alerta/mensagem-da-api';
import { UFS } from '../faturamento/dados-faturamento';
import { CampoSomenteLeitura } from '../form/CampoSomenteLeitura';
import { useAppForm } from '../form/form';
import { LinhaDeCampos } from '../form/LinhaDeCampos';
import { useAlterado } from '../painel/fechamento';
import { PainelLateral } from '../painel/PainelLateral';
import { RodapePainel, RodapeSomenteLeitura } from './rodape-painel';

/** As 27 siglas; a gravada fora da lista (cadastro antigo) continua oferecida, para não se perder. */
function opcoesDeUf(atual: string) {
  const fora = atual && !(UFS as readonly string[]).includes(atual) ? [atual] : [];
  return [
    { valor: '', rotulo: '—' },
    ...[...UFS, ...fora].map((uf) => ({ valor: uf, rotulo: uf })),
  ];
}

const tamanho = (n: number, mensagem: string) =>
  z.string().refine((v) => v.trim() === '' || soDigitos(v).length === n, mensagem);

const schema = z.object({
  razaoSocial: z.string().trim().min(1, 'Informe a razão social.'),
  cnpj: tamanho(14, 'O CNPJ tem 14 dígitos.'),
  endereco: z.string(),
  cidade: z.string(),
  uf: z
    .string()
    .refine((v) => v.trim() === '' || /^[a-z]{2}$/i.test(v.trim()), 'A UF tem duas letras.'),
  cep: tamanho(8, 'O CEP tem 8 dígitos.'),
  contratadoRepasseId: z.string(),
  ativo: z.boolean(),
  padrao: z.boolean(),
  usaFinanceiro: z.boolean(),
});

const PADRAO_INATIVO = 'Um contratado inativo não pode ser o contratado padrão.';
const FINANCEIRO_INATIVO = 'Um contratado inativo não pode usar o financeiro do One.';

type PainelContratadoProps = {
  /** Sem contratado, o painel cria um novo. */
  contratado?: ContratadoItemDto;
  /** Contratados ativos, para escolher onde consolidar o repasse. */
  contratados: { id: string; nome: string; padrao: boolean }[];
  podeEditar: boolean;
  onSalvar: (dados: ContratadoDto) => Promise<void>;
  onExcluir?: () => Promise<void>;
  onFechar: () => void;
};

const opcional = (texto: string) => texto.trim() || null;

/** Empresa própria que emite a nota: criar, ver e editar, no painel ao lado da lista. */
export function PainelContratado({
  contratado,
  contratados,
  podeEditar,
  onSalvar,
  onExcluir,
  onFechar,
}: PainelContratadoProps) {
  const [erro, setErro] = useState<string>();
  const titulo = contratado?.razaoSocial ?? 'Novo contratado';

  const iniciais = {
    razaoSocial: contratado?.razaoSocial ?? '',
    cnpj: contratado?.cnpj ? formatarCnpj(contratado.cnpj) : '',
    endereco: contratado?.endereco ?? '',
    cidade: contratado?.cidade ?? '',
    uf: contratado?.uf ?? '',
    cep: contratado?.cep ? formatarCep(contratado.cep) : '',
    contratadoRepasseId: contratado?.contratadoRepasseId ?? '',
    ativo: contratado?.ativo ?? true,
    padrao: contratado?.padrao ?? false,
    usaFinanceiro: contratado?.usaFinanceiro ?? false,
  };
  const form = useAppForm({
    defaultValues: iniciais,
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      setErro(undefined);
      try {
        await onSalvar({
          razaoSocial: value.razaoSocial.trim(),
          cnpj: value.cnpj.trim() ? soDigitos(value.cnpj) : null,
          endereco: opcional(value.endereco),
          cidade: opcional(value.cidade),
          uf: value.uf.trim() ? value.uf.trim().toUpperCase() : null,
          cep: value.cep.trim() ? soDigitos(value.cep) : null,
          contratadoRepasseId: value.contratadoRepasseId || null,
          ativo: value.ativo,
          padrao: value.padrao,
          usaFinanceiro: value.usaFinanceiro,
        });
      } catch (falha) {
        setErro(
          mensagemDaApi(
            falha,
            'Não foi possível salvar agora. Confira sua conexão e tente de novo.',
          ),
        );
      }
    },
  });
  const alterado = useAlterado(form, iniciais);

  const excluir =
    contratado && onExcluir
      ? {
          acao: 'Excluir contratado',
          titulo: `Excluir ${contratado.razaoSocial}?`,
          consequencia:
            'O contratado sai do cadastro. Se algum cliente fatura por ele ou outro contratado consolida nele, a exclusão é recusada: desative em vez de excluir.',
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

  if (!podeEditar && contratado) {
    return (
      <PainelLateral titulo={titulo} onFechar={onFechar}>
        <div className="flex flex-col gap-4 p-4">
          {erro && <Alerta tom="erro">{erro}</Alerta>}
          <CampoSomenteLeitura label="CNPJ" value={formatarCnpj(contratado.cnpj)} />
          <CampoSomenteLeitura
            label="Endereço"
            value={
              [
                contratado.endereco,
                contratado.cidade,
                contratado.uf,
                contratado.cep && formatarCep(contratado.cep),
              ]
                .filter(Boolean)
                .join(', ') || '—'
            }
          />
          <CampoSomenteLeitura
            label="Consolida o repasse em"
            value={contratado.contratadoRepasseNome ?? 'Nele mesmo'}
          />
          <CampoSomenteLeitura label="Situação" value={contratado.ativo ? 'Ativo' : 'Inativo'} />
          <CampoSomenteLeitura
            label="Contratado padrão"
            value={contratado.padrao ? 'Sim' : 'Não'}
          />
          <CampoSomenteLeitura
            label="Usa o financeiro do One"
            value={contratado.usaFinanceiro ? 'Sim' : 'Não'}
          />
          <RodapeSomenteLeitura excluir={excluir} />
        </div>
      </PainelLateral>
    );
  }

  return (
    <PainelLateral
      titulo={titulo}
      subtitulo={contratado?.cnpj ? formatarCnpj(contratado.cnpj) : undefined}
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
        <form.AppField name="razaoSocial">
          {(field) => (
            <field.TextField
              label="Razão social"
              placeholder="Ex.: 001 TELEIMAGEM LTDA"
              autoComplete="off"
              required
            />
          )}
        </form.AppField>
        <form.AppField name="cnpj">
          {(field) => (
            <field.TextField
              label="CNPJ"
              mascara="cnpj"
              placeholder="00.000.000/0000-00"
              autoComplete="off"
            />
          )}
        </form.AppField>
        <form.AppField name="endereco">
          {(field) => (
            <field.TextField
              label="Endereço"
              placeholder="Ex.: Av. Paulista, 1000, sala 12"
              autoComplete="off"
            />
          )}
        </form.AppField>
        <LinhaDeCampos className="@[400px]:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <form.AppField name="cidade">
            {(field) => (
              <field.TextField label="Cidade" placeholder="Ex.: São Paulo" autoComplete="off" />
            )}
          </form.AppField>
          <form.AppField name="uf">
            {(field) => (
              <field.SelectField label="UF" placeholder="UF" opcoes={opcoesDeUf(iniciais.uf)} />
            )}
          </form.AppField>
          <form.AppField name="cep">
            {(field) => (
              <field.TextField
                label="CEP"
                mascara="cep"
                placeholder="00000-000"
                autoComplete="off"
              />
            )}
          </form.AppField>
        </LinhaDeCampos>
        <form.AppField name="contratadoRepasseId">
          {(field) => (
            <field.SelectField
              label="Consolida o repasse em"
              placeholder="Nele mesmo"
              description="Os laudos emitidos por este contratado têm o repasse pago pelo escolhido. Um passo só: o escolhido não pode consolidar em outro."
              opcoes={[
                { valor: '', rotulo: 'Nele mesmo' },
                ...ordenarContratados(contratados)
                  .filter((c) => c.id !== contratado?.id)
                  .map((c) => ({ valor: c.id, rotulo: c.nome })),
              ]}
            />
          )}
        </form.AppField>
        <form.AppField name="ativo">
          {(field) => (
            <field.InterruptorField
              label="Ativo"
              description="Inativo some da escolha da empresa que fatura, mas continua nos clientes que já o usam."
            />
          )}
        </form.AppField>
        <form.AppField
          name="padrao"
          validators={{
            // Fica no campo (e não no schema) para sumir ao reativar o contratado.
            onChangeListenTo: ['ativo'],
            onChange: ({ value, fieldApi }) =>
              value && !fieldApi.form.getFieldValue('ativo') ? PADRAO_INATIVO : undefined,
          }}
        >
          {(field) => (
            <field.InterruptorField
              label="Contratado padrão"
              description="Vem escolhido nos campos de contratado, como a empresa que fatura do cliente novo. Marcar este desmarca o anterior."
            />
          )}
        </form.AppField>
        <form.AppField
          name="usaFinanceiro"
          validators={{
            // Fica no campo (e não no schema) para sumir ao reativar o contratado.
            onChangeListenTo: ['ativo'],
            onChange: ({ value, fieldApi }) =>
              value && !fieldApi.form.getFieldValue('ativo') ? FINANCEIRO_INATIVO : undefined,
          }}
        >
          {(field) => (
            <field.InterruptorField
              label="Usa o financeiro do One"
              description="Contas a pagar e a receber, nota fiscal e cobrança desta empresa ficam no One."
            />
          )}
        </form.AppField>
        <form.AppForm>
          <RodapePainel
            rotuloCriar="Criar contratado"
            editando={Boolean(contratado)}
            excluir={excluir}
            onCancelar={onFechar}
          />
        </form.AppForm>
      </form>
    </PainelLateral>
  );
}
