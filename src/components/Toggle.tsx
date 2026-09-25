import { t } from '../shared/i18n';

/** `label` / `hint`: Vietnamese source texts or already translated ones; translated here. */
interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
}

export default function Toggle({ checked, onChange, label, hint }: ToggleProps) {
  return (
    <label className="toggle-row">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="toggle-ui" aria-hidden="true" />
      <span className="toggle-copy">
        <strong>{t(label)}</strong>
        {hint ? <small>{t(hint)}</small> : null}
      </span>
    </label>
  );
}
