import type { ReactNode } from 'react';

interface Selecao { todos: boolean; algum: boolean; alternarTodos: () => void }
interface Props { cols: ReactNode[]; empty?: string; hasRows: boolean; selecao?: Selecao; children: ReactNode }

/** Com `selecao`, adiciona uma coluna de checkbox (selecionar todos) no início. */
export function DataTable({ cols, empty, hasRows, selecao, children }: Props) {
  return (
    <div className="tw">
      <table>
        <thead>
          <tr>
            {selecao && (
              <th style={{ width: '2.25rem' }}>
                <input type="checkbox" aria-label="Selecionar todos" checked={selecao.todos}
                  ref={(el) => { if (el) el.indeterminate = selecao.algum && !selecao.todos; }}
                  onChange={selecao.alternarTodos} />
              </th>
            )}
            {cols.map((c, i) => <th key={i}>{c}</th>)}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {!hasRows && empty && <div className="empty">{empty}</div>}
    </div>
  );
}
