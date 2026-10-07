const THEME_ORDER = ['system', 'light', 'dark']
const THEME_LABELS = { system: 'System', light: 'Light', dark: 'Dark' }

export default function AccessibilityBar({ prefs, onPrefsChange, scale, onScaleChange, onReplay, replayAvailable }) {
  function cycleTheme() {
    const idx = THEME_ORDER.indexOf(prefs.theme ?? 'system')
    onPrefsChange({ theme: THEME_ORDER[(idx + 1) % THEME_ORDER.length] })
  }

  return (
    <div className="a11y-bar" role="group" aria-label="Display and accessibility settings">
      <div className="a11y-row">
        <span className="a11y-label" id="theme-label">Theme</span>
        <button
          type="button"
          aria-labelledby="theme-label"
          aria-label={`Theme: ${THEME_LABELS[prefs.theme ?? 'system']}. Activate to switch.`}
          onClick={cycleTheme}
        >
          {THEME_LABELS[prefs.theme ?? 'system']}
        </button>
      </div>

      <div className="a11y-row">
        <label htmlFor="brightness-slider" className="a11y-label">Brightness</label>
        <input
          id="brightness-slider"
          type="range"
          min={60}
          max={140}
          step={5}
          value={prefs.brightness ?? 100}
          onChange={(e) => onPrefsChange({ brightness: Number(e.target.value) })}
        />
        <span aria-hidden="true" className="a11y-value">{prefs.brightness ?? 100}%</span>
      </div>

      <div className="a11y-row">
        <span className="a11y-label" id="zoom-label">Zoom</span>
        <button
          type="button"
          aria-labelledby="zoom-label"
          aria-label="Decrease page zoom"
          onClick={() => onScaleChange(Math.max(0.6, +(scale - 0.15).toFixed(2)))}
        >
          −
        </button>
        <span aria-hidden="true" className="a11y-value">{Math.round(scale * 100)}%</span>
        <button
          type="button"
          aria-labelledby="zoom-label"
          aria-label="Increase page zoom"
          onClick={() => onScaleChange(Math.min(2.4, +(scale + 0.15).toFixed(2)))}
        >
          +
        </button>
      </div>

      <div className="a11y-row">
        <span className="a11y-label" id="text-label">Sidebar text</span>
        <button
          type="button"
          aria-labelledby="text-label"
          aria-label="Decrease sidebar text size"
          onClick={() => onPrefsChange({ textScale: Math.max(0.85, +(prefs.textScale - 0.1).toFixed(2)) })}
        >
          A−
        </button>
        <button
          type="button"
          aria-labelledby="text-label"
          aria-label="Increase sidebar text size"
          onClick={() => onPrefsChange({ textScale: Math.min(1.6, +(prefs.textScale + 0.1).toFixed(2)) })}
        >
          A+
        </button>
      </div>

      <label className="a11y-row">
        <input
          type="checkbox"
          checked={prefs.density === 'compact'}
          onChange={(e) => onPrefsChange({ density: e.target.checked ? 'compact' : 'comfortable' })}
        />
        Compact density
      </label>

      <label className="a11y-row">
        <input
          type="checkbox"
          checked={prefs.reducedMotion}
          onChange={(e) => onPrefsChange({ reducedMotion: e.target.checked })}
        />
        Reduce motion
      </label>

      <button type="button" className="a11y-row replay-button" onClick={onReplay} disabled={!replayAvailable}>
        Show my path
      </button>
    </div>
  )
}
