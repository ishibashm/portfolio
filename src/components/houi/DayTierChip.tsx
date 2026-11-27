import { TIER_LABELS, type DayTier } from "@/utils/dayTier";
import { TIER_BADGE_CLASS } from "@/utils/tierDisplay";

export function DayTierChip({
  tier,
  label,
  className = "",
}: {
  tier: DayTier;
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${TIER_BADGE_CLASS[tier]}${className ? ` ${className}` : ""}`}
    >
      {label ?? `${tier} ${TIER_LABELS[tier]}`}
    </span>
  );
}
