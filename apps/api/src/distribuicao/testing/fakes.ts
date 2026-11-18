import type { ArranjosRepository, Dono } from '../application/ports/arranjos.repository';
import type {
  CadastrosDistribuicao,
  Referencias,
  TipoReferencia,
} from '../application/ports/cadastros-distribuicao';
import type { ConfiguracaoDistribuicaoRepository } from '../application/ports/configuracao-distribuicao.repository';
import type {
  ParametrosEquipe,
  ParametrosEquipeRepository,
} from '../application/ports/parametros-equipe.repository';
import type {
  ParametrosMedico,
  ParametrosMedicoRepository,
} from '../application/ports/parametros-medico.repository';
import type { PrioridadesClienteRepository } from '../application/ports/prioridades-cliente.repository';
import type { RegrasFrenteRepository } from '../application/ports/regras-frente.repository';
import type { Arranjo, FrenteEscala } from '../domain/arranjo';
import type { ConfiguracaoGlobal } from '../domain/configuracao-global';
import type { RegrasFrente } from '../domain/motor/configuracao';
import type { PrioridadeDaFrente } from '../domain/prioridade-cliente';

export class ArranjosEmMemoria implements ArranjosRepository {
  readonly porDono = new Map<string, Arranjo[]>();
  substituicoes = 0;

  async listar(dono: Dono) {
    return structuredClone(this.porDono.get(`${dono.tipo}:${dono.id}`) ?? []);
  }

  async substituir(dono: Dono, arranjos: Arranjo[]) {
    this.substituicoes++;
    this.porDono.set(`${dono.tipo}:${dono.id}`, structuredClone(arranjos));
  }
}

export class ParametrosMedicoEmMemoria implements ParametrosMedicoRepository {
  readonly itens = new Map<string, ParametrosMedico>();

  async obter(medicoId: string) {
    return this.itens.get(medicoId) ?? { habilitadoRobo: false };
  }

  async salvar(medicoId: string, parametros: ParametrosMedico) {
    this.itens.set(medicoId, { ...parametros });
  }
}

export class ParametrosEquipeEmMemoria implements ParametrosEquipeRepository {
  readonly itens = new Map<string, ParametrosEquipe>();

  async obter(equipeId: string) {
    const p = this.itens.get(equipeId);
    return p ? { ...p } : null;
  }

  async salvar(equipeId: string, parametros: ParametrosEquipe) {
    this.itens.set(equipeId, { ...parametros });
  }
}

export class CadastrosEmMemoria implements CadastrosDistribuicao {
  readonly medicos = new Set<string>();
  readonly equipes = new Set<string>();
  readonly frentes = new Map<string, FrenteEscala>();
  readonly nomes = new Map<string, string>();

  async medicoExiste(id: string) {
    return this.medicos.has(id);
  }

  async equipeExiste(id: string) {
    return this.equipes.has(id);
  }

  async frente(id: string) {
    return this.frentes.get(id) ?? null;
  }

  /** Ids que existem nos cadastros, por tipo; tipo ausente = qualquer id existe. */
  readonly existentes = new Map<TipoReferencia, Set<string>>();

  async faltando(referencias: Referencias) {
    return (Object.entries(referencias) as [TipoReferencia, readonly string[]][])
      .filter(([tipo, ids]) => {
        const ok = this.existentes.get(tipo);
        return ok ? ids.some((id) => !ok.has(id)) : false;
      })
      .map(([tipo]) => tipo);
  }

  async rotulos({ clienteIds, exameIds }: { clienteIds: string[]; exameIds: string[] }) {
    const com = (ids: string[]) => ids.map((id) => ({ id, nome: this.nomes.get(id) ?? id }));
    return { clientes: com(clienteIds), exames: com(exameIds) };
  }
}

export const arranjoVazio = (parcial: Partial<Arranjo> = {}): Arranjo => ({
  especialidadeId: null,
  modalidadeIds: [],
  subespecialidadeIds: [],
  subespecialidadeGeral: false,
  prioridadeIds: [],
  modoClientes: 'todos',
  clienteIds: [],
  modoExames: 'todos',
  exameIds: [],
  clientesExclusivosIds: [],
  ...parcial,
});

export class ConfiguracaoEmMemoria implements ConfiguracaoDistribuicaoRepository {
  atual: ConfiguracaoGlobal | null = null;
  gravacoes = 0;

  async obter() {
    return this.atual && structuredClone(this.atual);
  }

  async salvar(configuracao: ConfiguracaoGlobal) {
    this.gravacoes++;
    this.atual = structuredClone(configuracao);
  }
}

const chave = (f: FrenteEscala) => f.especialidadeId ?? f.modalidadeId;

export class RegrasFrenteEmMemoria implements RegrasFrenteRepository {
  readonly porFrente = new Map<string, RegrasFrente>();
  gravacoes = 0;

  async obter(frente: FrenteEscala) {
    const r = this.porFrente.get(chave(frente));
    return r ? structuredClone(r) : null;
  }

  async listar() {
    return [...this.porFrente.values()].map((r) => structuredClone(r));
  }

  async salvar(regras: RegrasFrente) {
    this.gravacoes++;
    this.porFrente.set(chave(regras.frente), structuredClone(regras));
  }
}

export class PrioridadesClienteEmMemoria implements PrioridadesClienteRepository {
  readonly porCliente = new Map<string, PrioridadeDaFrente[]>();
  gravacoes = 0;

  async doCliente(clienteId: string) {
    return structuredClone(this.porCliente.get(clienteId) ?? []);
  }

  async substituir(clienteId: string, itens: PrioridadeDaFrente[]) {
    this.gravacoes++;
    this.porCliente.set(clienteId, structuredClone(itens));
  }

  async todas() {
    return [...this.porCliente].flatMap(([clienteId, itens]) =>
      itens.map((i) => ({ clienteId, ...structuredClone(i) })),
    );
  }
}
