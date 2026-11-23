import { Button } from '@base-ui/react/button';
import { type ReactNode, useEffect, useId, useState } from 'react';
import { z } from 'zod';

import type { ExameDetalheDto } from '../../gen/types/ExameDetalheDto';
import type { ExameDto } from '../../gen/types/ExameDto';
import type { OpcoesCatalogoDto } from '../../gen/types/OpcoesCatalogoDto';
import { Alerta } from '../alerta/Alerta';
import { mensagemDaApi } from '../alerta/mensagem-da-api';
import { buttonClassName } from '../button/button-class';
import { CampoSomenteLeitura } from '../form/CampoSomenteLeitura';
import { useAppForm } from '../form/form';
import { AbasComHistorico } from '../historico-cadastro/AbasComHistorico';
import { BotaoCancelar } from '../painel/BotaoCancelar';
import { useAlterado } from '../painel/fechamento';
import { PainelLateral } from '../painel/PainelLateral';
import { RodapePainel, RodapeSomenteLeitura } from './rodape-painel';
import { useErroDoPainel } from './use-erro-do-painel';

export type PainelExameProps = {
  /** Sem exame, o painel cria um novo (a quebra aparece depois de criado). */
  exame?: ExameDetalheDto;
  opcoes: OpcoesCatalogoDto;
  /** Salvar o formulário: editar (exame aberto) ou criar (novo). */
  podeEditar: boolean;
  /** Criar a quebra do estudo (POST). */
  podeCriar: boolean;
  onSalvar: (dados: ExameDto) => Promise<void>;
  /**
   * Sem `podeEditar`, mudar só a subespecialidade (`exames.subespecialidade.editar`): o painel
   * fica só leitura, com a subespecialidade editável e o Salvar.
   */
  onSalvarSubespecialidade?: (subespecialidadeId: string | null) => Promise<void>;
  onExcluir?: () => Promise<void>;
  /** Abre a quebra do estudo com o mesmo nome do exame. */
  onAbrirQuebra: (id: string) => void;
  /** Cria a quebra do estudo com o nome do exame e a abre. */
  onCriarQuebra: () => Promise<void>;
  onFechar: () => void;
  /** Conteúdo da aba Histórico; sem ele (ou criando), o painel fica sem abas. */
  historico?: ReactNode;
};

const opcional = (texto: string) => texto.trim() || null;
const nenhum = (rotulo: string) => ({ valor: '', rotulo });
const comoOpcoes = (itens: { id: string; nome: string }[]) =>
  itens.map((i) => ({ valor: i.id, rotulo: i.nome }));
/** Modalidade e especialidade: com a bolinha da cor do catálogo. */
const comoOpcoesComCor = (itens: { id: string; nome: string; cor: string | null }[]) =>
  itens.map((i) => ({ valor: i.id, rotulo: i.nome, cor: i.cor }));
const nomeDe = (itens: { id: string; nome: string }[], id: string | null | undefined) =>
  itens.find((i) => i.id === id)?.nome ?? '—';

