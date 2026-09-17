import { useId } from 'react';
import { useTheme, type ThemePreference } from '../theme.tsx';

function SunIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="3.2" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3.1 3.1l1.1 1.1M11.8 11.8l1.1 1.1M12.9 3.1l-1.1 1.1M4.2 11.8l-1.1 1.1" />
      </g>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" focusable="false">
      <path
        d="M13.4 10.3A5.8 5.8 0 0 1 5.7 2.6a6 6 0 1 0 7.7 7.7Z"
        fill="currentColor"
      />
    </svg>
  );
}

function SystemIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" focusable="false">
      <rect x="1.3" y="2.4" width="13.4" height="9" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5.5 14h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

const OPTIONS: Array<{ value: ThemePreference; label: string; icon: () => React.ReactElement }> = [
  { value: 'light', label: 'Light', icon: SunIcon },
  { value: 'dark', label: 'Dark', icon: MoonIcon },
  { value: 'system', label: 'System', icon: SystemIcon },
];

/**
 * Light / Dark / System picker.
 *
 * Built as a radio group rather than three toggle buttons so screen readers
 * announce it as one control with three mutually exclusive choices, and so
 * arrow keys move between the options the way people expect.
 */
export function ThemeSelector({ compact = false }: { compact?: boolean }) {
  const { preference, resolved, setPreference, storageUnavailable } = useTheme();
  const labelId = useId();

  return (
    <div className={`theme-selector ${compact ? 'compact' : ''}`.trim()}>
      <span className="visually-hidden" id={labelId}>
        Colour theme
      </span>
      <div className="theme-options" role="radiogroup" aria-labelledby={labelId}>
        {OPTIONS.map((option) => {
          const Icon = option.icon;
          const selected = preference === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              className="theme-option"
              title={`${option.label} theme`}
              onClick={() => setPreference(option.value)}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
                event.preventDefault();
                const index = OPTIONS.findIndex((o) => o.value === preference);
                const delta = event.key === 'ArrowRight' ? 1 : -1;
                const next = OPTIONS[(index + delta + OPTIONS.length) % OPTIONS.length]!;
                setPreference(next.value);
                // In a roving-tabindex radio group focus has to follow the
                // selection. Without this the key press left focus on the
                // option that is now aria-checked="false" and tabindex="-1",
                // so a screen reader announced the wrong state and the next
                // Tab re-entered the group somewhere else.
                const group = event.currentTarget.parentElement;
                group?.querySelectorAll<HTMLButtonElement>('button')[
                  (index + delta + OPTIONS.length) % OPTIONS.length
                ]?.focus();
              }}
            >
              <Icon />
              <span className={compact ? 'visually-hidden' : 'theme-option-label'}>{option.label}</span>
            </button>
          );
        })}
      </div>
      <span className="visually-hidden" aria-live="polite">
        {preference === 'system' ? `System theme, currently ${resolved}` : `${preference} theme`}
      </span>
      {storageUnavailable ? (
        <span className="visually-hidden">
          Your browser is not storing this preference, so it will reset when you reload.
        </span>
      ) : null}
    </div>
  );
}
