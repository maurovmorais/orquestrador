import type { RunStatus, StatusFila } from '../types';

const CLASSES: Record<string, string> = {
  'concluída': 'ok', 'em execução': 'run', cancelando: 'run', online: 'run', falha: 'bad', abortada: 'warn',
  SUCESSO: 'ok', PROCESSANDO: 'run', FALHA: 'bad', AGUARDANDO: 'warn', NEW: 'new', // CANCELADO: cinza (padrão)
};

export function Badge({ status }: { status: RunStatus | StatusFila | 'online' | 'offline' }) {
  return <span className={`badge ${CLASSES[status] ?? ''}`}>{status}</span>;
}
