import { useEffect, useRef, useState } from 'react';
import { activeGroups } from '../utils/menuOptions';
import './MenuOptions.css';

const currency = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);

export default function MenuOptionPicker({ menu, initialItem, onConfirm, onClose }) {
  const dialog = useRef(null);
  const groups = activeGroups(menu);
  const [selected, setSelected] = useState(() => initialItem?.option_ids || groups.flatMap((g) => g.choices.filter((c) => c.is_default && c.is_available).map((c) => c.id)));
  const [notes, setNotes] = useState(initialItem?.notes || '');
  const [error, setError] = useState('');
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  const picked = groups.flatMap((g) => g.choices.filter((c) => selected.includes(c.id) && c.is_available).map((c) => ({ group_id: g.id, group_name: g.name, choice_id: c.id, name: c.name, price: Number(c.price) })));
  const price = Number(menu.price) + picked.reduce((sum, c) => sum + c.price, 0);
  const toggle = (group, choice) => {
    setError('');
    setSelected((prev) => {
      if (prev.includes(choice.id)) return prev.filter((id) => id !== choice.id);
      if (group.max_choices === 1) return [...prev.filter((id) => !group.choices.some((c) => c.id === id)), choice.id];
      return [...prev, choice.id];
    });
  };
  const submit = (event) => {
    event.preventDefault();
    for (const group of groups) {
      const count = picked.filter((c) => c.group_id === group.id).length;
      if (count < group.min_choices || (group.max_choices > 0 && count > group.max_choices)) {
        setError(group.max_choices === 0 ? `${group.name}: pilih minimal ${group.min_choices} pilihan.` : `${group.name}: pilih ${group.min_choices}–${group.max_choices} pilihan.`);
        return;
      }
    }
    onConfirm(picked, notes);
  };
  return (
    <dialog ref={dialog} className="option-dialog" aria-labelledby="option-picker-title" onCancel={onClose} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form onSubmit={submit}>
        <div className="option-dialog-header"><div><p className="option-eyebrow">SESUAI SELERAMU</p><h2 id="option-picker-title">{menu.name}</h2><p>{currency(menu.price)}</p></div><button type="button" className="btn btn-ghost" aria-label="Tutup pilihan" onClick={onClose}>✕</button></div>
        <div className="option-dialog-body">
          {groups.map((group) => <fieldset className="option-fieldset" key={group.id}>
            <legend>{group.name} <span>{group.min_choices > 0 ? 'Wajib' : 'Opsional'} · {group.max_choices === 1 ? 'Pilih satu' : group.max_choices === 0 ? 'Bisa pilih semua' : `Maks. ${group.max_choices}`}</span></legend>
            {group.choices.map((choice) => {
              const checked = selected.includes(choice.id);
              const full = group.max_choices > 1 && group.choices.filter((c) => selected.includes(c.id)).length >= group.max_choices;
              return <label className={`option-choice${!choice.is_available ? ' option-unavailable' : ''}`} key={choice.id}>
                <input type={group.max_choices === 1 ? 'radio' : 'checkbox'} name={`group-${group.id}`} checked={checked} disabled={!choice.is_available || (!checked && full)} onChange={() => toggle(group, choice)} />
                <span>{choice.name}{!choice.is_available && <small>Habis</small>}</span><span>{Number(choice.price) > 0 ? `+${currency(choice.price)}` : 'Tanpa tambahan'}</span>
              </label>;
            })}
            {group.min_choices === 0 && group.max_choices === 1 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected((prev) => prev.filter((id) => !group.choices.some((c) => c.id === id)))}>Tanpa pilihan</button>}
          </fieldset>)}
          <label className="form-group option-notes">Catatan (opsional)<textarea className="form-input" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></label>
          {error && <p className="option-error" role="alert">{error}</p>}
        </div>
        <div className="option-dialog-footer"><strong>{currency(price)}</strong><button type="submit" className="btn btn-primary">{initialItem ? 'Simpan pilihan' : 'Tambah ke Keranjang'}</button></div>
      </form>
    </dialog>
  );
}
