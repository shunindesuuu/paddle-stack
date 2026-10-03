/**
 * Shared animation presets.
 *
 * Centralised so timings stay consistent - a session screen where the panels,
 * the court cards and the standings each ease at their own speed reads as
 * sloppy rather than lively.
 *
 * Everything is deliberately short. These run while someone is mid-game
 * trying to tap in a score, so the animation has to be over before it can get
 * in the way; anything past ~250ms starts feeling like waiting.
 *
 * Every preset honours the OS "reduce motion" setting, which matters here
 * because the layout transitions fire on lists that can rearrange (filtering
 * a roster, dropping a player) rather than on decorative flourishes.
 */

import {
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
  ReduceMotion,
} from 'react-native-reanimated';

const REDUCE = ReduceMotion.System;

/** Panels and banners that toggle in place. */
export const panelIn = FadeIn.duration(160).reduceMotion(REDUCE);
export const panelOut = FadeOut.duration(120).reduceMotion(REDUCE);

/** Rows arriving in a list - a small rise reads as "this is new". */
export const rowIn = FadeInDown.duration(200).reduceMotion(REDUCE);
export const rowOut = FadeOut.duration(140).reduceMotion(REDUCE);

/**
 * Repositioning within a list: filtering a roster, or closing the gap left by
 * a removed player. Slightly slower than the fades because it moves further.
 */
export const rowLayout = LinearTransition.duration(220).reduceMotion(REDUCE);

/**
 * Staggered entrance, capped so a 20-player roster doesn't take two seconds
 * to finish arriving. Past the cap everything lands together.
 */
export function rowInAt(index: number) {
  return FadeInDown.duration(200)
    .delay(Math.min(index, 8) * 25)
    .reduceMotion(REDUCE);
}
