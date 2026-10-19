export type RunStatus = 'na fila' | 'em execução' | 'cancelando' | 'concluída' | 'falha' | 'cancelada' | 'abortada';
export interface Machine {
  id: string; nome: string; pareada: boolean; online: boolean; hb: string | null; runner: string;
  /** Uso informado pela API (agendamentos e execuções ativas no servidor). */
  emUso?: { schedules: number; activeJobs: number; automations: number };
}
/** Tipos de parâmetro (equivalem a str, int, float, bool e datetime.date no Python; 'confidencial' é uma string sensível). */
export type TipoParametro = 'string' | 'int' | 'float' | 'bool' | 'data' | 'confidencial';
/** `ativo`: parâmetro desativado não é enviado à automação (no Python a leitura retorna None). Ausente = ativo. */
export interface Parametro { id: string; nome: string; tipo: TipoParametro; valor: string; desc: string; ativo?: boolean }
export interface Automation { id: string; nome: string; desc: string; versao: string; criada: string; parametros?: Parametro[];
  /** Máquinas atreladas (uma ou mais). */ runnerIds?: string[];
  /** A versão atual tem pacote .zip enviado? */ temPacote?: boolean; tamanhoPacote?: number | null }
export interface Run {
  id: string; a: string; m: string; status: RunStatus;
  q: string; i: string | null; f: string | null; resp?: string; modoCancel?: 'elegante' | 'abrupto'; logs?: LogLine[]; versao?: string;
}
export interface Schedule { id: string; a: string; m: string; cron: string; on: boolean; last: string | null }
/** Ativo = valor compartilhado pelas automações do ambiente; usa os mesmos tipos e campos de um parâmetro. */
export interface Asset extends Parametro {
  /** Pasta que agrupa os ativos; o nome é informado à automação por comando Python. */
  pasta: string;
  /** global = todas as automações enxergam; local = somente a automação `automacaoId`. */
  escopo: 'global' | 'local';
  automacaoId?: string;
}
/** Fila de uma automação: cada item é um dicionário com as variáveis usadas no processamento. */
// NEW = inserido pela automação | AGUARDANDO = ia iniciar mas a máquina estava ocupada | PROCESSANDO = em andamento | SUCESSO / FALHA = fim | CANCELADO
export type StatusFila = 'NEW' | 'AGUARDANDO' | 'PROCESSANDO' | 'SUCESSO' | 'FALHA' | 'CANCELADO';
/** `criado` = entrada (ou reentrada) na fila: define a ordem de atendimento FIFO. `atualizado` = última mudança de status/log. */
export interface ItemFila { id: string; a: string; /** JOB (execução) ao qual o item foi incluído; vazio enquanto NEW. */ jobId?: string; item: Record<string, unknown>; status: StatusFila; log: string; criado: string; atualizado: string }
export interface AppData { machines: Machine[]; automations: Automation[]; runs: Run[]; schedules: Schedule[]; assets: Asset[]; fila: ItemFila[] }

/** Workspace = ambiente isolado de um cliente (produção ou testes). Cada um tem seus próprios dados. */
export type Ambiente = 'produção' | 'testes';
export interface Workspace { id: string; cliente: string; ambiente: Ambiente; criado: string }


/** Linha de log de uma execução (enviada pela própria automação/runner; o orquestrador acrescenta eventos). */
export interface LogLine { t: string; nivel: 'INFO' | 'WARN' | 'ERROR'; origem: 'orquestrador' | 'automação' | 'runner'; msg: string }

/** Usuário autenticado. `cliente` vem do cadastro do usuário e é exibido no menu, perto do botão Sair. */
export interface Usuario { login: string; cliente: string }
