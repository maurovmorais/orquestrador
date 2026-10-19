import type { AppData } from '../types';
import { uid } from '../lib/id';
import { automacaoEmUso } from './rules';

export const addAutomation = (d: AppData, nome: string, desc: string): AppData => ({
  ...d,
  automations: [...d.automations, { id: uid(), nome, desc, versao: '1.0.0', criada: new Date().toISOString() }],
});

/** Remove a automação, seus agendamentos e seus ativos locais; o histórico de execuções é mantido. */
export const removeAutomation = (d: AppData, id: string): AppData =>
  automacaoEmUso(d, id)
    ? d
    : { ...d, automations: d.automations.filter((a) => a.id !== id), schedules: d.schedules.filter((s) => s.a !== id), assets: d.assets.filter((x) => !(x.escopo === 'local' && x.automacaoId === id)), fila: d.fila.filter((x) => x.a !== id) };
