import type { PlantDef, TraitSet } from '../types';
import type { PlantInstance } from '../state';
import { PROPAGATION_RECIPES } from '../data/plants';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function blendTraits(a: TraitSet, b: TraitSet, rand: () => number, mutation: number): TraitSet {
  const out = { ...a };
  for (const key of Object.keys(a) as (keyof TraitSet)[]) {
    if (key === 'colorHue') {
      const diff = ((b.colorHue - a.colorHue + 540) % 360) - 180;
      out.colorHue = (a.colorHue + diff / 2 + (rand() - 0.5) * mutation + 360) % 360;
      continue;
    }
    if (key === 'quality') continue;
    const avg = (a[key] + b[key]) / 2;
    out[key] = clamp(avg + (rand() - 0.5) * mutation * 2, 0, 100);
  }
  out.quality = 50;
  return out;
}

export interface PropagationResult {
  success: boolean;
  resultDefId: string | null;
  traits: TraitSet | null;
  isKnownRecipe: boolean;
  isVariant: boolean;
  message: string;
}

function findRecipe(idA: string, idB: string) {
  return PROPAGATION_RECIPES.find(
    (r) => (r.parentA === idA && r.parentB === idB) || (r.parentA === idB && r.parentB === idA)
  );
}

function isSignificantVariant(traits: TraitSet, base: Partial<TraitSet>): boolean {
  return (Object.keys(base) as (keyof TraitSet)[]).some((k) => {
    if (k === 'colorHue' || k === 'quality') return false;
    const baseVal = base[k];
    if (baseVal === undefined) return false;
    return Math.abs(traits[k] - baseVal) > 22;
  });
}

export function attemptPropagation(
  parentA: { instance: PlantInstance; def: PlantDef },
  parentB: { instance: PlantInstance; def: PlantDef },
  resultDefLookup: (id: string) => PlantDef | undefined,
  rand: () => number = Math.random
): PropagationResult {
  const recipe = findRecipe(parentA.def.id, parentB.def.id);
  if (recipe) {
    const bothQualified = parentA.instance.qualityEstimate >= recipe.minParentQuality && parentB.instance.qualityEstimate >= recipe.minParentQuality;
    if (bothQualified) {
      const resultDef = resultDefLookup(recipe.result);
      const base = resultDef?.baseTraits ?? {};
      const parentBlend = blendTraits(parentA.instance.traits, parentB.instance.traits, rand, 8);
      const traits: TraitSet = { ...parentBlend, ...base, colorHue: parentBlend.colorHue, quality: 50 };
      return {
        success: true,
        resultDefId: recipe.result,
        traits,
        isKnownRecipe: true,
        isVariant: true,
        message: `A ${resultDef?.name ?? 'new hybrid'} — something that has never grown in the wild.`,
      };
    }
    return {
      success: false,
      resultDefId: null,
      traits: null,
      isKnownRecipe: false,
      isVariant: false,
      message: 'The specimens seem compatible, but neither is developed enough yet.',
    };
  }

  if (parentA.def.id === parentB.def.id) {
    const traits = blendTraits(parentA.instance.traits, parentB.instance.traits, rand, 14);
    const variant = isSignificantVariant(traits, parentA.def.baseTraits);
    return {
      success: true,
      resultDefId: parentA.def.id,
      traits,
      isKnownRecipe: false,
      isVariant: variant,
      message: variant
        ? `An unusual ${parentA.def.name} variant — noticeably different from the wild form.`
        : `A new ${parentA.def.name}, carrying traits from both parents.`,
    };
  }

  // Unlisted cross-species combination: usually nothing comes of it, but
  // there's a small chance of an unexpected variant. This keeps
  // experimentation from feeling like a lookup table.
  if (rand() < 0.15) {
    const traits = blendTraits(parentA.instance.traits, parentB.instance.traits, rand, 22);
    return {
      success: true,
      resultDefId: parentA.def.id,
      traits,
      isKnownRecipe: false,
      isVariant: true,
      message: `Unexpected — a ${parentA.def.name} variant showing traces of ${parentB.def.name}.`,
    };
  }
  return {
    success: false,
    resultDefId: null,
    traits: null,
    isKnownRecipe: false,
    isVariant: false,
    message: 'Nothing came of it this time. Perhaps a different pairing would work.',
  };
}
