import * as React from 'react';

interface FloatingSwitchProps {
  onToggle: (enabled: boolean) => void;
  initialState?: boolean;
}

export function FloatingSwitch({ onToggle, initialState = false }: FloatingSwitchProps): JSX.Element {
  const [enabled, setEnabled] = React.useState(initialState);

  const handleToggle = () => {
    const newState = !enabled;
    setEnabled(newState);
    onToggle(newState);
  };

  return (
    <div className="livetrad-floating-switch">
      <label className="livetrad-switch">
        <input
          type="checkbox"
          checked={enabled}
          onChange={handleToggle}
        />
        <span className="livetrad-slider"></span>
      </label>
      <span className="livetrad-label">LiveTrad {enabled ? 'ON' : 'OFF'}</span>
    </div>
  );
}
