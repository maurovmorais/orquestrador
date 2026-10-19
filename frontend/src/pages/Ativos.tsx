import { useCallback, useEffect, useState } from 'react';
import { ParametrosEditor } from '../components/ParametrosEditor';
import { useData } from '../context/DataContext';
import { mensagem } from '../services/api';
import { alterarAtivo, ativarAtivo, criarAtivo, excluirAtivos, listarAtivos } from '../services/recursos';
import type { Asset } from '../types';

export default function Ativos() {
  const { data: d, atual } = useData();
  const [itens, setItens] = useState<Asset[]>([]);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    try { setItens(await listarAtivos(atual.id)); setErro(''); } catch (e) { setErro(mensagem(e)); }
  }, [atual.id]);
  useEffect(() => { void carregar(); }, [carregar]);

  /** Chama a API, recarrega a lista e devolve a mensagem de erro ('' = ok) para o formulário mostrar. */
  const executar = async (fn: () => Promise<unknown>): Promise<string> => {
    try { await fn(); await carregar(); return ''; } catch (e) { return mensagem(e); }
  };

  return (
    <>
      <h1>Ativos</h1>
      {erro && <p className="err">{erro}</p>}
      <ParametrosEditor termo="ativo" exemplo="url_portal" itens={itens} automacoes={d.automations}
        dica={<>Ativos ficam organizados em <b>pastas</b>. O nome da pasta e do ativo serão informados à automação por comando Python (por exemplo,{' '}
          <code>ativo('Financeiro', 'url_portal')</code>). Pasta <b>Global</b>: todas as automações enxergam. Pasta <b>Local</b>: somente a automação
          escolhida. Nomes devem ser identificadores (letras, números e _). Valores <b>confidenciais</b> são criptografados e sempre exibidos
          mascarados. Ativos <b>desativados</b> não são enviados à automação: na leitura pelo Python retornam <code>None</code>.</>}
        onAdd={(x) => executar(() => criarAtivo(atual.id, x))}
        onUpdate={(id, x) => executar(() => alterarAtivo(atual.id, id, x))}
        onToggle={(id) => executar(() => ativarAtivo(atual.id, id, itens.find((i) => i.id === id)?.ativo === false))}
        onRemove={(ids) => executar(() => excluirAtivos(atual.id, ids))} />
    </>
  );
}