/** Exame do catálogo, no painel ao lado da lista; aponta a quebra do estudo de mesmo nome. */
export function PainelExame({
  exame,
  opcoes,
  podeEditar,
  podeCriar,
  onSalvar,
  onSalvarSubespecialidade,
  onExcluir,
  onAbrirQuebra,
  onCriarQuebra,
  onFechar,
  historico,
}: PainelExameProps) {
  const { erro, tentar } = useErroDoPainel();
  // Quem só muda a subespecialidade também é perguntado antes de descartar.
  const [subAlterada, setSubAlterada] = useState(false);
  const iniciais = {
    nome: exame?.nome ?? '',
    codigo: exame?.codigo ?? '',
    descricao: exame?.descricao ?? '',
    modalidadeId: exame?.modalidadeId ?? '',
    especialidadeId: exame?.especialidadeId ?? '',
    subespecialidadeId: exame?.subespecialidadeId ?? '',
    categoriaId: exame?.categoriaId ?? '',
    prioridadeId: exame?.prioridadeId ?? '',
    permiteQuebra: exame?.permiteQuebra ?? false,
    exigeRevisaoManual: exame?.exigeRevisaoManual ?? false,
    ativo: exame?.ativo ?? true,
  };
  const form = useAppForm({
    defaultValues: iniciais,
    validators: {
      onSubmit: z.object({
        nome: z.string().trim().min(1, 'Informe o nome do exame.'),
        codigo: z.string(),
        descricao: z.string(),
        modalidadeId: z.string(),
        especialidadeId: z.string(),
        subespecialidadeId: z.string(),
        categoriaId: z.string(),
        prioridadeId: z.string(),
        permiteQuebra: z.boolean(),
        exigeRevisaoManual: z.boolean(),
        ativo: z.boolean(),
      }),
    },
    onSubmit: ({ value }) =>
      tentar(() =>
        onSalvar({
          nome: value.nome.trim(),
          codigo: opcional(value.codigo),
          descricao: opcional(value.descricao),
          modalidadeId: value.modalidadeId || null,
          especialidadeId: value.especialidadeId || null,
          subespecialidadeId: value.subespecialidadeId || null,
          categoriaId: value.categoriaId || null,
          prioridadeId: value.prioridadeId || null,
          permiteQuebra: value.permiteQuebra,
          exigeRevisaoManual: value.exigeRevisaoManual,
          ativo: value.ativo,
        }),
      ),
  });
  const alterado = useAlterado(form, iniciais);

  const excluir =
    exame && onExcluir
      ? {
          acao: 'Excluir exame',
          titulo: `Excluir ${exame.nome}?`,
          consequencia:
            'O exame sai do catálogo. Se ele é um dos exames de uma quebra, a exclusão é recusada: desative em vez de excluir.',
          onConfirmar: () => tentar(onExcluir, 'Não foi possível excluir agora. Tente de novo.'),
        }
      : undefined;

  return (
    <PainelLateral
      titulo={exame?.nome ?? 'Novo exame'}
      subtitulo={exame?.codigo ?? undefined}
      onFechar={onFechar}
      alterado={alterado || subAlterada}
    >
      <AbasComHistorico
        historico={exame ? historico : undefined}
        aria-label="Partes do cadastro do exame"
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
                  label="Nome"
                  placeholder="Ex.: TC CRANIO"
                  description="Como o estudo chega da MobileMed."
                  autoComplete="off"
                  required
                />
              )}
            </form.AppField>
            <div className="flex flex-wrap gap-4">
              <form.AppField name="codigo">
                {(field) => (
                  <field.TextField
                    label="Código"
                    placeholder="Ex.: 40808041"
                    autoComplete="off"
                    className="flex-[1_1_140px]"
                  />
                )}
              </form.AppField>
              <form.AppField name="modalidadeId">
                {(field) => (
                  <field.SelectField
                    label="Modalidade"
                    placeholder="Sem modalidade"
                    opcoes={[nenhum('Sem modalidade'), ...comoOpcoesComCor(opcoes.modalidades)]}
                    className="flex-[1_1_140px]"
                  />
                )}
              </form.AppField>
            </div>
            <form.AppField name="descricao">
              {(field) => (
                <field.TextField
                  label="Descrição"
                  placeholder="Ex.: Tomografia de crânio sem contraste"
                  autoComplete="off"
                />
              )}
            </form.AppField>
            <form.Subscribe
              selector={(estado) =>
                [estado.values.especialidadeId, estado.values.subespecialidadeId] as const
              }
            >
              {([especialidadeId, subespecialidadeId]) => (
                <>
                  <form.AppField name="especialidadeId">
                    {(field) => (
                      <field.SelectField
                        label="Especialidade"
                        placeholder="Sem especialidade"
                        opcoes={[
                          nenhum('Sem especialidade'),
                          ...comoOpcoesComCor(opcoes.especialidades),
                        ]}
                      />
                    )}
                  </form.AppField>
                  <form.AppField name="subespecialidadeId">
                    {(field) => (
                      <field.SelectField
                        label="Subespecialidade"
                        placeholder="Sem subespecialidade"
                        description="Sem subespecialidade, o exame não vai para médico restrito a uma."
                        opcoes={[
                          nenhum('Sem subespecialidade'),
                          ...comoOpcoes(
                            opcoes.subespecialidades.filter(
                              (s) =>
                                !especialidadeId ||
                                s.especialidadeIds.includes(especialidadeId) ||
                                s.id === subespecialidadeId,
                            ),
                          ),
                        ]}
                      />
                    )}
                  </form.AppField>
                </>
              )}
            </form.Subscribe>
            <div className="flex flex-wrap gap-4">
              <form.AppField name="categoriaId">
                {(field) => (
                  <field.SelectField
                    label="Categoria"
                    placeholder="Sem categoria"
                    opcoes={[nenhum('Sem categoria'), ...comoOpcoes(opcoes.categoriasExame)]}
                    className="flex-[1_1_140px]"
                  />
                )}
              </form.AppField>
              <form.AppField name="prioridadeId">
                {(field) => (
                  <field.SelectField
                    label="Prioridade"
                    placeholder="Sem prioridade"
                    opcoes={[nenhum('Sem prioridade'), ...comoOpcoes(opcoes.prioridades)]}
                    className="flex-[1_1_140px]"
                  />
                )}
              </form.AppField>
            </div>
            <form.AppField name="exigeRevisaoManual">
              {(field) => (
                <field.CheckboxField
                  label="Exige revisão manual"
                  description="O robô separa para a operação analisar em vez de distribuir (ex.: idade óssea)."
                />
              )}
            </form.AppField>
            <form.AppField name="permiteQuebra">
              {(field) => <field.CheckboxField label="Permite quebra" />}
            </form.AppField>
            <form.AppField name="ativo">
              {(field) => (
                <field.CheckboxField
                  label="Ativo"
                  description="Inativo some das buscas de exame; o histórico continua."
                />
              )}
            </form.AppField>
            <form.AppForm>
              <RodapePainel
                rotuloCriar="Criar exame"
                editando={Boolean(exame)}
                excluir={excluir}
                onCancelar={onFechar}
              />
            </form.AppForm>
          </form>
        ) : (
          exame && (
            <div className="flex flex-col gap-4 p-4">
              {erro && <Alerta tom="erro">{erro}</Alerta>}
              <CampoSomenteLeitura
                label="Modalidade"
                value={nomeDe(opcoes.modalidades, exame.modalidadeId)}
              />
              <CampoSomenteLeitura
                label="Especialidade"
                value={nomeDe(opcoes.especialidades, exame.especialidadeId)}
              />
              {onSalvarSubespecialidade ? (
                <FormSubespecialidade
                  exame={exame}
                  opcoes={opcoes}
                  onSalvar={(subespecialidadeId) =>
                    tentar(() => onSalvarSubespecialidade(subespecialidadeId))
                  }
                  onCancelar={onFechar}
                  onAlterado={setSubAlterada}
                />
              ) : (
                <CampoSomenteLeitura
                  label="Subespecialidade"
                  value={nomeDe(opcoes.subespecialidades, exame.subespecialidadeId)}
                />
              )}
              <CampoSomenteLeitura
                label="Categoria"
                value={nomeDe(opcoes.categoriasExame, exame.categoriaId)}
              />
              <CampoSomenteLeitura label="Situação" value={exame.ativo ? 'Ativo' : 'Inativo'} />
              <RodapeSomenteLeitura excluir={excluir} />
            </div>
          )
        )}
        {/* Quem só muda a subespecialidade não mexe em quebras: nem abre, nem cria. */}
        {exame && !(onSalvarSubespecialidade && !podeEditar) && (
          <QuebraDoExame
            quebra={exame.quebra}
            podeCriar={podeCriar}
            onAbrir={onAbrirQuebra}
            onCriar={onCriarQuebra}
          />
        )}
      </AbasComHistorico>
    </PainelLateral>
  );
}

