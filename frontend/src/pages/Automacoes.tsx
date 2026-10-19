import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { DataTable } from '../components/DataTable';
import { useData } from '../context/DataContext';
import { removeAutomation } from '../domain/automations';
import { automacaoEmUso } from '../domain/rules';
import { fmtData, fmtTamanho } from '../lib/format';
import { mensagem } from '../services/api';
import { atrelarMaquinas, criarAutomacao, enviarPacote, excluirAutomacao } from '../services/recursos';
import type { Machine } from '../types';

/** Caixas de seleção de máquinas (uma ou mais). `minimo` impede desmarcar a última. */
function ListaMaquinas({ maquinas, value, onChange, minimo = 0 }: { maquinas: Machine[]; value: string[]; onChange: (ids: string[]) => void; minimo?: number }) {
  return (
    <>
      {maquinas.map((m) => (
        <label key={m.id}>
          <input type="checkbox" checked={value.includes(m.id)} disabled={value.includes(m.id) && value.length <= minimo}
            onChange={() => onChange(value.includes(m.id) ? value.filter((x) => x !== m.id) : [...value, m.id])} />
          {m.nome}
        </label>
      ))}
    </>
  );
}

export default function Automacoes() {
  const { data: d, update, atual, recarregarRecursos } = useData();
  const [nome, setNome] = useState('');
  const [desc, setDesc] = useState('');
  const [maqs, setMaqs] = useState<string[]>([]);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const [editMaq, setEditMaq] = useState<{ id: string; nome: string; ids: string[] } | null>(null);
  const campoArquivo = useRef<HTMLInputElement>(null);

  const agir = async (fn: () => Promise<unknown>) => {
    setErro('');
    try { await fn(); await recarregarRecursos(); } catch (e) { setErro(mensagem(e)); }
  };

  const adicionar = async () => {
    if (!nome.trim()) return;
    if (!maqs.length) return setErro('Escolha ao menos uma máquina para a automação.');
    if (!arquivo) return setErro('Selecione o pacote .zip da automação.');
    if (d.automations.some((a) => a.nome.trim().toLowerCase() === nome.trim().toLowerCase())) return setErro('Já existe uma automação com este nome.');
    setEnviando(true); setErro('');
    let criada: string | null = null;
    try {
      criada = (await criarAutomacao(atual.id, nome.trim(), desc.trim(), maqs)).id;
      await enviarPacote(atual.id, criada, arquivo);
      setNome(''); setDesc(''); setMaqs([]); setArquivo(null);
      if (campoArquivo.current) campoArquivo.current.value = '';
    } catch (e) {
      if (criada) await excluirAutomacao(atual.id, criada).catch(() => undefined); // desfaz: não deixa automação sem pacote
      setErro(mensagem(e));
    }
    setEnviando(false);
    await recarregarRecursos();
  };

  const excluir = (id: string) => agir(async () => {
    await excluirAutomacao(atual.id, id);
    update((x) => removeAutomation(x, id)); // limpa também o que ainda é local (agendamentos, fila, ativos locais)
    setConfirmar(null);
  });

  return (
    <>
      <h1>Automações</h1>
      <div className="bar">
        <input placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} style={{ width: 220, maxWidth: '100%' }} />
        <input placeholder="Descrição (opcional)" value={desc} onChange={(e) => setDesc(e.target.value)} style={{ width: 240, maxWidth: '100%' }} />
        <details className="multi">
          <summary>{maqs.length ? d.machines.filter((m) => maqs.includes(m.id)).map((m) => m.nome).join(', ') : 'Máquinas…'}</summary>
          <div className="multi-box"><ListaMaquinas maquinas={d.machines} value={maqs} onChange={setMaqs} /></div>
        </details>
        <input ref={campoArquivo} type="file" accept=".zip,application/zip" aria-label="Pacote .zip" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} style={{ maxWidth: 260 }} />
        <button className="btn" disabled={!d.machines.length || enviando} onClick={() => void adicionar()}>{enviando ? 'Enviando…' : 'Adicionar'}</button>
      </div>
      {!d.machines.length && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Cadastre uma máquina antes de criar automações: cada automação fica atrelada a uma ou mais máquinas.</p>}
      {erro && <p className="err">{erro}</p>}
      <DataTable cols={['Nome', 'Descrição', 'Máquinas', 'Pacote', 'Criada em', '']} hasRows={d.automations.length > 0} empty="Nenhuma automação.">
        {d.automations.map((a) => {
          const emUso = automacaoEmUso(d, a.id);
          const ids = a.runnerIds ?? [];
          const nomes = d.machines.filter((m) => ids.includes(m.id)).map((m) => m.nome).join(', ');
          return (
            <tr key={a.id}>
              <td><Link className="lnk" to={`/automacoes/${a.id}`}>{a.nome}</Link></td><td>{a.desc}</td>
              <td>{nomes || '—'}</td>
              <td>{a.temPacote ? `v${a.versao} · ${fmtTamanho(a.tamanhoPacote)}` : 'sem pacote'}</td>
              <td>{fmtData(a.criada)}</td>
              <td className="act"><div>
                <button className="btn sec sm" onClick={() => setEditMaq({ id: a.id, nome: a.nome, ids })}>Máquinas</button>
                <label className="btn sec sm" title="Envia uma nova versão do pacote (.zip)">
                  Enviar pacote
                  <input type="file" accept=".zip,application/zip" hidden onChange={(e) => {
                    const f = e.target.files?.[0]; e.target.value = '';
                    if (f) void agir(() => enviarPacote(atual.id, a.id, f));
                  }} />
                </label>
                {confirmar === a.id ? (
                  <>
                    <button className="btn red sm" onClick={() => void excluir(a.id)}>Confirmar exclusão</button>
                    <button className="btn sec sm" onClick={() => setConfirmar(null)}>Cancelar</button>
                  </>
                ) : (
                  <button className="btn red sm" disabled={emUso} title={emUso ? 'Há uma execução em andamento' : 'Excluir automação'} onClick={() => setConfirmar(a.id)}>Excluir</button>
                )}
              </div></td>
            </tr>
          );
        })}
      </DataTable>

      {editMaq && (
        <div className="ov"><div className="card modal" role="dialog" aria-modal="true">
          <h2 style={{ marginTop: 0 }}>Máquinas de {editMaq.nome}</h2>
          <p style={{ color: 'var(--muted)', margin: 0 }}>A automação pode rodar em mais de uma máquina; ao menos uma é obrigatória.</p>
          <div className="lista-maq"><ListaMaquinas maquinas={d.machines} value={editMaq.ids} minimo={1} onChange={(ids) => setEditMaq({ ...editMaq, ids })} /></div>
          <div className="bar" style={{ margin: 0, justifyContent: 'flex-end' }}>
            <button className="btn sec" onClick={() => setEditMaq(null)}>Cancelar</button>
            <button className="btn" onClick={() => { const e = editMaq; setEditMaq(null); void agir(() => atrelarMaquinas(atual.id, e.id, e.ids)); }}>Salvar</button>
          </div>
        </div></div>
      )}
    </>
  );
}
