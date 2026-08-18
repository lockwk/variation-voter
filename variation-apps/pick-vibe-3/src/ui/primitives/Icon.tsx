/**
 * Renders an exported SVG from /public/icons by friendly name.
 * (Real DS assets — kept as <img> so their multi-color fills are preserved.)
 */

const FILES = {
  logo: 'royalcaribbean-logo.svg',
  newChat: 'new-chat.svg',
  newChatHover: 'new-chat-hover.svg',
  chats: 'chats.svg',
  forYou: 'for-you.svg',
  edit: 'edit.svg',
  sidebarToggle: 'sidebar-toggle.svg',
  userAvatar: 'user-avatar.svg',
  profileChevron: 'profile-chevron-right.svg',
  // RC_Arrow-right — Sidebar's profile-pill trailing glyph (RC_Nav Panel_B). Replaces
  // profileChevron for that one usage; profileChevron itself stays for any other caller.
  profileArrow: 'RC_Arrow-right.svg',
  externalLink: 'external-link.svg',
  titleChevron: 'title-chevron-down.svg',
  aiSparkle: 'ai-sparkle.svg',
  wizardClose: 'wizard-close.svg',
  sheetClose: 'sheet-close.svg',
  stepperAdd: 'action-add.svg',
  stepperRemove: 'action-remove.svg',
  ratingStar: 'rc-rating-star.svg',
  bed: 'RC_Bed.svg',
  ship: 'RC_Ship.svg',
  guests: 'RC_Guests.svg',
  pin: 'RC_Pin.svg',
  calendar: 'RC_Calendar.svg',
  photos: 'RC_Photos.svg',
  anchor: 'RC_Anchor.svg',
  pool: 'RC_Pool.svg',
  dining: 'RC_Dining.svg',
  ruler: 'RC_Ruler.svg',
  documents: 'RC_Documents.svg',
  beverages: 'RC_Beverages.svg',
  entertainment: 'RC_Entertainment.svg',
  chevronDownBrand: 'chevron-down-brand.svg',
  externalLinkBrand: 'external-link-brand.svg',
  // stateful (default / hover / disabled|active)
  pagerLeft: 'pagination-left-default.svg',
  pagerLeftHover: 'pagination-left-hover.svg',
  pagerLeftDisabled: 'pagination-left-disabled.svg',
  pagerRight: 'pagination-right-default.svg',
  pagerRightHover: 'pagination-right-hover.svg',
  pagerRightDisabled: 'pagination-right-disabled.svg',
  optionChevron: 'option-chevron-default.svg',
  optionChevronHover: 'option-chevron-hover.svg',
  optionCheck: 'option-check.svg',
  multiCheck: 'RC_Check.svg',
  calendarLeft: 'calendar-left.svg',
  calendarRight: 'calendar-right.svg',
  scroll: 'scroll-default.svg',
  scrollHover: 'scroll-hover.svg',
  scrollActive: 'scroll-active.svg',
  msgUp: 'msg-up.svg',
  msgDown: 'msg-down.svg',
  msgCopy: 'msg-copy.svg',
  rcNotification: 'RC_Notification.svg',
  shipTime: 'RC_Ship-time.svg',
  rcInformation: 'RC_Information.svg',
  notificationRefresh: 'notification-refresh.svg',
  notificationClose: 'notification-close.svg',
  backArrow: 'RC_Arrow-left.svg',
  preferencesFilter: 'RC_Filter.svg',
  userAccount: 'RC_User.svg',
  signOut: 'RC_Enter.svg',
  // Distinct from the existing `externalLink` (baked white, meant for a dark/colored surface) —
  // this is the dark-navy variant for a plain white row, e.g. UserMenuModal's "My Account".
  accountExternalLink: 'RC_External-link-dark.svg',
  // Plain X glyph, distinct from `sheetClose` (a pre-composited circle+shadow+X badge meant to
  // BE the whole close button) — for callers that draw their own button chrome via CSS.
  closeX: 'RC_Close-X.svg',
  // Distinct from `rcInformation` (a purple/blue gradient fill, used by Notification and its
  // gallery examples) — this is the solid-navy outline variant for a plain menu row, e.g.
  // UserMenuModal's "Data Privacy".
  infoOutline: 'RC_Information-outline.svg',
  // RC_Shorts — venue "dress code" attribute icon (e.g. TileNew Vertical's "Casual" row).
  shorts: 'RC_Shorts.svg',
  // RC_Icon_Play — video/media play glyph (e.g. VideoPlaceholder's play button).
  play: 'RC_Icon-play.svg',
  // For You page "Things You Can Do" list glyphs (RC_Compare/Liqueur/Coconut-tree/suitcase-gradient).
  compare: 'RC_Compare.svg',
  liqueur: 'RC_Liqueur.svg',
  coconutTree: 'RC_Coconut-tree.svg',
  suitcase: 'RC_Suitcase-gradient.svg',
  // Same purple->blue gradient family as the 4 above, for that same list's "Book
  // a room" row — distinct from the plain navy `bed` (used elsewhere, e.g. tile
  // attribute rows, where a gradient icon next to navy text would look wrong).
  bedGradient: 'RC_Bed-gradient.svg',
  // RC_Tag's small icon (e.g. "Save 10%") — see RcTag.
  tagSparkle: 'RC_Tag-icon.svg',
  // RC_Chips' leading sparkle (distinct from the larger `aiSparkle` glyph) — see SuggestionChips.
  chipSparkle: 'RC_Chip-sparkle.svg',
  // Static 3-sparkle cluster from the Chat-Canvas Figma file — Login hero's rotating
  // title icon (distinct from the single-glyph `aiSparkle`, which has its own Lottie
  // burst variant via AiSparkle and isn't used here since this icon is static).
  sparkleHero: 'RC_Sparkle-hero.svg',
} as const;

export type IconName = keyof typeof FILES;

interface IconProps {
  name: IconName;
  size?: number;
  width?: number;
  height?: number;
  className?: string;
  style?: React.CSSProperties;
  alt?: string;
}

// Bundled icon assets, keyed by filename (e.g. `RC_Chip-sparkle.svg`) so Vite
// fingerprints/relocates them instead of leaving an absolute `/icons/...` URL
// that would 404 once this app is served from a subpath. Only the icons that
// actually exist under `src/assets/icons` resolve here; any `FILES[name]`
// entry without a matching asset falls back gracefully (empty src) rather
// than crashing the build.
const ICON_URLS = import.meta.glob('../../assets/icons/*', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

function urlForFile(filename: string): string {
  const match = Object.entries(ICON_URLS).find(([path]) => path.endsWith(`/${filename}`));
  return match?.[1] ?? '';
}

export default function Icon({ name, size, width, height, className, style, alt = '' }: IconProps) {
  return (
    <img
      src={urlForFile(FILES[name])}
      width={width ?? size}
      height={height ?? size}
      className={className}
      style={style}
      alt={alt}
      draggable={false}
    />
  );
}
