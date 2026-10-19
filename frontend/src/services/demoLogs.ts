import type { LogLine, RunStatus } from '../types';

const l = (nivel: LogLine['nivel'], msg: string): LogLine => ({ t: new Date().toISOString(), nivel, origem: 'automação', msg });

/** Somente demonstração: simula as linhas de log que a própria automação enviaria. */
export function linhasDemo(status: RunStatus): LogLine[] {
  const base = [
    l('INFO', 'Initialization Finished'), l('INFO', 'Loop Station Started'),
    l('INFO', 'Executando item 1 de 1'), l('INFO', 'Process Started'), l('INFO', 'Process Finished'),
  ];
  if (status === 'falha') return [...base.slice(0, 3), l('WARN', 'Tentativa 1 de 3 falhou'), l('ERROR', 'Exceção ao processar o item 1: elemento não encontrado')];
  if (status === 'concluída') return [...base, l('INFO', 'Task finalizada com sucesso.')];
  return base.slice(0, 3);
}
