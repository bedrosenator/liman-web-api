import { Check, type LucideIcon } from 'lucide-react';

export interface ModeCardProps {
  id: string;
  inputId: string;
  name: string;
  value: string;
  isActive: boolean;
  onSelect: () => void;
  color: 'emerald' | 'indigo' | 'sky' | 'rose' | 'amber';
  icon: LucideIcon;
  iconSize?: number;
  title: string;
  description: string;
}

export const ModeCard: React.FC<ModeCardProps> = ({
  id,
  inputId,
  name,
  value,
  isActive,
  onSelect,
  color,
  icon: Icon,
  iconSize = 16,
  title,
  description,
}) => {
  return (
    <label
      htmlFor={inputId}
      className={`mode-card mode-card--${color} ${isActive ? 'mode-card--active' : ''}`}
      id={id}
      onClick={onSelect}
    >
      <input
        type="radio"
        id={inputId}
        name={name}
        value={value}
        checked={isActive}
        onChange={onSelect}
        className="sr-only"
      />
      <div className="mode-card__header">
        <div className="mode-card__title-wrap">
          <Icon size={iconSize} className={`text-${color}`} />
          <span className="mode-card__title">{title}</span>
        </div>
        <div className="mode-card__radio" aria-hidden="true">
          {isActive ? (
            <Check size={12} strokeWidth={3} className="text-white" />
          ) : null}
        </div>
      </div>
      <p className="mode-card__desc">{description}</p>
    </label>
  );
};
