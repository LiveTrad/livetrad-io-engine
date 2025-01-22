import * as React from 'react';

interface FloatingSwitchProps {
  onToggle: (enabled: boolean) => void;
  enabled?: boolean;
}

export function FloatingSwitch({ onToggle, enabled = false }: FloatingSwitchProps): JSX.Element {
  const [isEnabled, setIsEnabled] = React.useState(enabled);

  const handleToggle = () => {
    const newState = !isEnabled;
    setIsEnabled(newState);
    onToggle(newState);
  };

  return (
    <div className="livetrad-floating-switch">
      <label className="livetrad-switch">
        <input
          type="checkbox"
          checked={isEnabled}
          onChange={handleToggle}
        />
        <span className="livetrad-slider"></span>
      </label>
      <span className="livetrad-label">LiveTrad {isEnabled ? 'ON' : 'OFF'}</span>
    </div>
  );
}
