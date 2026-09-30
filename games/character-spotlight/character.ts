export interface CharacterUpgrades {
  core: number;      // Body chassis & energy
  visor: number;     // Optics & scanner range
  armor: number;     // Plating & defense
  aura: number;      // Spark emitter & glow
  mobility: number;  // Thruster / movement speed
}

export interface CharacterState {
  level: number;
  points: number;
  parts: Record<string, number>;
  upgrades: CharacterUpgrades;
  equippedSkin: string;
}

export const INITIAL_PARTS: Record<string, number> = {
  "Core Fragment": 2,
  "Visor Lens": 1,
  "Titanium Plate": 1,
  "Aura Spark": 0,
  "Jetpack Thruster": 0,
};

export const INITIAL_CHARACTER_STATE: CharacterState = {
  level: 1,
  points: 150,
  parts: { ...INITIAL_PARTS },
  upgrades: {
    core: 1,
    visor: 1,
    armor: 1,
    aura: 1,
    mobility: 1,
  },
  equippedSkin: "Default",
};

export interface UpgradeCost {
  points: number;
  partName: string;
  partCount: number;
}

export const UPGRADE_METADATA = {
  core: { name: "Core Power", desc: "Boosts internal reactor, health & capacity", part: "Core Fragment" },
  visor: { name: "Optics Visor", desc: "Improves clarity, targeting & item magnets", part: "Visor Lens" },
  armor: { name: "Nano Plating", desc: "Hardened shell to withstand obstacle hits", part: "Titanium Plate" },
  aura: { name: "Aura Spark", desc: "Energy field emission and point multiplier", part: "Aura Spark" },
  mobility: { name: "Thruster Boots", desc: "Increases run speed and jump height", part: "Jetpack Thruster" },
} as const;

export function getUpgradeCost(currentTier: number): UpgradeCost {
  return {
    points: 100 * currentTier,
    partName: "Core Fragment",
    partCount: currentTier,
  };
}

export function canAscendLevel(upgrades: CharacterUpgrades, currentLevel: number): boolean {
  // All 5 components must be upgraded to at least (currentLevel + 1)
  const targetTier = currentLevel + 1;
  return (
    upgrades.core >= targetTier &&
    upgrades.visor >= targetTier &&
    upgrades.armor >= targetTier &&
    upgrades.aura >= targetTier &&
    upgrades.mobility >= targetTier
  );
}
