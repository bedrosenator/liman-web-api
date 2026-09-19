import type { LucideIcon } from 'lucide-react';

export interface CheckboxFieldProps {
  id?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  icon: LucideIcon;
  iconColor?: string;
  label: React.ReactNode;
  className?: string;
}

export const CheckboxField: React.FC<CheckboxFieldProps> = ({
  id,
  checked,
  onChange,
  icon: Icon,
  iconColor = 'text-primary',
  label,
  className = '',
}) => {
  return (
    <label className={`checkbox-item ${className}`.trim()} htmlFor={id}>
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <Icon size={14} className={iconColor} />
      <span>{label}</span>
    </label>
  );
};
