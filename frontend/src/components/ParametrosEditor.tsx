import { useState, type ReactNode } from 'react';
import { BarraExclusao } from './BarraExclusao';
import { DataTable } from './DataTable';
import { FORMATO_PYTHON, mascaraData, nomeIdentificador, TIPOS_PARAMETRO, validarParametro } from '../domain/parametros';
import { useSelecao } from '../hooks/useSelecao';
import type { Asset, Automation, Parametro, TipoParametro } from '../types';

type Item = Parametro & Partial<Pick<Asset, 'pasta' | 'escopo' | 'automacaoId'>>;
type Dados = Pick<Item, 'nome' | 'tipo' | 'valor' | 'desc' | 'pasta' | 'escopo' | 'automacaoId'>;

type Res = void | string | Promise<void | string>; // mensagem de erro (vazio = ok)

interface Props {
  termo: 'parâmetro' | 'ativo'; exemplo: string; itens: Item[]; dica: ReactNode; automacoes?: Automation[]; // automacoes: ativa pasta e escopo (modo Ativos)
 
  onAdd: (d: Dados) => Res; onUpdate: (id: string, d: Dados) => Res; onToggle: (id: string) => Res; onRemove: (ids: string[]) => Res;
}

/** Formulário + tabela de itens tipados (string, int, float, bool, data, confidencial). Usado por Automação (parâmetros) e Ativos. */
export function ParametrosEditor({ termo, exemplo, itens, dica, automacoes, onAdd, onUpdate, onToggle, onRemove }: Props) {
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState<TipoParametro>('string');
  const [valor, setValor] = useState('');
  const [desc, setDesc] = useState('');
  const [erro, setErro] = useState('');
  const [editando, setEditando] = useState<string | null>(null);
  const [pasta, setPasta] = useState('');
  const [escopo, setEscopo] = useState<'global' | 'local'>('global');
  const [autId, setAutId] = useState('');
  const sel = useSelecao(itens.map((p) => p.id));

  const limpar = () => { setNome(''); setTipo('string'); setValor(''); setDesc(''); setErro(''); setEditando(null); setPasta(''); setEscopo('global'); setAutId(''); };
  const mudarTipo = (t: TipoParametro) => { setTipo(t); setValor(''); setErro(''); };

  const alterar = (p: Item) => {
    setEditando(p.id); setNome(p.nome); setTipo(p.tipo); setDesc(p.desc); setErro('');
    setPasta(p.pasta ?? ''); setEscopo(p.escopo ?? 'global'); setAutId(p.automacaoId ?? '');
    setValor(p.tipo === 'confidencial' ? '' : p.valor); // valor confidencial nunca volta para a tela
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const salvar = async () => {
    const orig = itens.find((p) => p.id === editando);
    const manter = !!orig && orig.tipo === 'confidencial' && tipo === 'confidencial' && !valor; // vazio = mantém o atual
    const v = manter ? orig.valor : valor;
    const pn = pasta.trim();
    if (automacoes) {
      if (!nomeIdentificador(pn)) return setErro('Nome da pasta inválido: use letras, números e _ (sem espaços e sem começar por número).');
      if (escopo === 'local' && !autId) return setErro('Selecione a automação do escopo Local.');
    }
    // o nome só precisa ser único dentro da mesma pasta e escopo
    const mesmos = automacoes ? itens.filter((x) => x.pasta === pn && x.escopo === escopo && (escopo === 'global' || x.automacaoId === autId)) : itens;
    const e = validarParametro(nome.trim(), tipo, v, mesmos, editando ?? undefined);
    if (e) return setErro(e);
    const dados: Dados = {
      nome: nome.trim(), tipo, valor: v, desc: desc.trim(),
      ...(automacoes ? { pasta: pn, escopo, automacaoId: escopo === 'local' ? autId : undefined } : {}),
    };
    const r = editando ? await onUpdate(editando, dados) : await onAdd(dados);
    if (r) return setErro(r);
    limpar();
  };

  const excluir = async () => {
    if (editando && sel.selecionados.includes(editando)) limpar();
    const r = await onRemove(sel.selecionados);
    if (r) setErro(r);
    sel.limpar();
  };

  return (
    <>
      <div className="card" style={{ marginBottom: '1.375rem' }}>
        <h2 style={{ marginTop: 0 }}>{editando ? `Alterar ${termo}` : `Novo ${termo}`}</h2>
        <div className="bar" style={{ margin: 0 }}>
          {automacoes && (
            <>
              <input list="pastas-existentes" placeholder="Pasta (ex.: Financeiro)" value={pasta} onChange={(e) => setPasta(e.target.value)} />
              <datalist id="pastas-existentes">
                {[...new Set(itens.map((x) => x.pasta).filter((n): n is string => !!n))].map((n) => <option key={n} value={n} />)}
              </datalist>
              <select value={escopo} aria-label="Escopo da pasta" onChange={(e) => { setEscopo(e.target.value as 'global' | 'local'); setAutId(''); }}>
                <option value="global">Global</option><option value="local">Local</option>
              </select>
              {escopo === 'local' && (
                <select value={autId} aria-label="Automação" onChange={(e) => setAutId(e.target.value)}>
                  <option value="">Automação…</option>
                  {automacoes.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                </select>
              )}
            </>
          )}
          <input placeholder={`Nome (ex.: ${exemplo})`} value={nome} onChange={(e) => setNome(e.target.value)} />
          <select value={tipo} onChange={(e) => mudarTipo(e.target.value as TipoParametro)}>
            {TIPOS_PARAMETRO.map((t) => <option key={t}>{t}</option>)}
          </select>
          {tipo === 'bool' ? (
            <select value={valor} onChange={(e) => setValor(e.target.value)}>
              <option value="">Valor…</option><option value="true">true</option><option value="false">false</option>
            </select>
          ) : (
            <input placeholder={tipo === 'data' ? 'DD/MM/YYYY' : editando && tipo === 'confidencial' ? 'Novo valor (vazio mantém o atual)' : 'Valor'}
              type={tipo === 'confidencial' ? 'password' : 'text'} maxLength={tipo === 'data' ? 10 : undefined}
              inputMode={tipo === 'int' || tipo === 'data' ? 'numeric' : tipo === 'float' ? 'decimal' : undefined}
              value={valor} onChange={(e) => setValor(tipo === 'data' ? mascaraData(e.target.value) : e.target.value)} />
          )}
          <input placeholder="Descrição (opcional)" value={desc} onChange={(e) => setDesc(e.target.value)} />
          <button className="btn" onClick={() => void salvar()}>{editando ? 'Salvar' : 'Adicionar'}</button>
          {editando && <button className="btn sec" onClick={limpar}>Cancelar</button>}
        </div>
        {erro && <p className="err" style={{ margin: '0.625rem 0 0' }}>{erro}</p>}
        {tipo === 'data' && (
          <p style={{ color: 'var(--muted)', fontSize: '0.8125rem', margin: '0.625rem 0 0' }}>
            Formato: <b>DD/MM/YYYY</b> (ex.: 31/12/2026). No Python: <code>datetime.strptime(valor, '{FORMATO_PYTHON}').date()</code>
          </p>
        )}
        <p style={{ color: 'var(--muted)', fontSize: '0.8125rem', margin: '0.75rem 0 0' }}>{dica}</p>
      </div>

      {itens.length > 0 && (
        <div className="bar" style={{ justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
          <BarraExclusao quantidade={sel.selecionados.length} onConfirmar={excluir} />
        </div>
      )}
      <DataTable cols={automacoes ? ['Pasta', 'Nome', 'Tipo', 'Valor', 'Descrição', 'Escopo', 'Ativo', ''] : ['Nome', 'Tipo', 'Valor', 'Descrição', 'Ativo', '']} hasRows={itens.length > 0}
        empty={`Nenhum ${termo} cadastrado.`} selecao={itens.length ? sel : undefined}>
        {itens.map((p) => {
          const ativo = p.ativo !== false;
          return (
            <tr key={p.id} style={{ opacity: ativo ? 1 : 0.5 }}>
              <td><input type="checkbox" aria-label={`Selecionar ${p.nome}`} checked={sel.tem(p.id)} onChange={() => sel.alternar(p.id)} /></td>
              {automacoes && <td>{p.pasta}</td>}<td><code>{p.nome}</code></td><td>{p.tipo}</td>
              <td>{p.tipo === 'confidencial' ? '••••••••' : p.valor}</td><td>{p.desc}</td>
              {automacoes && <td>{p.escopo === 'local' ? `Local: ${automacoes.find((x) => x.id === p.automacaoId)?.nome ?? '(excluída)'}` : 'Global'}</td>}
              <td><input type="checkbox" aria-label={`Ativar ${p.nome}`} title={ativo ? 'Ativo: enviado à automação' : 'Desativado: não é enviado (None)'}
                checked={ativo} onChange={() => void Promise.resolve(onToggle(p.id)).then((r) => { if (r) setErro(r); })} /></td>
              <td className="act"><div><button className="btn sec sm" onClick={() => alterar(p)}>Alterar</button></div></td>
            </tr>
          );
        })}
      </DataTable>
    </>
  );
}
