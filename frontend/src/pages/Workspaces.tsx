import { useState } from 'react';
import { DataTable } from '../components/DataTable';
import { useData } from '../context/DataContext';
import { motivoNaoExcluir, nomeAmbiente } from '../domain/workspaces';
import { fmtData } from '../lib/format';
import type { Ambiente } from '../types';

export default function Workspaces() {
  const { workspaces, atual, contagem, selecionar, criar, excluir } = useData();
  const [cliente, setCliente] = useState('');
  const [ambiente, setAmbiente] = useState<Ambiente>('produção');
  const [erro, setErro] = useState('');
  const [excluindo, setExcluindo] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const adicionar = async () => {
    if (!cliente.trim()) return setErro('Informe o nome do cliente.');
    setOcupado(true);
    const e = await criar(cliente, ambiente);
    setOcupado(false);
    if (e) return setErro(e);
    setCliente(''); setErro('');
  };
  const confirmar = async (id: string) => { setOcupado(true); setErro(await excluir(id)); setOcupado(false); setExcluindo(null); };

  return (
    <>
      <h1>Ambientes</h1>
      <p style={{ color: 'var(--muted)', margin: '-10px 0 20px' }}>
        Cada ambiente é isolado: tem suas próprias máquinas, automações, execuções, agendamentos e ativos.
      </p>
      <div className="card" style={{ marginBottom: 22, maxWidth: 900 }}>
        <h2 style={{ marginTop: 0 }}>Novo ambiente</h2>
        <div className="bar" style={{ margin: 0 }}>
          <input placeholder="Cliente" value={cliente} onChange={(e) => setCliente(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void adicionar()} />
          <select value={ambiente} onChange={(e) => setAmbiente(e.target.value as Ambiente)}>
            <option value="produção">Produção</option><option value="testes">Desenvolvimento</option>
          </select>
          <button className="btn" disabled={ocupado} onClick={() => void adicionar()}>Criar</button>
        </div>
        {erro && <p className="err" style={{ margin: '10px 0 0' }}>{erro}</p>}
      </div>
      <DataTable cols={['Cliente', 'Tipo', 'Criado em', 'Máquinas', 'Automações', '']} hasRows={workspaces.length > 0}>
        {workspaces.map((w) => {
          const c = contagem(w.id);
          const motivo = motivoNaoExcluir(workspaces.length, c.maquinas);
          return (
            <tr key={w.id}>
              <td>{w.cliente}{w.id === atual.id && <span className="badge run" style={{ marginLeft: 8 }}>atual</span>}</td>
              <td><span className={`badge ${w.ambiente === 'produção' ? 'bad' : 'warn'}`}>{nomeAmbiente(w.ambiente)}</span></td>
              <td>{fmtData(w.criado)}</td><td>{c.maquinas}</td><td>{c.automacoes}</td>
              <td className="act"><div>
                {w.id !== atual.id && <button className="btn sec sm" onClick={() => selecionar(w.id)}>Selecionar</button>}
                {excluindo === w.id ? (
                  <>
                    <button className="btn red sm" disabled={ocupado} onClick={() => void confirmar(w.id)}>Confirmar exclusão</button>
                    <button className="btn sec sm" onClick={() => setExcluindo(null)}>Cancelar</button>
                  </>
                ) : (
                  <>
                    <button className="btn sec sm" disabled={!!motivo} onClick={() => setExcluindo(w.id)}>Excluir</button>
                    {motivo && <span style={{ fontSize: 12, color: 'var(--muted)', alignSelf: 'center' }}>{motivo}</span>}
                  </>
                )}
              </div></td>
            </tr>
          );
        })}
      </DataTable>
    </>
  );
}
