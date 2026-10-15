import { useRef, useState } from 'react';
import { HiOutlineChevronUp, HiOutlineChevronDown, HiOutlineMenuAlt4, HiOutlineTrash } from 'react-icons/hi';
import { copyOptionTemplate } from '../../utils/menuOptions';
import '../../components/MenuOptions.css';

const newChoice = () => ({ id: crypto.randomUUID(), name: '', price: 0, is_available: true, is_default: false, ingredients: [] });
const newOption = () => ({ _editorId: crypto.randomUUID(), name: '', min_choices: 0, max_choices: 1, is_active: true, choices: [newChoice()] });

export default function MenuOptionsEditor({ groups, onChange, materials = [], disabled = false, availabilityOnly = false, onAvailability, templates = [], templatesLoading = false, templatesError = '', onReloadTemplates, onDeleteTemplate, deletingTemplate = null }) {
  const dragged = useRef(null);
  const [announcement, setAnnouncement] = useState('');
  const keyFor = (group) => group._editorId || group.id || group.choices[0].id;
  const move = (from, to) => {
    if (disabled || from < 0 || from === to || to < 0 || to >= groups.length) return;
    const next = [...groups];
    const [group] = next.splice(from, 1);
    next.splice(to, 0, group);
    onChange(next);
    setAnnouncement(`${group.name || 'Opsi'} dipindahkan ke urutan ${to + 1}.`);
  };
  const action = (event, callback) => { event.preventDefault(); event.stopPropagation(); callback(); };
  const patch = (index, changes) => onChange(groups.map((g, i) => i === index ? { ...g, ...changes } : g));
  const patchChoice = (index, choiceIndex, changes) => patch(index, { choices: groups[index].choices.map((c, i) => i === choiceIndex ? { ...c, ...changes } : c) });
  const moveChoice = (index, from, to) => {
    const choices = [...groups[index].choices];
    if (disabled || to < 0 || to >= choices.length) return;
    const [choice] = choices.splice(from, 1);
    choices.splice(to, 0, choice);
    patch(index, { choices });
    setAnnouncement(`${choice.name || 'Pilihan'} dipindahkan ke urutan ${to + 1} pada ${groups[index].name || 'opsi'}.`);
  };
  const add = (preset) => onChange([...groups, preset || newOption()]);
  return <section className="inline-menu-options" aria-label="Pilihan dan add-on menu">
    <div className="inline-options-header"><h3>Pilihan & Add-on</h3><p>{availabilityOnly ? 'Atur pilihan yang tersedia untuk menu ini.' : 'Tambahkan langsung di sini jika menu memiliki pilihan atau tambahan.'}</p></div>
    {!groups.length && <p className="inline-options-empty">Tanpa opsi. Menu bisa langsung ditambahkan ke keranjang.</p>}
    <span className="option-reorder-announcement" role="status" aria-atomic="true">{announcement}</span>
    {groups.map((group, index) => <details className="inline-option-panel" key={keyFor(group)} open={!group.id} onInvalidCapture={(e) => {
      let parent = e.target.parentElement;
      while (parent && parent !== e.currentTarget) { if (parent.tagName === 'DETAILS') parent.open = true; parent = parent.parentElement; }
      e.currentTarget.open = true;
    }} onDragOver={(e) => { if (!disabled && dragged.current !== null) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } }} onDrop={(e) => {
      if (dragged.current === null) return;
      e.preventDefault();
      move(groups.findIndex((g) => keyFor(g) === dragged.current), index);
      dragged.current = null;
    }}>
      <summary className="inline-option-summary">
        <span className="inline-option-summary-text"><strong>{group.name || `Opsi ${index + 1}`}</strong><small>{group.choices.length} pilihan · {group.min_choices > 0 ? 'Wajib' : 'Opsional'}{!group.is_active && ' · Nonaktif'}</small></span>
        <span className="inline-option-summary-actions">
          {!availabilityOnly && <>
            <button type="button" className="btn btn-ghost inline-option-icon option-drag-handle" aria-label={`Seret opsi ${index + 1}`} title="Seret untuk mengubah urutan" disabled={disabled} draggable={!disabled} onClick={(e) => action(e, () => {})} onDragStart={(e) => { dragged.current = keyFor(group); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(keyFor(group))); }} onDragEnd={() => { dragged.current = null; }}><HiOutlineMenuAlt4 aria-hidden="true" /></button>
            <button type="button" className="btn btn-ghost inline-option-icon" aria-label={`Naikkan opsi ${index + 1}`} title="Geser ke atas" disabled={disabled || index === 0} onClick={(e) => action(e, () => move(index, index - 1))}><HiOutlineChevronUp aria-hidden="true" /></button>
            <button type="button" className="btn btn-ghost inline-option-icon" aria-label={`Turunkan opsi ${index + 1}`} title="Geser ke bawah" disabled={disabled || index === groups.length - 1} onClick={(e) => action(e, () => move(index, index + 1))}><HiOutlineChevronDown aria-hidden="true" /></button>
            <button type="button" className="btn btn-ghost inline-option-icon" aria-label={`Hapus opsi ${index + 1}`} title="Hapus opsi" disabled={disabled} onClick={(e) => action(e, () => onChange(groups.filter((_, i) => i !== index)))}><HiOutlineTrash aria-hidden="true" /></button>
          </>}
          <HiOutlineChevronDown className="inline-option-disclosure" aria-hidden="true" />
        </span>
      </summary>
      <fieldset className="inline-option-group" aria-label={group.name || `Opsi ${index + 1}`} disabled={disabled}>
      {!availabilityOnly && <>
        <div className="inline-option-heading">
          <label className="option-notes">Nama opsi<input className="form-input" maxLength={100} required value={group.name} placeholder="Misalnya: Penyajian atau Tambahan" onChange={(e) => patch(index, { name: e.target.value })} /></label>
        </div>
        <div className="option-admin-grid">
          <label>Cara memilih<select className="form-select" value={group.max_choices === 1 ? 'single' : 'multiple'} onChange={(e) => patch(index, { max_choices: e.target.value === 'single' ? 1 : 0, min_choices: Math.min(group.min_choices, 1) })}><option value="single">Pilih satu</option><option value="multiple">Boleh pilih beberapa</option></select></label>
          {group.max_choices !== 1 && <div className="option-limit-controls">
            <label className="option-limit-number">Maksimal dipilih<input className="form-input" type="number" min={Math.max(2, group.min_choices)} max={30} required={group.max_choices > 0} disabled={group.max_choices === 0} placeholder="—" value={group.max_choices === 0 ? '' : group.max_choices} onChange={(e) => patch(index, { max_choices: Number(e.target.value) })} /></label>
            <label className="option-limit-unlimited"><input type="checkbox" checked={group.max_choices === 0} onChange={(e) => patch(index, { max_choices: e.target.checked ? 0 : Math.max(2, group.min_choices) })} /><span>gaada maksimalnya</span></label>
          </div>}
        </div>
        <div className="option-group-actions">
          <label className="option-check"><input type="checkbox" checked={group.min_choices > 0} onChange={(e) => patch(index, { min_choices: e.target.checked ? 1 : 0 })} />Wajib dipilih</label>
          <label className="option-check"><input type="checkbox" checked={group.is_active} onChange={(e) => patch(index, { is_active: e.target.checked })} />Aktif</label>
        </div>
      </>}
      {group.choices.map((choice, choiceIndex) => <div className="inline-option-choice" key={choice.id}>
        {availabilityOnly ? <label className="option-check"><input type="checkbox" checked={choice.is_available} onChange={() => onAvailability(group, choice)} />{choice.name} · +Rp{Number(choice.price).toLocaleString('id-ID')} · {choice.is_available ? 'Tersedia' : 'Habis'}</label> : <>
          <div className="inline-choice-fields">
            <label>Nama pilihan<input className="form-input" maxLength={100} required value={choice.name} placeholder="Misalnya: Ice, Hot, Extra shot" onChange={(e) => patchChoice(index, choiceIndex, { name: e.target.value })} /></label>
            <label>Tambahan harga (Rp)<input className="form-input" type="number" min={0} max={10000000} step="0.01" required value={choice.price} onChange={(e) => patchChoice(index, choiceIndex, { price: e.target.value })} /></label>
            <button type="button" className="btn btn-ghost inline-option-icon" aria-label={`Hapus pilihan ${choiceIndex + 1} dari opsi ${index + 1}`} disabled={group.choices.length === 1} onClick={() => patch(index, { choices: group.choices.filter((_, i) => i !== choiceIndex) })}><HiOutlineTrash /></button>
          </div>
          <div className="inline-choice-actions">
          <label className="option-check"><input type="checkbox" checked={choice.is_available} onChange={(e) => patchChoice(index, choiceIndex, { is_available: e.target.checked, is_default: e.target.checked && choice.is_default })} />Tersedia</label>
            <div className="inline-option-summary-actions">
              <button type="button" className="btn btn-ghost inline-option-icon" aria-label={`Naikkan pilihan ${choiceIndex + 1} dari opsi ${index + 1}`} title="Geser pilihan ke atas" disabled={choiceIndex === 0} onClick={() => moveChoice(index, choiceIndex, choiceIndex - 1)}><HiOutlineChevronUp aria-hidden="true" /></button>
              <button type="button" className="btn btn-ghost inline-option-icon" aria-label={`Turunkan pilihan ${choiceIndex + 1} dari opsi ${index + 1}`} title="Geser pilihan ke bawah" disabled={choiceIndex === group.choices.length - 1} onClick={() => moveChoice(index, choiceIndex, choiceIndex + 1)}><HiOutlineChevronDown aria-hidden="true" /></button>
            </div>
          </div>
          <details className="inline-option-advanced"><summary>Default & bahan tambahan</summary>
            <label className="option-check"><input type="checkbox" checked={choice.is_default} disabled={!choice.is_available} onChange={(e) => patchChoice(index, choiceIndex, { is_default: e.target.checked })} />Dipilih secara default</label>
            <p className="selected-options">Bahan tambahan per satu menu, sesuai satuan stok.</p>
            {(choice.ingredients || []).map((ingredient, i) => <div className="option-ingredient" key={i}>
              <select className="form-select" aria-label="Bahan tambahan" required value={ingredient.raw_material_id} onChange={(e) => patchChoice(index, choiceIndex, { ingredients: choice.ingredients.map((r, j) => j === i ? { ...r, raw_material_id: Number(e.target.value) } : r) })}>
                <option value="">Pilih bahan</option>{materials.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
              </select>
              <input className="form-input" aria-label="Jumlah bahan per menu" type="number" min="0.01" max="1000000" step="0.01" required value={ingredient.quantity_used} onChange={(e) => patchChoice(index, choiceIndex, { ingredients: choice.ingredients.map((r, j) => j === i ? { ...r, quantity_used: e.target.value } : r) })} />
              <button type="button" className="btn btn-ghost" onClick={() => patchChoice(index, choiceIndex, { ingredients: choice.ingredients.filter((_, j) => j !== i) })}>Hapus bahan</button>
            </div>)}
            <button type="button" className="btn btn-ghost" onClick={() => patchChoice(index, choiceIndex, { ingredients: [...(choice.ingredients || []), { raw_material_id: '', quantity_used: 1 }] })}>+ Bahan</button>
          </details>
        </>}
      </div>)}
      {!availabilityOnly && <button type="button" className="btn btn-secondary" onClick={() => patch(index, { choices: [...group.choices, newChoice()] })}>+ Tambah pilihan</button>}
    </fieldset>
    </details>)}
    {!availabilityOnly && <div className="option-group-actions">
      <button type="button" className="btn btn-secondary" disabled={disabled} onClick={() => add()}>+ Tambah opsi / add-on</button>
    </div>}
    {!availabilityOnly && <div className="saved-option-templates" aria-label="Add-on tersimpan">
      <p className="selected-options">Add-on tersimpan</p>
      <p className="selected-options">Gunakan lagi untuk menu ini. Hapus dari daftar ini tidak mengubah opsi pada menu.</p>
      {templatesLoading && <p className="selected-options" role="status">Memuat add-on tersimpan...</p>}
      {templatesError && <div className="option-error" role="alert">{templatesError} <button type="button" className="btn btn-ghost btn-sm" onClick={onReloadTemplates}>Coba lagi</button></div>}
      {!templatesLoading && !templatesError && !templates.length && <p className="selected-options">Opsi baru akan tersimpan di sini setelah menu disimpan.</p>}
      <div className="option-template-list">
        {templates.map((template) => <div className="option-template-chip" key={template.id}>
          <button type="button" className="option-template-use" disabled={disabled} aria-label={`Gunakan add-on ${template.name}`} title={template.choices.map((c) => `${c.name} (+Rp${Number(c.price).toLocaleString('id-ID')})`).join(', ')} onClick={() => { add(copyOptionTemplate(template)); setAnnouncement(`${template.name} ditambahkan ke menu. Simpan menu untuk menerapkan.`); }}>+ {template.name}</button>
          <button type="button" className="option-template-remove" aria-label={`Hapus ${template.name} dari daftar tersimpan`} title="Hapus dari daftar tersimpan; opsi pada menu tetap ada" disabled={disabled || templatesLoading || deletingTemplate !== null} onClick={() => onDeleteTemplate(template)}><HiOutlineTrash aria-hidden="true" /></button>
        </div>)}
      </div>
    </div>}
  </section>;
}
