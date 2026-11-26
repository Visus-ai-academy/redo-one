import { Client } from 'pg';

/** O que a carga do repasse lê do dashboards-one (nomes como no Prisma de lá). */
export interface LegadoRepasse {
  /** `medicos_valores_repasse`: preço do médico por arranjo (cliente nulo = todos). */
  precos: {
    id: string;
    medicoId: string;
    modalidade: string;
    especialidade: string;
    categoria: string | null;
    prioridade: string;
    valor: number;
    clienteNome: string | null;
    ativo: boolean;
    vigenciaDesde: string | null;
    vigenciaAte: string | null;
    atualizadoEm: Date;
  }[];
  /** `medicos_valores_adicionais`. */
  adicionais: {
    id: string;
    medicoId: string;
    periodo: string;
    dataAdicional: Date;
    valorAdicional: number;
    descricao: string | null;
    tipo: string | null;
    quantidade: number | null;
    valorUnitario: number | null;
    referenciaDe: string | null;
    referenciaAte: string | null;
    criadoEm: Date;
  }[];
  /** `regras_apuracao`. */
  regras: {
    id: string;
    medicoId: string;
    tipo: string;
    descricao: string;
    valor: number;
    divisor: number;
    modalidades: string[];
    especialidades: string[];
    prioridades: string[];
    vigenciaDesde: string;
    vigenciaAte: string | null;
  }[];
  /** Marcas de repasse do cadastro do médico. */
  medicos: {
    id: string;
    nome: string;
    neurologista: boolean;
    repasseSomenteAdicionais: boolean;
    repasseRestricoes: unknown;
  }[];
  contratados: { id: string; contratadoRepasseId: string | null }[];
  tarifas: { tarifaPeerReview: number; tarifaPlantao: number } | null;
}

/** Lê o dashboards-one SÓ PARA LEITURA (transação `READ ONLY`, tempo limite por consulta). */
export async function lerLegadoRepasse(url: string): Promise<LegadoRepasse> {
  const cliente = new Client({ connectionString: url, application_name: 'redo-one-carga-repasse' });
  await cliente.connect();
  try {
    await cliente.query('BEGIN TRANSACTION READ ONLY');
    await cliente.query("SET LOCAL statement_timeout = '120s'");
    const ler = async <T>(sql: string): Promise<T[]> => (await cliente.query(sql)).rows as T[];
    const [tarifas] = await ler<LegadoRepasse['tarifas'] & object>(
      'select "tarifaPeerReview"::float8 "tarifaPeerReview", "tarifaPlantao"::float8 "tarifaPlantao" from configuracoes order by ctid limit 1',
    );
    return {
      precos: await ler(
        `select id, "medicoId", modalidade, especialidade, categoria, prioridade, valor::float8 valor,
          "clienteNome", ativo, "vigenciaDesde", "vigenciaAte", "atualizadoEm"
        from medicos_valores_repasse order by ctid`,
      ),
      adicionais: await ler(
        `select id, "medicoId", periodo, "dataAdicional", "valorAdicional"::float8 "valorAdicional",
          descricao, tipo, quantidade, "valorUnitario"::float8 "valorUnitario", "referenciaDe",
          "referenciaAte", "criadoEm"
        from medicos_valores_adicionais order by ctid`,
      ),
      regras: await ler(
        `select id, "medicoId", tipo, descricao, valor::float8 valor, divisor, modalidades,
          especialidades, prioridades, "vigenciaDesde", "vigenciaAte"
        from regras_apuracao order by ctid`,
      ),
      medicos: await ler(
        `select id, nome, neurologista, "repasseSomenteAdicionais", "repasseRestricoes"
        from medicos order by ctid`,
      ),
      contratados: await ler('select id, "contratadoRepasseId" from contratado order by ctid'),
      tarifas: tarifas ?? null,
    };
  } finally {
    await cliente.query('ROLLBACK').catch(() => undefined);
    await cliente.end();
  }
}
