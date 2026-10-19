import { useCallback, useEffect, useState } from 'react';
import { DataTable } from '../components/DataTable';
import { useData } from '../context/DataContext';
import { cronValido } from '../lib/cron';
import { fmtData } from '../lib/format';
import { mensagem } from '../services/api';
import { ativarAgendamento, criarAgendamento, excluirAgendamentos, listarAgendamentos, type Agendamento } from '../services/recursos';
import type { Machine } from '../types';

export default function Agendamentos() {
  const { data: d, atual, recarregarRecursos } = useData();
  const [itens, setItens] = useState<Agendamento[]>([]);
  const [a, setA] = useState('');
  const [escolhida, setEscolhida] = useState('');
  const [cron, setCron] = useState('');
  const [erro, setErro] = useState('');

  const aut = d.automations.find((x) => x.id === a);
  const maqAut = (aut?.runnerIds ?? []).map((id) => d.machines.find((x) => x.id === id)).filter((x): x is Machine => !!x);
  const m = maqAut.some((x) => x.id === escolhida) ? escolhida : maqAut[0]?.id ?? '';

  const carregar = useCallback(async () => {
    try { setItens(await listarAgendamentos(atual.id)); } catch (e) { setErro(mensagem(e)); }
  }, [atual.id]);
  useEffect(() => { void carregar(); }, [carregar]);

  /** Chama a API, recarrega a lista (e o uso das máquinas) e mostra o erro, se houver. */
  const agir = async (fn: () => Promise<unknown>) => {
    setErro('');
    try { await fn(); await carregar(); await recarregarRecursos(); } catch (e) { setErro(mensagem(e)); }
  };
  const adicionar = () => {
    if (!a || !m) return setErro('Selecione uma automação que tenha máquina atrelada.');
    if (!cronValido(cron)) return setErro('Expressão cron inválida (use 5 campos, ex.: 0 6 * * *).');
    void agir(async () => { await criarAgendamento(atual.id, a, m, cron.trim()); setA(''); setCron(''); });
  };

  return (
    <>
      <h1>Agendamentos</h1>
      <div className="card" style={{ marginBottom: '1.375rem', maxWidth: 900 }}>
        <h2 style={{ marginTop: 0 }}>Novo agendamento</h2>
        <div className="bar" style={{ margin: 0 }}>
          <select value={a} onChange={(e) => setA(e.target.value)}>
            <option value="">Automação…</option>
            {d.automations.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
          </select>
          {aut && (maqAut.length ? (
            <select value={m} aria-label="Máquina" onChange={(e) => setEscolhida(e.target.value)}>
              {maqAut.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
            </select>
          ) : <span style={{ fontSize: '0.875rem', color: 'var(--muted)', alignSelf: 'center' }}>Automação sem máquina atrelada.</span>)}
          <input placeholder="Cron (ex.: 0 6 * * *)" value={cron} onChange={(e) => setCron(e.target.value)} />
          <button className="btn" onClick={adicionar}>Adicionar</button>
        </div>
        {erro && <p className="err" style={{ margin: '0.625rem 0 0' }}>{erro}</p>}
      </div>
      <DataTable cols={['Automação', 'Máquina', 'Cron', 'Ativado', 'Última execução', '']} hasRows={itens.length > 0} empty="Nenhum agendamento.">
        {itens.map((s) => (
          <tr key={s.id}>
            <td>{s.automacao}</td><td>{s.maquina ?? '—'}</td><td><code>{s.cron}</code></td>
            <td><input type="checkbox" checked={s.ativo} aria-label={`Ativar agendamento de ${s.automacao}`} onChange={() => void agir(() => ativarAgendamento(atual.id, s.id, !s.ativo))} /></td>
            <td>{fmtData(s.ultima)}</td>
            <td><button className="btn red sm" onClick={() => void agir(() => excluirAgendamentos(atual.id, [s.id]))}>Excluir</button></td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}
