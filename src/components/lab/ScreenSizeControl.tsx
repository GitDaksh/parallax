"use client";

const PRESETS = [
  { label: "Phone", inches: 6.1 },
  { label: "Tablet", inches: 10.4 },
  { label: "13″ laptop", inches: 13.3 },
  { label: "15″ laptop", inches: 15.3 },
  { label: "24″ monitor", inches: 24 },
];

type Props = {
  inches: number;
  onChange: (inches: number) => void;
};

export default function ScreenSizeControl({ inches, onChange }: Props) {
  return (
    <fieldset className="flex flex-col gap-3 rounded-md border border-line p-4">
      <legend className="px-1 text-sm font-medium">Screen size</legend>
      <p className="text-xs text-muted">
        Match your screen so the window matches real-world size.
      </p>

      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => {
          const active = inches === preset.inches;
          return (
            <button
              key={preset.label}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(preset.inches)}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground ${
                active
                  ? "border-foreground bg-white/10"
                  : "border-line hover:border-muted hover:bg-white/5"
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <input
          type="range"
          min={5}
          max={34}
          step={0.1}
          value={inches}
          aria-label="Screen diagonal in inches"
          onChange={(event) => onChange(Number(event.target.value))}
          className="w-48 accent-white"
        />
        <span className="font-mono text-xs">{inches.toFixed(1)}″</span>
      </div>
    </fieldset>
  );
}