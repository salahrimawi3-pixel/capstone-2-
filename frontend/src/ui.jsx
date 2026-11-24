import { useEffect, useRef } from 'react';

export const km = (value) => value.toFixed(1);
export const mins = (value) => Math.round(value);
export const percent = (before, after) => (before === 0 ? 0 : ((before - after) / before) * 100);

export function Button({ variant = '', className = '', type = 'button', ...props }) {
  return <button className={`btn ${variant} ${className}`} type={type} {...props} />;
}

export function Metrics({ items }) {
  return (
    <div className="grid g4">
      {items.map(([label, value]) => (
        <div className="card" key={label}>
          <span className="mu">{label}</span>
          <div className="big">{value}</div>
        </div>
      ))}
    </div>
  );
}

export function Table({ columns, rows, actions }) {
  return (
    <table>
      <thead>
        <tr>
          {columns.map(([label, key]) => (
            <th scope="col" key={key}>
              {label}
            </th>
          ))}
          {actions && <th scope="col">Actions</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            {columns.map(([, key]) => (
              <td key={key}>{row[key]}</td>
            ))}
            {actions && <td>{actions(row)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Modal({ title, onClose, busy, children }) {
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-labelledby="modal-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <h3 id="modal-title">{title}</h3>
      {children}
    </dialog>
  );
}

export function Stop({ number, student, children }) {
  return (
    <div className="stop">
      <div className="num">{number}</div>
      <div className="stop-details">
        <b>{student.name}</b>
        <br />
        <span className="mu">{student.area}</span>
      </div>
      {children}
    </div>
  );
}
