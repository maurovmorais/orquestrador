interface Props { onPick: (modo: 'elegante' | 'abrupto') => void; onClose: () => void }

export function CancelModal({ onPick, onClose }: Props) {
  return (
    <div className="ov">
      <div className="card modal" role="dialog" aria-modal="true">
        <h2 style={{ marginTop: 0 }}>Cancelar execução</h2>
        <p style={{ color: 'var(--muted)', margin: '0 0 14px' }}>Escolha como a automação deve ser interrompida:</p>
        <div style={{ display: 'grid', gap: 10 }}>
          <button className="btn sec" style={{ textAlign: 'left' }} onClick={() => onPick('elegante')}>
            <b>Elegante</b><br /><span style={{ fontSize: '0.8125rem' }}>Aguarda terminar o item da fila que está sendo processado e só então encerra.</span>
          </button>
          <button className="btn red" style={{ textAlign: 'left' }} onClick={() => onPick('abrupto')}>
            <b>Abrupto</b><br /><span style={{ fontSize: '0.8125rem' }}>Encerra (mata) o processo imediatamente. O item em andamento pode ficar incompleto.</span>
          </button>
        </div>
        <div className="bar" style={{ margin: '16px 0 0', justifyContent: 'flex-end' }}>
          <button className="btn sec" onClick={onClose}>Voltar</button>
        </div>
      </div>
    </div>
  );
}
