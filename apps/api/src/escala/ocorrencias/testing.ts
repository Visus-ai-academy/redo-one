import type { AlocacaoEscala } from '../domain';
import type { CarregadorEscala, DadosEscala } from './carregador-escala';
import type { MedicoDoUsuarioRepository } from './medico-do-usuario.repository';

/** Carregador em memória: devolve sempre os mesmos dados e guarda as janelas pedidas. */
export class FakeCarregadorEscala implements CarregadorEscala {
  readonly janelas: { de: string; ate: string }[] = [];

  constructor(public dados: DadosEscala) {}

  async carregar(de: string, ate: string): Promise<DadosEscala> {
    this.janelas.push({ de, ate });
    return this.dados;
  }
}

export class FakeMedicoDoUsuarioRepository implements MedicoDoUsuarioRepository {
  readonly vinculos = new Map<string, string>();

  async doUsuario(usuarioId: string): Promise<string | null> {
    return this.vinculos.get(usuarioId) ?? null;
  }
}

/** Alocação fixa de segunda a sexta, de 07:00 às 13:00, sem recortes. */
export function alocacaoEscala(campos: Partial<AlocacaoEscala> & { id: string }): AlocacaoEscala {
  return {
    medicoId: 'm-ana',
    turnoId: 't-manha',
    frenteId: 'f-neuro',
    diasSemana: [1, 2, 3, 4, 5],
    semanasDoMes: [],
    horarioInicio: '07:00',
    horarioFim: '13:00',
    dataInicio: '2026-01-01',
    dataFim: null,
    produtividade: 20,
    gratificado: false,
    subespecialidadeGeral: false,
    prioridadeIds: [],
    subespecialidadeIds: [],
    coberturaDeId: null,
    ...campos,
  };
}

/** Cadastros mínimos: Manhã e Tarde; NEURO e TC; Ana, Bruno e Carla ativos; Férias. */
export function dadosEscala(campos: Partial<DadosEscala> = {}): DadosEscala {
  return {
    alocacoes: [],
    turnos: [
      {
        id: 't-manha',
        nome: 'Manhã',
        tipo: 'fixo',
        horarioInicio: '07:00',
        horarioFim: '13:00',
        ativo: true,
        cor: '#111111',
        ordem: 1,
      },
      {
        id: 't-tarde',
        nome: 'Tarde',
        tipo: 'fixo',
        horarioInicio: '12:00',
        horarioFim: '19:00',
        ativo: true,
        cor: null,
        ordem: 2,
      },
    ],
    frentes: [
      { id: 'f-neuro', rotulo: 'NEURO', ativo: true, cor: '#222222', ordem: 1 },
      { id: 'f-tc', rotulo: 'TC', ativo: true, cor: null, ordem: 2 },
    ],
    medicos: [
      { id: 'm-ana', nome: 'Ana Souza', ativo: true },
      { id: 'm-bruno', nome: 'Bruno Lima', ativo: true },
      { id: 'm-carla', nome: 'Carla Dias', ativo: true },
    ],
    ausencias: [],
    tiposAusencia: [{ id: 'ta-ferias', nome: 'Férias', gravidade: 3, cor: '#333333' }],
    ajustes: [],
    ...campos,
  };
}
