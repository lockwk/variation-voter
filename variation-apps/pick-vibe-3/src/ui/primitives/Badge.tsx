import type { ReactNode } from 'react';
import styles from './Badge.module.css';

export type BadgeVariant = 'confirmed' | 'informational' | 'brand';

export interface BadgeProps {
  variant: BadgeVariant;
  children: ReactNode;
  className?: string;
}

const VARIANT_CLASS: Record<BadgeVariant, string> = {
  confirmed: styles.confirmed,
  informational: styles.informational,
  brand: styles.brand,
};

export default function Badge({ variant, children, className }: BadgeProps) {
  const classNames = [styles.badge, VARIANT_CLASS[variant], className].filter(Boolean).join(' ');
  return <span className={classNames}>{children}</span>;
}