/**
 * Só a subespecialidade, para quem não edita o exame inteiro. As opções são as da especialidade do
 * exame (mais a atual), como no formulário completo.
 */
function FormSubespecialidade({
  exame,
  opcoes,
  onSalvar,
  onCancelar,
  onAlterado,
}: {
  exame: ExameDetalheDto;
  opcoes: OpcoesCatalogoDto;
  onSalvar: (subespecialidadeId: string | null) => Promise<void>;
  onCancelar: () => void;
  onAlterado: (alterado: boolean) => void;
}) {
  const iniciais = { subespecialidadeId: exame.subespecialidadeId ?? '' };
  const form = useAppForm({
    defaultValues: iniciais,
    validators: { onSubmit: z.object({ subespecialidadeId: z.string() }) },
    onSubmit: ({ value }) => onSalvar(value.subespecialidadeId || null),
  });
  const alterado = useAlterado(form, iniciais);
  useEffect(() => onAlterado(alterado), [alterado, onAlterado]);
  const daEspecialidade = opcoes.subespecialidades.filter(
    (s) =>
      !exame.especialidadeId ||
      s.especialidadeIds.includes(exame.especialidadeId) ||
      s.id === exame.subespecialidadeId,
  );

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
      className="flex flex-col gap-4"
    >
      <form.AppField name="subespecialidadeId">
        {(field) => (
          <field.SelectField
            label="Subespecialidade"
            placeholder="Sem subespecialidade"
            description="Sem subespecialidade, o exame não vai para médico restrito a uma."
            opcoes={[nenhum('Sem subespecialidade'), ...comoOpcoes(daEspecialidade)]}
          />
        )}
      </form.AppField>
      <span className="flex justify-end gap-2">
        {/* Dentro do painel, fecha como o X: deslizando e perguntando se há alteração. */}
        <BotaoCancelar onCancelar={onCancelar} />
        <form.AppForm>
          <form.SubmitButton pendingLabel="Salvando…">Salvar</form.SubmitButton>
        </form.AppForm>
      </span>
    </form>
  );
}

