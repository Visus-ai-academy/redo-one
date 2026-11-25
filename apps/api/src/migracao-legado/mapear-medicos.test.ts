import { describe, expect, it } from 'vitest';

import { idDoLegado } from './comum';
import type { LegadoMedicos } from './legado';
import { mapearMedicos } from './mapear-medicos';

type Medico = LegadoMedicos['medicos'][number];

const medico = (id: string, nome: string, extra: Partial<Medico> = {}): Medico => ({
  id,
  nome,
  crm: null,
  idMobilemed: null,
  email: null,
  telefone: null,
  ativo: true,
  senior: false,
  fellowship: false,
  funcao: 'STAFF',
  nivel: null,
  dataInicioVinculo: null,
  observacoes: null,
  cpf: null,
  cnpj: null,
  nomeEmpresa: null,
  tipoChavePix: null,
  chavePix: null,
  socio: null,
  optanteSimples: null,
  ...extra,
});

const vazio: LegadoMedicos = { medicos: [], aliases: [], equipes: [], equipesMembros: [] };

describe('mapearMedicos', () => {
  it('cadastro com a chave do redo-one, e-mail minúsculo e função conhecida', () => {
    const { tabelas, avisos } = mapearMedicos({
      ...vazio,
      medicos: [
        medico('m1', 'Dra. Ana Lúcia', { email: ' Ana@Clinica.com ', crm: '123', idMobilemed: 77 }),
        medico('m2', 'Dr. Bruno', { funcao: 'Médico' }),
      ],
    });

    expect(tabelas.medicos[0]).toMatchObject({
      id: idDoLegado('medicos', 'm1'),
      nome: 'Dra. Ana Lúcia',
      chaveNormalizada: 'ana lucia',
      email: 'ana@clinica.com',
      crm: '123',
      idMobilemed: 77,
      funcao: 'STAFF',
      nivelId: null,
    });
    expect(tabelas.medicos[1]?.funcao).toBeNull();
    expect(avisos).toContainEqual({
      tabela: 'medicos',
      item: 'Dr. Bruno',
      motivo: 'Função "Médico" não é STAFF nem FELLOW: ficou vazia.',
    });
  });

  it('o médico oculto nos painéis do dashboards-one fica com oculto_dashboards', () => {
    const { tabelas } = mapearMedicos({
      ...vazio,
      medicos: [medico('m1', 'Dr. Rodrigo Vaz de Lima'), medico('m2', 'Dra. Carla')],
    });

    expect(tabelas.medicos.map((m) => m.ocultoDashboards)).toEqual([true, false]);
  });

  it('pagamento à parte, só para quem tem algum dado; SIM/NÃO vira booleano', () => {
    const { tabelas } = mapearMedicos({
      ...vazio,
      medicos: [
        medico('m1', 'Ana', {
          cpf: '123.456.789-09',
          nomeEmpresa: 'Ana Radiologia',
          socio: 'SIM',
          optanteSimples: 'NÃO',
        }),
        medico('m2', 'Bruno'),
      ],
    });

    expect(tabelas.medicosDadosPagamento).toEqual([
      expect.objectContaining({
        medicoId: idDoLegado('medicos', 'm1'),
        cpf: '12345678909',
        razaoSocial: 'Ana Radiologia',
        socio: true,
        optanteSimples: false,
      }),
    ]);
  });

  it('apelido igual ao nome do médico não é migrado; os outros guardam a origem', () => {
    const { tabelas } = mapearMedicos({
      ...vazio,
      medicos: [medico('m1', 'Dra. Ana Lucia')],
      aliases: [
        {
          id: 'a1',
          medicoId: 'm1',
          nomeOrigem: 'ANA LUCIA',
          tipoOrigem: 'volumetria',
          verificadoManualmente: false,
          observacoes: null,
        },
        {
          id: 'a2',
          medicoId: 'm1',
          nomeOrigem: 'Ana L. Souza',
          tipoOrigem: 'repasse_upload',
          verificadoManualmente: true,
          observacoes: null,
        },
      ],
    });

    expect(tabelas.medicosAliases).toEqual([
      expect.objectContaining({
        medicoId: idDoLegado('medicos', 'm1'),
        nomeOrigem: 'Ana L. Souza',
        origem: 'repasse_upload',
        verificadoManualmente: true,
      }),
    ]);
  });

  it('equipes e membros com os ids do redo-one', () => {
    const { tabelas } = mapearMedicos({
      ...vazio,
      medicos: [medico('m1', 'Ana')],
      equipes: [
        {
          id: 'e1',
          nome: 'Equipe 1',
          descricao: null,
          cor: null,
          ordem: 1,
          ativo: true,
          plantao: true,
        },
      ],
      equipesMembros: [
        { equipeId: 'e1', medicoId: 'm1' },
        { equipeId: 'e1', medicoId: 'sumiu' },
      ],
    });

    expect(tabelas.equipes[0]).toMatchObject({ nome: 'Equipe 1', plantao: true, ordem: 1 });
    expect(tabelas.equipesMembros).toEqual([
      { equipeId: idDoLegado('equipes', 'e1'), medicoId: idDoLegado('medicos', 'm1') },
    ]);
  });
});
