import type {
  ExameDaFila,
  ExameEmMaos,
  LeituraFila,
  PacienteDaFila,
} from '../../application/ports/fila-exames';

/**
 * Fila SINTÉTICA da MobileMed, para a rodada funcionar antes do mapeamento da API: exames e
 * clientes reais do catálogo, pacientes fictícios, prioridades nas grafias da MobileMed na
 * proporção da produção e prazos plausíveis por prioridade. Determinística pela semente (mesma
 * semente e mesma base, mesma fila). Os números abaixo descrevem dado de teste, não regra de
 * negócio: a regra (de-para, urgência, recebimento) continua vindo das tabelas.
 */

export interface AmostraCatalogo {
  /** Exames ativos do catálogo, com o código da modalidade e o nome da especialidade. */
  exames: { nome: string; modalidade: string | null; especialidade: string | null }[];
  /** Nomes dos clientes ativos (o nome na MobileMed). */
  clientes: string[];
  /** Contas na MobileMed dos médicos habilitados (`medicos.id_mobilemed`). */
  medicosMobilemed: number[];
}

export interface OpcoesFilaSintetica {
  amostra: AmostraCatalogo;
  tamanho: number;
  semente: number;
  /** Instante de referência: realização e prazos são relativos a ele. */
  base: Date;
}

/** Grafia, peso (em mil) e prazo em horas depois da realização ([mínimo, máximo]). */
const PRIORIDADES: { grafia: string; peso: number; prazoHoras: [number, number] }[] = [
  { grafia: 'Rotina', peso: 775, prazoHoras: [48, 72] },
  { grafia: 'Plantão', peso: 100, prazoHoras: [6, 12] },
  { grafia: 'Urgência', peso: 85, prazoHoras: [2, 4] },
  { grafia: 'Emergência', peso: 10, prazoHoras: [1, 2] },
  { grafia: 'Ambulatório', peso: 15, prazoHoras: [24, 24] },
  { grafia: 'Internado', peso: 12, prazoHoras: [24, 24] },
  // Grafia sem de-para: exercita o aviso de `grafiasSemDePara`.
  { grafia: 'Eletivo', peso: 3, prazoHoras: [72, 96] },
];

const NOMES = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Fábio', 'Gabriela', 'Heitor', 'Íris'];
const MAIS_NOMES = ['João', 'Karina', 'Lucas', 'Marta', 'Nuno', 'Olívia', 'Paulo', 'Rita'];
const SOBRENOMES = ['Fictício', 'Exemplo', 'Teste', 'Modelo', 'Simulado', 'Amostra', 'Ensaio'];

const HORA = 3_600_000;

/** mulberry32: gerador pseudoaleatório pequeno e determinístico. */
function sorteador(semente: number) {
  let s = semente >>> 0;
  const proximo = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  return {
    numero: proximo,
    inteiro: (min: number, max: number) => min + Math.floor(proximo() * (max - min + 1)),
    um: <T>(lista: readonly T[]): T => lista[Math.floor(proximo() * lista.length)] as T,
    chance: (p: number) => proximo() < p,
  };
}

export function gerarFilaSintetica(o: OpcoesFilaSintetica): LeituraFila {
  const r = sorteador(o.semente);
  const exames = o.amostra.exames.length
    ? o.amostra.exames
    : [{ nome: 'EXAME SINTETICO', modalidade: null, especialidade: null }];
  const clientes = o.amostra.clientes.length ? o.amostra.clientes : ['CLIENTE SINTETICO'];
  const pesoTotal = PRIORIDADES.reduce((s, p) => s + p.peso, 0);
  const prioridade = () => {
    let x = r.numero() * pesoTotal;
    for (const p of PRIORIDADES) {
      x -= p.peso;
      if (x < 0) return p;
    }
    return PRIORIDADES[0] as (typeof PRIORIDADES)[number];
  };
  const novoPaciente = (n: number): PacienteDaFila => ({
    codigo: String(500_000 + n),
    nome: `${r.um(NOMES)} ${r.um(MAIS_NOMES)} ${r.um(SOBRENOMES)}`,
  });

  const semMedico: ExameDaFila[] = [];
  let pacientes = 0;
  while (semMedico.length < o.tamanho) {
    const paciente = novoPaciente(pacientes++);
    const primeiro = r.um(exames);
    // ~15% dos pacientes têm um pacote: 2 ou 3 exames da mesma especialidade.
    const doPacote = exames.filter((e) => e.especialidade === primeiro.especialidade);
    const quantos = r.chance(0.15) && doPacote.length > 1 ? r.inteiro(2, 3) : 1;
    const unidade = r.chance(0.03) ? `CLINICA SEM CADASTRO ${r.inteiro(1, 9)}` : r.um(clientes);
    const p = prioridade();
    const realizadoEm = new Date(o.base.getTime() - r.inteiro(10, 36 * 60) * 60_000);
    for (let i = 0; i < quantos && semMedico.length < o.tamanho; i++) {
      const exame = i === 0 ? primeiro : r.um(doPacote);
      const foraDoCatalogo = r.chance(0.03);
      semMedico.push({
        idExame: String(9_000_000 + semMedico.length),
        prioridade: p.grafia,
        estudo: foraDoCatalogo ? `ESTUDO SINTETICO SEM CADASTRO ${r.inteiro(1, 9)}` : exame.nome,
        unidade,
        modalidade: exame.modalidade,
        especialidade: exame.especialidade,
        laudos: r.chance(0.05) ? 2 : 1,
        realizadoEm,
        entradaEm: new Date(realizadoEm.getTime() + r.inteiro(5, 90) * 60_000),
        prazo: new Date(realizadoEm.getTime() + r.inteiro(...p.prazoHoras) * HORA),
        status: r.chance(0.02) ? 'PRE-LAUDADO' : 'NOVO',
        paciente,
      });
    }
  }

  const emMaos: ExameEmMaos[] = [];
  if (o.amostra.medicosMobilemed.length) {
    const quantos = Math.ceil(o.tamanho / 4);
    for (let i = 0; i < quantos; i++) {
      // Um terço é de paciente que também está na fila: exercita a aderência.
      const daFila = r.chance(0.33) ? r.um(semMedico) : null;
      const exame = r.um(exames);
      emMaos.push({
        idExame: String(8_000_000 + i),
        medicoIdMobilemed: r.um(o.amostra.medicosMobilemed),
        estudo: daFila?.estudo ?? exame.nome,
        unidade: daFila?.unidade ?? r.um(clientes),
        modalidade: daFila?.modalidade ?? exame.modalidade,
        especialidade: daFila?.especialidade ?? exame.especialidade,
        laudos: 1,
        paciente: daFila?.paciente ?? novoPaciente(pacientes++),
      });
    }
  }
  return { semMedico, emMaos };
}
