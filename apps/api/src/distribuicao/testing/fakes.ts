import type { ArranjosRepository, Dono } from '../application/ports/arranjos.repository';
import type { CadastrosDistribuicao } from '../application/ports/cadastros-distribuicao';
import type {
  ParametrosMedico,
  ParametrosMedicoRepository,
} from '../application/ports/parametros-medico.repository';
import type { Arranjo, FrenteEscala } from '../domain/arranjo';

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
