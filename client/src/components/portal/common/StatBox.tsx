import type { LucideIcon } from 'lucide-react';

export interface StatBoxProps {
  icon: LucideIcon;
  iconColor?: string;
  label: string;
  value: number | string;
  valueColor?: string;
}

export const StatBox: React.FC<StatBoxProps> = ({
  icon: Icon,
  iconColor = 'text-muted',
  label,
  value,
  valueColor,
}) => {
  return (
    <div className="stat-box">
      <div className="stat-box__header">
        <Icon size={13} className={iconColor} />
        <span className="stat-box__label">{label}</span>
      </div>
      <div className={`stat-box__value ${valueColor ?? ''}`}>
        {value}
      </div>
    </div>
  );
};
