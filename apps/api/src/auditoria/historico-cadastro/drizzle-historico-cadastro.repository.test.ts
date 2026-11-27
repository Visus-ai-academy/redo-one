import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../database/database';
import * as schema from '../../database/schema';
import { DrizzleHistoricoCadastroRepository } from './drizzle-historico-cadastro.repository';
import type { AlvoHistorico } from './historico-cadastro.repository';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('repositório do histórico dos cadastros', () => {
  let pool: Pool;
  let db: Database;
  let repo: DrizzleHistoricoCadastroRepository;
  let carla: string;
  let conta: string;
  let ana: string;
  let bruno: string;
  let nivel: string;
  let neuro: string;
  let cliente: string;
  let outroCliente: string;
  let exame: string;
  let outroExame: string;
  let deParaAtual: string;
  /** Evento por apelido → id. */
  const ev: Record<string, string> = {};
  let minuto = 0;

  const pagina = { pagina: 1, porPagina: 50 };
  const apelidos = (itens: { id: string }[]) =>
    itens.map((i) => Object.keys(ev).find((k) => ev[k] === i.id));
  const medico = (
    id: string,
    incluir: Partial<{ pagamento: boolean; distribuicao: boolean; acesso: boolean }> = {},
  ): AlvoHistorico => ({
    cadastro: 'medico',
    id,
    incluir: { pagamento: false, distribuicao: false, acesso: false, ...incluir },
  });

  async function evento(
    apelido: string,
    dados: {
      entidade: string;
      entidadeId: string;
      acao: string;
      antes?: Record<string, unknown>;
      depois?: Record<string, unknown>;
      atorTipo?: string;
      atorId?: string | null;
    },
  ) {
    minuto += 1;
    const [linha] = await db
      .insert(schema.eventosAuditoria)
      .values({
        ocorridoEm: new Date(Date.UTC(2026, 10, 17, 12, minuto)),
        atorTipo: dados.atorTipo ?? 'usuario',
        atorId: dados.atorId === undefined ? carla : dados.atorId,
        entidade: dados.entidade,
        entidadeId: dados.entidadeId,
        acao: dados.acao,
        antes: dados.antes ?? null,
        depois: dados.depois ?? null,
      })
      .returning();
    ev[apelido] = linha?.id ?? '';
  }

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../drizzle') });
    repo = new DrizzleHistoricoCadastroRepository(db);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate table eventos_auditoria, equipes, exames_de_para_valores, exames, clientes, especialidades, niveis_medico, medicos, usuarios, papeis, categorias_financeiras cascade`,
    );
    minuto = 0;
    for (const k of Object.keys(ev)) delete ev[k];
    const usuarios = await db
      .insert(schema.usuarios)
      .values([
        { nome: 'Carla Lima', email: 'carla@empresa.com.br' },
        { nome: 'Dr. Ana (portal)', email: 'ana@clinica.com.br' },
      ])
      .returning();
    carla = usuarios[0]?.id ?? '';
    conta = usuarios[1]?.id ?? '';
    const medicos = await db
      .insert(schema.medicos)
      .values([
        { nome: 'Ana Reis', chaveNormalizada: 'ana reis' },
        { nome: 'Bruno Alves', chaveNormalizada: 'bruno alves' },
      ])
      .returning();
    ana = medicos[0]?.id ?? '';
    bruno = medicos[1]?.id ?? '';
    const [n] = await db.insert(schema.niveisMedico).values({ nome: 'Pleno' }).returning();
    nivel = n?.id ?? '';
    const [e] = await db.insert(schema.especialidades).values({ nome: 'NEURO' }).returning();
    neuro = e?.id ?? '';
    const clientes = await db
      .insert(schema.clientes)
      .values([
        { nome: 'CLINICA SOL', chaveNormalizada: 'clinica sol' },
        { nome: 'HOSPITAL LUA', chaveNormalizada: 'hospital lua' },
      ])
      .returning();
    cliente = clientes[0]?.id ?? '';
    outroCliente = clientes[1]?.id ?? '';
    const exames = await db
      .insert(schema.exames)
      .values([
        { nome: 'TC CRANIO', chaveNormalizada: 'tc cranio' },
        { nome: 'RX TORAX', chaveNormalizada: 'rx torax' },
      ])
      .returning();
    exame = exames[0]?.id ?? '';
    outroExame = exames[1]?.id ?? '';
    const [dp] = await db
      .insert(schema.examesDeParaValores)
      .values({
        estudoDescricao: 'TC CRANIO 3D',
        chaveNormalizada: 'tc cranio 3d',
        valores: 2,
        exameId: exame,
      })
      .returning();
    deParaAtual = dp?.id ?? '';
  });

  describe('médico', () => {
    beforeEach(async () => {
      await evento('criado', {
        entidade: 'medico',
        entidadeId: ana,
        acao: 'criado',
        depois: { nome: 'Ana Reis', nivelId: nivel },
      });
      await evento('outroMedico', { entidade: 'medico', entidadeId: bruno, acao: 'alterado' });
      await evento('pagLido', { entidade: 'medico', entidadeId: ana, acao: 'pagamento_lido' });
      await evento('pagAlterado', {
        entidade: 'medico',
        entidadeId: ana,
        acao: 'pagamento_alterado',
        antes: { cpf: '***01' },
        depois: { cpf: '***99' },
      });
      await evento('robo', {
        entidade: 'medico_distribuicao',
        entidadeId: ana,
        acao: 'alterado',
        antes: { habilitadoRobo: false },
        depois: { habilitadoRobo: true },
      });
      await evento('arranjos', {
        entidade: 'arranjos_medico',
        entidadeId: ana,
        acao: 'alterado',
        antes: { arranjos: [] },
        depois: { arranjos: [{ especialidadeId: neuro, clienteIds: [cliente] }] },
      });
      await evento('arranjosOutro', {
        entidade: 'arranjos_medico',
        entidadeId: bruno,
        acao: 'alterado',
      });
      await evento('convite', {
        entidade: 'usuario',
        entidadeId: conta,
        acao: 'convidado',
        depois: { nome: 'Dr. Ana (portal)', medicoId: ana },
      });
      await evento('desligado', {
        entidade: 'usuario',
        entidadeId: conta,
        acao: 'medico_desvinculado',
        antes: { medicoId: ana },
      });
      await evento('outroUsuario', {
        entidade: 'usuario',
        entidadeId: conta,
        acao: 'papel_trocado',
        antes: { papelId: 'x' },
      });
    });

    it('só com medicos.ver: o cadastro, do mais novo, sem pagamento, distribuição nem acesso', async () => {
      const r = await repo.listar(medico(ana), pagina);
      expect(apelidos(r.itens)).toEqual(['criado']);
      expect(r.total).toBe(1);
    });

    it('com cada permissão, entra a parte dela', async () => {
      expect(apelidos((await repo.listar(medico(ana, { pagamento: true }), pagina)).itens)).toEqual(
        ['pagAlterado', 'pagLido', 'criado'],
      );
      expect(
        apelidos((await repo.listar(medico(ana, { distribuicao: true }), pagina)).itens),
      ).toEqual(['arranjos', 'robo', 'criado']);
      expect(apelidos((await repo.listar(medico(ana, { acesso: true }), pagina)).itens)).toEqual([
        'desligado',
        'convite',
        'criado',
      ]);
    });

    it('pagina e devolve quem fez e os nomes dos ids, inclusive dentro dos arranjos', async () => {
      const tudo = medico(ana, { pagamento: true, distribuicao: true, acesso: true });
      const r = await repo.listar(tudo, { pagina: 2, porPagina: 4 });

      expect(r.total).toBe(7);
      expect(apelidos(r.itens)).toEqual(['pagAlterado', 'pagLido', 'criado']);
      expect(r.itens[0]?.ator).toEqual({ tipo: 'usuario', nome: 'Carla Lima' });
      expect(r.nomes).toEqual({ [nivel]: 'Pleno' });

      const primeira = await repo.listar(tudo, { pagina: 1, porPagina: 4 });
      expect(primeira.nomes).toMatchObject({
        [neuro]: 'NEURO',
        [cliente]: 'CLINICA SOL',
        [ana]: 'Ana Reis',
        [conta]: 'Dr. Ana (portal)',
      });
    });

    it('entra e sai de equipe, só quando a participação dele muda, com o nome da equipe', async () => {
      const [equipe] = await db.insert(schema.equipes).values({ nome: 'Equipe 2' }).returning();
      const equipeId = equipe?.id ?? '';
      const apagada = '00000000-0000-4000-8000-0000000000aa';
      await evento('equipeCriada', {
        entidade: 'equipe',
        entidadeId: equipeId,
        acao: 'criado',
        depois: { nome: 'Equipe 2', medicoIds: [ana], plantao: false },
      });
      await evento('outroEntrou', {
        entidade: 'equipe',
        entidadeId: equipeId,
        acao: 'alterado',
        antes: { medicoIds: [ana] },
        depois: { medicoIds: [ana, bruno] },
      });
      await evento('plantao', {
        entidade: 'equipe',
        entidadeId: equipeId,
        acao: 'alterado',
        antes: { plantao: false },
        depois: { plantao: true },
      });
      await evento('anaSaiu', {
        entidade: 'equipe',
        entidadeId: equipeId,
        acao: 'alterado',
        antes: { medicoIds: [ana, bruno] },
        depois: { medicoIds: [bruno] },
      });
      await evento('apagada', {
        entidade: 'equipe',
        entidadeId: apagada,
        acao: 'excluido',
        antes: { nome: 'Equipe Velha', medicoIds: [ana] },
      });

      const r = await repo.listar(medico(ana), pagina);

      expect(apelidos(r.itens)).toEqual(['apagada', 'anaSaiu', 'equipeCriada', 'criado']);
      expect(r.itens.slice(0, 3)).toMatchObject([
        {
          entidade: 'equipe',
          entidadeId: apagada,
          acao: 'equipe_excluida',
          antes: null,
          depois: null,
        },
        {
          entidade: 'equipe',
          entidadeId: equipeId,
          acao: 'membro_saiu',
          antes: null,
          depois: null,
        },
        { entidade: 'equipe', entidadeId: equipeId, acao: 'membro_entrou' },
      ]);
      expect(r.nomes).toMatchObject({ [equipeId]: 'Equipe 2', [apagada]: 'Equipe Velha' });
      expect(apelidos((await repo.listar(medico(bruno), pagina)).itens)).toEqual([
        'outroEntrou',
        'outroMedico',
      ]);
    });

    it('robô e sistema sem usuário aparecem pelo tipo', async () => {
      await evento('sistema', {
        entidade: 'medico',
        entidadeId: ana,
        acao: 'alterado',
        atorTipo: 'sistema',
        atorId: null,
      });
      const r = await repo.listar(medico(ana), pagina);
      expect(r.itens[0]?.ator).toEqual({ tipo: 'sistema', nome: null });
    });
  });

  it('cliente: só os eventos do cliente', async () => {
    await evento('criado', {
      entidade: 'cliente',
      entidadeId: cliente,
      acao: 'criado',
      depois: { nome: 'CLINICA SOL' },
    });
    await evento('alias', { entidade: 'cliente', entidadeId: cliente, acao: 'alias_criado' });
    await evento('outro', { entidade: 'cliente', entidadeId: outroCliente, acao: 'alterado' });
    await evento('exameMesmoId', { entidade: 'exame', entidadeId: cliente, acao: 'alterado' });

    const r = await repo.listar({ cadastro: 'cliente', id: cliente }, pagina);
    expect(apelidos(r.itens)).toEqual(['alias', 'criado']);
  });

  it('fornecedor: só os eventos dele, com o nome da categoria padrão', async () => {
    const [categoria] = await db
      .insert(schema.categoriasFinanceiras)
      .values({ tipo: 'despesa', nome: 'Contabilidade' })
      .returning();
    const fornecedor = '00000000-0000-4000-8000-0000000000f1';
    await evento('criado', {
      entidade: 'fornecedor',
      entidadeId: fornecedor,
      acao: 'criado',
      depois: { razaoSocial: 'Ômega', categoriaPadraoId: categoria?.id },
    });
    await evento('outro', {
      entidade: 'fornecedor',
      entidadeId: '00000000-0000-4000-8000-0000000000f2',
      acao: 'alterado',
    });
    await evento('clienteMesmoId', {
      entidade: 'cliente',
      entidadeId: fornecedor,
      acao: 'alterado',
    });

    const r = await repo.listar({ cadastro: 'fornecedor', id: fornecedor }, pagina);
    expect(apelidos(r.itens)).toEqual(['criado']);
    expect(r.nomes[categoria?.id ?? '']).toBe('Contabilidade');
  });

  it('exame: o cadastro e os valores fora do padrão ligados a ele, pela tabela ou pelo evento', async () => {
    await evento('criado', { entidade: 'exame', entidadeId: exame, acao: 'criado' });
    await evento('dpAtualValor', {
      entidade: 'de_para_valor_exame',
      entidadeId: deParaAtual,
      acao: 'alterado',
      antes: { valores: 1 },
      depois: { valores: 2 },
    });
    const apagado = '00000000-0000-4000-8000-000000000001';
    await evento('dpApagado', {
      entidade: 'de_para_valor_exame',
      entidadeId: apagado,
      acao: 'excluido',
      antes: { estudoDescricao: 'TC CRANIO X', exameId: exame },
    });
    await evento('dpOutro', {
      entidade: 'de_para_valor_exame',
      entidadeId: '00000000-0000-4000-8000-000000000002',
      acao: 'criado',
      depois: { exameId: outroExame },
    });
    await evento('outroExame', { entidade: 'exame', entidadeId: outroExame, acao: 'alterado' });
    await evento('quebra', { entidade: 'quebra_estudo', entidadeId: exame, acao: 'criado' });

    const r = await repo.listar({ cadastro: 'exame', id: exame }, pagina);
    expect(apelidos(r.itens)).toEqual(['dpApagado', 'dpAtualValor', 'criado']);
    expect(r.nomes[exame]).toBe('TC CRANIO');
  });
});
