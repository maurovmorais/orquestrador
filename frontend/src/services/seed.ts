import type { AppData } from '../types';

const T = (h: string): string => { const [a, b, c] = h.split(':').map(Number); return new Date(2026, 9, 10, a, b, c).toISOString(); };

export const vazio = (): AppData => ({ machines: [], automations: [], runs: [], schedules: [], assets: [], fila: [] });

export const seed = (): AppData => ({
  ...vazio(),
  fila: [
    { id: 'f1', a: 'a1', item: { nome: 'Mauro', idade: 56, salario: '20000.00' }, status: 'SUCESSO', log: 'Item processado com sucesso.', criado: T('14:00:00'), atualizado: T('14:00:09') },
    { id: 'f2', a: 'a1', item: { nome: 'Ana', idade: 34, salario: '8500.00' }, status: 'FALHA', log: 'Erro ao processar o item: elemento não encontrado.', criado: T('14:00:00'), atualizado: T('14:00:20') },
    { id: 'f3', a: 'a1', item: { nome: 'Carlos', idade: 41, salario: '12000.00' }, status: 'NEW', log: 'Item adicionado à fila.', criado: T('14:01:00'), atualizado: T('14:01:00') },
  ],
  machines: [
    { id: 'm1', nome: 'Dev', pareada: false, online: false, hb: T('15:41:45'), runner: '0.1.0' },
    { id: 'm2', nome: 'Dev_Mauro', pareada: true, online: false, hb: T('17:08:11'), runner: '0.1.0' },
  ],
  automations: [
    { id: 'a1', nome: 'ID01', desc: 'Download_Adquirentes', versao: '1.0.0', criada: T('14:07:17') },
    { id: 'a2', nome: 'ID02', desc: 'Tratar_Dados', versao: '1.1.6', criada: T('11:35:04') },
    { id: 'a3', nome: 'ID03', desc: 'LanctoRPS', versao: '1.0.0', criada: T('14:24:31') },
  ],
  runs: [
    { id: 'r1', a: 'a3', m: 'm2', status: 'cancelada', q: T('14:25:05'), i: T('14:25:15'), f: T('14:37:58') },
    { id: 'r2', a: 'a2', m: 'm2', status: 'concluída', q: T('14:22:56'), i: T('14:22:57'), f: T('14:23:06') },
    { id: 'r3', a: 'a1', m: 'm2', status: 'concluída', q: T('14:08:12'), i: T('14:08:13'), f: T('14:21:04') },
  ],
});
