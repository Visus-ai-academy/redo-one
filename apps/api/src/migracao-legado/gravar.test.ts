import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../database/database';
import * as schema from '../database/schema';
import { gravarMigracao } from './gravar';
import { mapearCatalogo } from './mapear-catalogo';
import { mapearMedicos } from './mapear-medicos';

const url = process.env.TEST_DATABASE_URL;

const lista = { descricao: null, cor: null, ordem: 0, ativo: true };
const cliente = (id: string, nome: string) => ({
  id,
  nome,
  nomeFantasia: 'PRN',
  razaoSocial: 'PRN LTDA',
  cnpj: '11222333000181',
  cpf: null,
  tipoPessoa: 'PJ',
  contratadoId: 'ct-tele',
  ativo: true,
  observacoes: null,
});

const catalogo = mapearCatalogo({
  modalidades: [{ id: 'mo-ct', nome: 'CT', ...lista }],
  especialidades: [{ id: 'es-neuro', nome: 'NEURO', ...lista }],
  subespecialidades: [],
  subespecialidadesEspecialidades: [],
  categorias: [],
  prioridades: [],
  prioridadesUrgentes: [],
  prioridadesDePara: [],
  especialidadeRegras: [],
  exames: [
    {
      id: 'ex-1',
      nome: 'TC DE CRÂNIO',
      codigoExame: null,
      descricao: null,
      modalidade: 'CT',
      especialidade: 'NEURO',
      subespecialidade: null,
      categoria: null,
      prioridade: null,
      permiteQuebra: false,
      exigeRevisaoManual: false,
      ativo: true,
    },
  ],
  regrasQuebra: [],
  examesForaPadrao: [],
  contratados: [
    {
      id: 'ct-tele',
      razaoSocial: 'TELEIMAGEM',
      cnpj: null,
      endereco: null,
      cidade: null,
      uf: null,
      cep: null,
      contratadoRepasseId: 'ct-tele',
      ativo: true,
    },
  ],
  clientes: [cliente('cl-a', 'PRN TELE_ARARAQUARA'), cliente('cl-b', 'PRN TELE_MARABA')],
  clientesOcultos: [],
  clienteNomeAliases: [],
  clienteApelidos: [
    {
      id: 'ap-1',
      padrao: 'PRN TELE_',
      tipo: 'PREFIXO',
      destino: 'PRN',
      ativo: true,
      observacoes: null,
    },
  ],
});
const medicos = mapearMedicos({
  medicos: [
    {
      id: 'm1',
      nome: 'Dra. Ana',
      crm: null,
      idMobilemed: 7,
      email: null,
      telefone: null,
      ativo: true,
      senior: false,
      fellowship: false,
      funcao: 'STAFF',
      nivel: null,
      dataInicioVinculo: '2024-03-01',
      observacoes: null,
      cpf: null,
      cnpj: null,
      nomeEmpresa: null,
      tipoChavePix: null,
      chavePix: null,
      socio: 'SIM',
      optanteSimples: null,
      omieCodigoFornecedor: null,
    },
  ],
  aliases: [],
  equipes: [{ id: 'e1', nome: 'Equipe 1', ...lista, plantao: false }],
  equipesMembros: [{ equipeId: 'e1', medicoId: 'm1' }],
});

describe.skipIf(!url)('gravarMigracao', () => {
  let pool: Pool;
  let db: Database;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../drizzle') });
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate table clientes, contratados, exames, modalidades, especialidades, medicos, equipes cascade`,
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  const contar = async () => {
    const r = await db.execute<{ t: string; n: number }>(sql`
      select 'clientes' t, count(*)::int n from clientes union all
      select 'aliases', count(*)::int from clientes_aliases union all
      select 'exames', count(*)::int from exames union all
      select 'medicos', count(*)::int from medicos union all
      select 'pagamento', count(*)::int from medicos_dados_pagamento union all
      select 'membros', count(*)::int from equipes_membros`);
    return Object.fromEntries(r.rows.map((l) => [l.t, l.n]));
  };

  it('grava tudo com as ligações, e rodar de novo não duplica nada', async () => {
    await gravarMigracao(db, catalogo, medicos);
    const primeira = await contar();
    await gravarMigracao(db, catalogo, medicos);

    expect(await contar()).toEqual(primeira);
    expect(primeira).toEqual({
      clientes: 3,
      aliases: 1,
      exames: 1,
      medicos: 1,
      pagamento: 1,
      membros: 1,
    });
    const unidades = await db.execute<{ nome: string; principal: string }>(sql`
      select u.nome, p.nome principal from clientes u join clientes p on p.id = u.unificado_em_id
      order by u.nome`);
    expect(unidades.rows).toEqual([
      { nome: 'PRN TELE_ARARAQUARA', principal: 'PRN' },
      { nome: 'PRN TELE_MARABA', principal: 'PRN' },
    ]);
  });

  it('valor fora do padrão casa pela grafia: regravar com outro id não quebra a chave única', async () => {
    const valor = {
      id: '00000000-0000-5000-8000-000000000001',
      estudoDescricao: 'Lombar',
      chaveNormalizada: 'lombar',
      valores: 0,
      exameId: null,
      ativo: true,
    };
    const com = (v: typeof valor) => ({
      ...catalogo,
      tabelas: { ...catalogo.tabelas, examesDeParaValores: [v] },
    });

    await gravarMigracao(db, com(valor), medicos);
    await gravarMigracao(
      db,
      com({
        ...valor,
        id: '00000000-0000-5000-8000-000000000002',
        estudoDescricao: 'LOMBAR',
        valores: 1,
      }),
      medicos,
    );

    const linhas = await db.execute<{ estudo_descricao: string; valores: string }>(
      sql`select estudo_descricao, valores from exames_de_para_valores`,
    );
    expect(linhas.rows).toEqual([{ estudo_descricao: 'LOMBAR', valores: '1.00' }]);
  });
});
