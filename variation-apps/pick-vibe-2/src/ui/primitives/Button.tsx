import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.css';

export type ButtonVariant = 'Primary' | 'Secondary' | 'Tertiary' | 'Booking' | 'Delete';

interface ButtonBaseProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  children: ReactNode;
  /** Native HTML button type — separate from `variant` to avoid the prop-name collision. */
  htmlType?: 'button' | 'submit' | 'reset';
}

// Icon/visited props are only meaningful for the variants that actually render them —
// gated per-variant here so passing e.g. `leadingIcon` to Booking/Delete is a type error
// instead of a silent no-op.
export type ButtonProps =
  | (ButtonBaseProps & {
      variant?: 'Primary' | 'Secondary';
      /** Leading "+" icon. */
      leadingIcon?: boolean;
      /** Trailing "+" icon. */
      trailingIcon?: boolean;
    })
  | (ButtonBaseProps & {
      variant: 'Tertiary';
      /** Leading arrow icon. */
      leadingIcon?: boolean;
      /** Trailing arrow icon. */
      trailingIcon?: boolean;
      /** Real `:visited` doesn't apply to `<button>`, so this is explicit. */
      visited?: boolean;
    })
  | (ButtonBaseProps & { variant: 'Booking' | 'Delete' });

type ForceState = 'hover' | 'pressed' | 'focused';

interface InternalButtonProps extends ButtonBaseProps {
  variant?: ButtonVariant;
  leadingIcon?: boolean;
  trailingIcon?: boolean;
  visited?: boolean;
  /** Dev/gallery-only: force a pseudo-state's look for visual QA against Figma. */
  forceState?: ForceState;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  Primary: styles.primary,
  Secondary: styles.secondary,
  Tertiary: styles.tertiary,
  Booking: styles.booking,
  Delete: styles.delete,
};

const FORCE_CLASS: Record<ForceState, string> = {
  hover: styles.isForceHover,
  pressed: styles.isForcePressed,
  focused: styles.isForceFocused,
};

function PlusGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={styles.icon} aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8.85356 1.82786C8.85416 1.37124 8.48448 1.0006 8.02787 1C7.57126 0.999403 7.20061 1.36908 7.20002 1.82569L7.19301 7.17334H1.82677C1.37016 7.17334 1 7.54349 1 8.00011C1 8.45672 1.37016 8.82688 1.82677 8.82688H7.19084L7.18383 14.1721C7.18323 14.6288 7.55291 14.9994 8.00952 15C8.46613 15.0006 8.83678 14.6309 8.83737 14.1743L8.84438 8.82688H14.1732C14.6298 8.82688 15 8.45672 15 8.00011C15 7.54349 14.6298 7.17334 14.1732 7.17334H8.84655L8.85356 1.82786Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ArrowGlyph({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      className={styles.icon}
      style={direction === 'left' ? { transform: 'scaleX(-1)' } : undefined}
      aria-hidden="true"
    >
      <path
        d="M20.78 11.2498C21.0725 11.5427 21.0728 12.0176 20.78 12.3104L16.3102 16.7801C16.0174 17.0725 15.5425 17.0725 15.2497 16.7801C14.9573 16.4873 14.9573 16.0123 15.2497 15.7195L18.4392 12.5301H3.90595C3.49174 12.5301 3.15595 12.1943 3.15595 11.7801C3.15605 11.366 3.4918 11.0301 3.90595 11.0301H18.4392L15.2497 7.84063C14.9571 7.54774 14.9569 7.0729 15.2497 6.78009C15.5425 6.48727 16.0173 6.48744 16.3102 6.78009L20.78 11.2498Z"
        fill="currentColor"
      />
    </svg>
  );
}

function renderButton({
  variant = 'Primary',
  leadingIcon,
  trailingIcon,
  visited,
  htmlType = 'button',
  forceState,
  className,
  children,
  ...rest
}: InternalButtonProps) {
  const classNames = [
    styles.button,
    VARIANT_CLASS[variant],
    variant === 'Tertiary' && visited ? styles.visited : null,
    forceState ? FORCE_CLASS[forceState] : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  // Booking/Delete have no icon slot in the design; Tertiary uses arrows instead of the plus glyph.
  const isIconEligible = variant === 'Primary' || variant === 'Secondary';
  const isTertiary = variant === 'Tertiary';

  // `type` is spread-protected by placing `{...rest}` before it: rest can never legitimately
  // contain `type` (ButtonProps omits it), but if a caller smuggles one in via an untyped
  // spread, our explicit `type` still wins since it's declared last.
  return (
    <button className={classNames} {...rest} type={htmlType}>
      {isIconEligible && leadingIcon && <PlusGlyph />}
      {isTertiary && leadingIcon && <ArrowGlyph direction="left" />}
      {children}
      {isIconEligible && trailingIcon && <PlusGlyph />}
      {isTertiary && trailingIcon && <ArrowGlyph direction="right" />}
    </button>
  );
}

export default function Button(props: ButtonProps) {
  return renderButton(props);
}

/**
 * Dev/gallery-only variant of `Button` that also accepts `forceState`, for visual QA
 * against Figma. Not part of the supported public API — never use outside the component
 * gallery.
 */
export function ButtonForceStatePreview(props: ButtonProps & { forceState?: ForceState }) {
  return renderButton(props);
}
