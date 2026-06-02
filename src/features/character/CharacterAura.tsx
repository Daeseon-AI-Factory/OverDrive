import { StyleSheet, View } from 'react-native';
import { useCombatPowerStore } from '@/stores/combatPowerStore';
import { auraFromCp } from './auraFromCp';

/**
 * Power-up aura behind the character — color + intensity scale with Combat Power (auraFromCp).
 * v1 is View-based (colored halos + glow) for reliability; the Skia/SkSL radial-gradient + energy
 * turbulence version is a fast-follow iterated on-device (spec §6.4). Non-interactive (behind).
 */
export function CharacterAura() {
  const score = useCombatPowerStore((s) => s.score);
  const { color, intensity01 } = auraFromCp(score);
  const base = 0.12 + 0.4 * intensity01; // 0.12 .. 0.52

  return (
    <View pointerEvents="none" style={styles.wrap}>
      <View
        style={[styles.halo, styles.outer, { backgroundColor: color, opacity: base * 0.4, shadowColor: color }]}
      />
      <View
        style={[styles.halo, styles.inner, { backgroundColor: color, opacity: base, shadowColor: color }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  halo: {
    aspectRatio: 1,
    borderRadius: 999,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 40,
  },
  outer: { width: '92%' },
  inner: { width: '52%' },
});
