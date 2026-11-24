import { randomUUID } from 'node:crypto';

import type { ListaRepository } from '../../catalogo/listas/lista.repository';
import { paginar } from '../../catalogo/testing/fakes';
import type {
  AliasesMedicoRepository,
  NovoAliasMedico,
} from '../aliases/aliases-medico.repository';
import type {
  AliasMedico,
  DadosMedico,
  FiltroMedicos,
  MedicoResumo,
  MedicosRepository,
  OutraContaMobilemed,
} from '../cadastro/medicos.repository';
import type {
  NovaOutraConta,
  OutrasContasMedicoRepository,
} from '../outras-contas/outras-contas-medico.repository';
import type {
  DadosPagamento,
  PagamentoMedicoRepository,
} from '../pagamento/pagamento-medico.repository';

const contem = (valor: string | null, busca: string) =>
  (valor ?? '').toLowerCase().includes(busca.toLowerCase());

type MedicoGuardado = DadosMedico & { id: string; chaveNormalizada: string };

/** Médicos em memória para os testes dos services. */
export class InMemoryMedicosRepository
  implements MedicosRepository, AliasesMedicoRepository, OutrasContasMedicoRepository
{
  readonly medicos = new Map<string, MedicoGuardado>();
  readonly aliases = new Map<
    string,
    AliasMedico & { medicoId: string; chaveNormalizada: string }
  >();
  readonly outrasContas = new Map<string, OutraContaMobilemed & { medicoId: string }>();
  /** Equipes de cada médico (id → nomes), para o detalhe. */
  readonly equipesDoMedico = new Map<string, { id: string; nome: string }[]>();
  /** Ids referenciados por outro cadastro: `excluir` recusa. */
  readonly emUso = new Set<string>();

  constructor(private readonly niveis?: Pick<ListaRepository, 'buscar'>) {}

  private async nivelDe(nivelId: string | null) {
    const nivel = nivelId ? await this.niveis?.buscar(nivelId) : null;
    return nivel ? { id: nivel.id, nome: nivel.nome } : null;
  }

  private aliasesDe(medicoId: string) {
    return [...this.aliases.values()]
      .filter((a) => a.medicoId === medicoId)
      .map(({ medicoId: _, chaveNormalizada: __, ...alias }) => alias);
  }

  async listar(filtro: FiltroMedicos) {
    const filtrados = [...this.medicos.values()]
      .filter((m) => filtro.ativo === undefined || m.ativo === filtro.ativo)
      .filter((m) => !filtro.nivelId || m.nivelId === filtro.nivelId)
      .filter(
        (m) =>
          !filtro.equipeId ||
          (this.equipesDoMedico.get(m.id) ?? []).some((e) => e.id === filtro.equipeId),
      )
      .filter(
        (m) =>
          !filtro.busca ||
          contem(m.nome, filtro.busca) ||
          m.crm === filtro.busca ||
          String(m.idMobilemed) === filtro.busca,
      )
      .sort((a, b) => a.chaveNormalizada.localeCompare(b.chaveNormalizada));
    const resumos: MedicoResumo[] = [];
    for (const m of filtrados) {
      resumos.push({
        id: m.id,
        nome: m.nome,
        crm: m.crm,
        idMobilemed: m.idMobilemed,
        nivel: await this.nivelDe(m.nivelId),
        funcao: m.funcao,
        senior: m.senior,
        ativo: m.ativo,
        ocultoDashboards: m.ocultoDashboards,
        totalAliases: this.aliasesDe(m.id).length,
      });
    }
    return paginar(resumos, filtro);
  }

  async buscar(id: string) {
    const m = this.medicos.get(id);
    if (!m) return null;
    const { chaveNormalizada: _, nivelId, ...resto } = m;
    return {
      ...resto,
      nivel: await this.nivelDe(nivelId),
      aliases: this.aliasesDe(id),
      outrasContas: [...this.outrasContas.values()]
        .filter((c) => c.medicoId === id)
        .sort((a, b) => a.idMobilemed - b.idMobilemed)
        .map(({ medicoId: _, ...c }) => c),
      equipes: this.equipesDoMedico.get(id) ?? [],
    };
  }

  async buscarPorChave(chave: string) {
    const m = [...this.medicos.values()].find((x) => x.chaveNormalizada === chave);
    return m ? { id: m.id, nome: m.nome } : null;
  }

  async buscarPorIdMobilemed(idMobilemed: number) {
    const m = [...this.medicos.values()].find((x) => x.idMobilemed === idMobilemed);
    if (m) return { id: m.id, nome: m.nome, principal: true };
    const outra = [...this.outrasContas.values()].find((c) => c.idMobilemed === idMobilemed);
    const dono = outra && this.medicos.get(outra.medicoId);
    return dono ? { id: dono.id, nome: dono.nome, principal: false } : null;
  }

  async criar(dados: DadosMedico & { chaveNormalizada: string }) {
    const id = randomUUID();
    this.medicos.set(id, { ...dados, id });
    return id;
  }

  async atualizar(id: string, dados: DadosMedico & { chaveNormalizada: string }) {
    this.medicos.set(id, { ...dados, id });
  }

  async excluir(id: string) {
    if (this.emUso.has(id)) return false;
    this.medicos.delete(id);
    for (const [aliasId, alias] of this.aliases) {
      if (alias.medicoId === id) this.aliases.delete(aliasId);
    }
    for (const [contaId, conta] of this.outrasContas) {
      if (conta.medicoId === id) this.outrasContas.delete(contaId);
    }
    return true;
  }

  async criarOutraConta(medicoId: string, conta: NovaOutraConta) {
    const id = randomUUID();
    this.outrasContas.set(id, { ...conta, id, medicoId, criadoEm: new Date() });
    return id;
  }

  async buscarOutraContaDoMedico(medicoId: string, contaId: string) {
    const conta = this.outrasContas.get(contaId);
    if (!conta || conta.medicoId !== medicoId) return null;
    const { medicoId: _, ...resto } = conta;
    return resto;
  }

  async excluirOutraConta(contaId: string) {
    this.outrasContas.delete(contaId);
  }

  async buscarAlias(chave: string) {
    const alias = [...this.aliases.values()].find((a) => a.chaveNormalizada === chave);
    if (!alias) return null;
    return {
      id: alias.id,
      medicoId: alias.medicoId,
      medicoNome: this.medicos.get(alias.medicoId)?.nome ?? '',
    };
  }

  async criarAlias(medicoId: string, alias: NovoAliasMedico) {
    const id = randomUUID();
    this.aliases.set(id, {
      ...alias,
      id,
      medicoId,
      origem: 'manual',
      verificadoManualmente: true,
    });
    return id;
  }

  async buscarAliasDoMedico(medicoId: string, aliasId: string) {
    const alias = this.aliases.get(aliasId);
    if (!alias || alias.medicoId !== medicoId) return null;
    const { medicoId: _, chaveNormalizada: __, ...resto } = alias;
    return resto;
  }

  async excluirAlias(aliasId: string) {
    this.aliases.delete(aliasId);
  }
}

/** Dados de pagamento em memória. */
export class InMemoryPagamentoMedicoRepository implements PagamentoMedicoRepository {
  readonly dados = new Map<string, DadosPagamento>();

  async buscar(medicoId: string) {
    return this.dados.get(medicoId) ?? null;
  }

  async salvar(medicoId: string, dados: DadosPagamento) {
    this.dados.set(medicoId, { ...dados });
  }
}
