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
        <strong>{label}</strong>
        {hint ? <small>{hint}</small> : null}
      </span>
    </label>
  );
}
