/** Cliente HTTP da API. Em desenvolvimento o Vite encaminha /api para o backend (porta 3000). */
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const mensagem = (e: unknown): string => (e instanceof Error ? e.message : 'Erro inesperado.');

interface Opcoes { method?: string; body?: unknown; workspaceId?: string; /** envia o arquivo como corpo binário (upload do pacote .zip) */ arquivo?: File }

export async function api<T>(caminho: string, o: Opcoes = {}): Promise<T> {
  const json = o.body !== undefined;
  const r = await fetch(`/api${caminho}`, {
    method: o.method ?? (json || o.arquivo ? 'POST' : 'GET'),
    credentials: 'include', // cookie de sessão httpOnly
    headers: {
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...(o.arquivo ? { 'Content-Type': 'application/zip' } : {}),
      ...(o.workspaceId ? { 'x-workspace-id': o.workspaceId } : {}),
    },
    body: o.arquivo ?? (json ? JSON.stringify(o.body) : undefined),
  });
  const dados = (await r.json().catch(() => null)) as { error?: string } | null;
  if (!r.ok) throw new ApiError(r.status, dados?.error ?? 'Não foi possível concluir a operação.');
  return dados as T;
}
