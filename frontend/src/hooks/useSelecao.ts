import { useState } from 'react';

/** Seleção por checkbox. `ids` são os itens que podem ser selecionados. */
export function useSelecao(ids: string[]) {
  const [sel, setSel] = useState<string[]>([]);
  const selecionados = sel.filter((id) => ids.includes(id));
  return {
    selecionados,
    tem: (id: string) => selecionados.includes(id),
    alternar: (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id])),
    alternarTodos: () => setSel(selecionados.length === ids.length ? [] : ids),
    limpar: () => setSel([]),
    todos: ids.length > 0 && selecionados.length === ids.length,
    algum: selecionados.length > 0,
  };
}
