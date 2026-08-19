type SpecPlateProps = {
  viscosity?: string | null;
  size?: string | null;
  oilType?: string | null;
};

export function SpecPlate({ viscosity, size, oilType }: SpecPlateProps) {
  const specs = [viscosity, size, oilType].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  if (specs.length === 0) return null;

  return (
    <div className="inline-flex items-center gap-2 rounded-sm border border-shop-ink/10 bg-shop-bg px-2.5 py-1 shadow-[inset_0_1px_2px_rgba(0,0,0,0.6)]">
      {specs.map((spec, index) => (
        <span key={spec} className="flex items-center gap-2">
          <span className="font-shop-mono text-xs tracking-wide text-shop-amber">{spec}</span>
          {index < specs.length - 1 && <span className="h-3 w-px bg-shop-ink/10" aria-hidden="true" />}
        </span>
      ))}
    </div>
  );
}
