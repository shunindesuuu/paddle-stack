/**
 * The app's single icon vocabulary.
 *
 * Everything goes through this map so icons stay consistent and swapping the
 * underlying set is a one-file change. Previously the tab bar used emoji,
 * which render as full-colour glyphs that ignore the active tint and look
 * different on every Android skin.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { ColorValue } from 'react-native';

export type IconName =
  | 'play'
  | 'players'
  | 'history'
  | 'settings'
  | 'edit'
  | 'remove'
  | 'restore'
  | 'chevron'
  | 'check'
  | 'plus'
  | 'minus'
  | 'swap'
  | 'trophy'
  | 'feedback'
  | 'tutorial'
  | 'link'
  | 'unlink'
  | 'trendUp'
  | 'trendDown'
  | 'search'
  | 'more';

const GLYPH: Record<IconName, React.ComponentProps<typeof Ionicons>['name']> = {
  play: 'tennisball',
  players: 'people',
  history: 'stats-chart',
  settings: 'settings-sharp',
  edit: 'pencil',
  remove: 'close',
  restore: 'arrow-undo',
  chevron: 'chevron-forward',
  check: 'checkmark',
  plus: 'add',
  minus: 'remove',
  swap: 'swap-horizontal',
  trophy: 'trophy',
  feedback: 'mail-outline',
  tutorial: 'book-outline',
  link: 'link',
  unlink: 'unlink',
  trendUp: 'trending-up',
  trendDown: 'trending-down',
  search: 'search',
  more: 'ellipsis-horizontal',
};

export function Icon({
  name,
  size = 20,
  color,
}: {
  name: IconName;
  size?: number;
  color?: ColorValue;
}) {
  return <Ionicons name={GLYPH[name]} size={size} color={color as string} />;
}
