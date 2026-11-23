import { useState } from 'react';
import { z } from 'zod';

import type { ContratadoDto } from '../../gen/types/ContratadoDto';
import type { ContratadoItemDto } from '../../gen/types/ContratadoItemDto';
import { formatarCep, formatarCnpj, soDigitos } from '../../lib/documentos';
import { Alerta } from '../alerta/Alerta';
import { mensagemDaApi } from '../alerta/mensagem-da-api';
import { CampoSomenteLeitura } from '../form/CampoSomenteLeitura';
import { useAppForm } from '../form/form';
import { useAlterado } from '../painel/fechamento';
import { PainelLateral } from '../painel/PainelLateral';
import { RodapePainel, RodapeSomenteLeitura } from './rodape-painel';

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
});

type PainelContratadoProps = {
  /** Sem contratado, o painel cria um novo. */
  contratado?: ContratadoItemDto;
  /** Contratados ativos, para escolher onde consolidar o repasse. */
  contratados: { id: string; nome: string }[];
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
        <div className="flex flex-wrap gap-4">
          <form.AppField name="cidade">
            {(field) => (
              <field.TextField
                label="Cidade"
                placeholder="Ex.: São Paulo"
                autoComplete="off"
                className="flex-[2_1_160px]"
              />
            )}
          </form.AppField>
          <form.AppField name="uf">
            {(field) => (
              <field.TextField
                label="UF"
                placeholder="SP"
                autoComplete="off"
                className="flex-[1_1_64px]"
              />
            )}
          </form.AppField>
          <form.AppField name="cep">
            {(field) => (
              <field.TextField
                label="CEP"
                mascara="cep"
                placeholder="00000-000"
                autoComplete="off"
                className="flex-[1_1_120px]"
              />
            )}
          </form.AppField>
        </div>
        <form.AppField name="contratadoRepasseId">
          {(field) => (
            <field.SelectField
              label="Consolida o repasse em"
              placeholder="Nele mesmo"
              description="Os laudos emitidos por este contratado têm o repasse pago pelo escolhido. Um passo só: o escolhido não pode consolidar em outro."
              opcoes={[
                { valor: '', rotulo: 'Nele mesmo' },
                ...contratados
                  .filter((c) => c.id !== contratado?.id)
                  .map((c) => ({ valor: c.id, rotulo: c.nome })),
              ]}
            />
          )}
        </form.AppField>
        <form.AppField name="ativo">
          {(field) => (
            <field.CheckboxField
              label="Ativo"
              description="Inativo some da escolha da empresa que fatura, mas continua nos clientes que já o usam."
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