/** A quebra do estudo de mesmo nome: quantos exames ele vira, com o caminho até ela. */
function QuebraDoExame({
  quebra,
  podeCriar,
  onAbrir,
  onCriar,
}: {
  quebra: ExameDetalheDto['quebra'];
  podeCriar: boolean;
  onAbrir: (id: string) => void;
  onCriar: () => Promise<void>;
}) {
  const tituloId = useId();
  const [erro, setErro] = useState<string>();
  const [criando, setCriando] = useState(false);
  return (
    <section aria-labelledby={tituloId} className="flex flex-col gap-3 border-t p-4">
      <h3 id={tituloId} className="text-base font-semibold">
        Quebra
      </h3>
      {erro && <Alerta tom="erro">{erro}</Alerta>}
      {quebra ? (
        <>
          <p className="text-muted-foreground">
            Laudado, este estudo vira {quebra.totalPecas}{' '}
            {quebra.totalPecas === 1 ? 'exame' : 'exames'} na cobrança.
          </p>
          <Button
            type="button"
            onClick={() => onAbrir(quebra.id)}
            className={buttonClassName({ variant: 'secondary', className: 'self-start' })}
          >
            Abrir a quebra
          </Button>
        </>
      ) : (
        <>
          <p className="text-muted-foreground">Este estudo não se quebra.</p>
          {podeCriar && (
            <Button
              type="button"
              disabled={criando}
              onClick={async () => {
                setErro(undefined);
                setCriando(true);
                try {
                  await onCriar();
                } catch (falha) {
                  setErro(
                    mensagemDaApi(falha, 'Não foi possível criar a quebra agora. Tente de novo.'),
                  );
                } finally {
                  setCriando(false);
                }
              }}
              className={buttonClassName({ variant: 'secondary', className: 'self-start' })}
            >
              {criando ? 'Criando…' : 'Criar quebra'}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
