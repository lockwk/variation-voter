import styles from './SuggestionChips.module.css';
import Icon from '../primitives/Icon';

export default function SuggestionChips({
  chips,
  onSelect,
  icon,
  wrap,
  className,
}: {
  chips: string[];
  onSelect: (chip: string) => void;
  /** Leading sparkle icon before each chip's label (sourced from Figma "RC_Chips",
   *  which always shows one) — opt-in so LandingState's existing text-only chips
   *  stay unchanged. */
  icon?: boolean;
  /** Wrap onto multiple left-aligned rows instead of the default single centered
   *  row — e.g. a Q&A grid inside a fixed-width panel. */
  wrap?: boolean;
  className?: string;
}) {
  return (
    <div className={[styles.row, wrap && styles.wrap, className].filter(Boolean).join(' ')}>
      {chips.map((chip, i) => (
        // Index, not chip text — Q&A-style chip lists can legitimately repeat
        // the same prompt twice (see For You's "You have questions" grid).
        <button key={i} className={styles.chip} onClick={() => onSelect(chip)}>
          {icon && <Icon name="chipSparkle" size={12} className={styles.chipIcon} />}
          {chip}
        </button>
      ))}
    </div>
  );
}
