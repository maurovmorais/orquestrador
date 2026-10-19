import { useState } from 'react';
import { Badge } from '../components/Badge';
import { BarraExclusao } from '../components/BarraExclusao';
import { DataTable } from '../components/DataTable';
import { PairingKeyModal } from '../components/PairingKeyModal';
import { MODO_DEMO } from '../config/env';
import { useData } from '../context/DataContext';
import { usoMaquina } from '../domain/rules';
import { useSelecao } from '../hooks/useSelecao';
import { fmtData } from '../lib/format';
import { mensagem } from '../services/api';
import { criarMaquina, desparearMaquina, excluirMaquinas, gerarChave, simularMaquina } from '../services/recursos';

export default function Maquinas() {
  const { data: d, atual, recarregarRecursos } = useData();
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState('');
  const [chave, setChave] = useState<{ nome: string; chave: string } | null>(null);

  const livres = d.machines.filter((m) => !usoMaquina(d, m.id)).map((m) => m.id);
  const sel = useSelecao(livres);
  const algumaEmUso = livres.length < d.machines.length;

  /** Executa a chamada à API, recarrega a lista e mostra o erro (se houver). */
  const agir = async (fn: () => Promise<unknown>) => {
    setErro('');
    try { await fn(); await recarregarRecursos(); } catch (e) { setErro(mensagem(e)); }
  };
  const adicionar = () => {
    const n = nome.trim();
    if (!n) return;
    if (d.machines.some((m) => m.nome.trim().toLowerCase() === n.toLowerCase())) return setErro('Já existe uma máquina com este nome.');
    void agir(async () => { await criarMaquina(atual.id, n); setNome(''); });
  };
  const excluir = () => agir(async () => {
    const r = await excluirMaquinas(atual.id, sel.selecionados);
    sel.limpar();
    if (r.skipped.length) setErro(r.skipped.map((s) => s.reason).join(' '));
  });
  const gerar = async (id: string, nomeMaquina: string) => {
    setErro('');
    try { setChave({ nome: nomeMaquina, chave: (await gerarChave(atual.id, id)).key }); } catch (e) { setErro(mensagem(e)); }
  };

  return (
    <>
      <h1>Máquinas</h1>
      <div className="bar">
        <input placeholder="Nome da nova máquina" value={nome} onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && adicionar()} style={{ width: 340, maxWidth: '100%' }} />
        <button className="btn" onClick={adicionar}>Adicionar</button>
      </div>
      {erro && <p className="err">{erro}</p>}
      {d.machines.length > 0 && (
        <div className="bar" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            {algumaEmUso ? 'Máquinas em uso (automações atreladas, agendamentos ou execuções ativas) não podem ser selecionadas.' : 'Marque as máquinas que deseja excluir.'}
          </span>
          <BarraExclusao quantidade={sel.selecionados.length} onConfirmar={() => void excluir()} />
        </div>
      )}
      <DataTable cols={['Nome', 'Status', 'Pareada', 'Último heartbeat', 'Runner', '']} hasRows={d.machines.length > 0}
        empty="Nenhuma máquina cadastrada." selecao={d.machines.length ? sel : undefined}>
        {d.machines.map((m) => {
          const uso = usoMaquina(d, m.id);
          return (
            <tr key={m.id}>
              <td><input type="checkbox" aria-label={`Selecionar ${m.nome}`} checked={sel.tem(m.id)} disabled={!!uso}
                title={uso || 'Selecionar para excluir'} onChange={() => sel.alternar(m.id)} /></td>
              <td>{m.nome}</td><td><Badge status={m.online ? 'online' : 'offline'} /></td>
              <td>{m.pareada ? 'sim' : 'não'}</td><td>{fmtData(m.hb)}</td><td>{m.runner}</td>
              <td className="act"><div>
                <button className="btn sec sm" onClick={() => void gerar(m.id, m.nome)}>Chave de pareamento</button>
                {MODO_DEMO && (
                  <button className="btn sec sm" title="Somente demonstração (backend com DEMO_MODE=true)" onClick={() => void agir(() => simularMaquina(atual.id, m.id))}>
                    {!m.pareada ? 'Simular pareamento' : m.online ? 'Simular offline' : 'Simular online'}
                  </button>
                )}
                {m.pareada && <button className="btn red sm" onClick={() => void agir(() => desparearMaquina(atual.id, m.id))}>Desparear</button>}
              </div></td>
            </tr>
          );
        })}
      </DataTable>
      {chave && <PairingKeyModal nome={chave.nome} chave={chave.chave} onClose={() => setChave(null)} />}
    </>
  );
}
