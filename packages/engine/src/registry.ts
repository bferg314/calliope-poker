import type { VariantDefinition } from './variants/types.js';

const variants = new Map<string, VariantDefinition>();

export function registerVariant(def: VariantDefinition): void {
  if (!/^[a-z0-9-]{2,32}$/.test(def.id)) {
    throw new Error(`Variant id must be lowercase letters, digits or dashes: ${def.id}`);
  }
  if (def.streets.length === 0) throw new Error(`Variant ${def.id} has no streets`);
  variants.set(def.id, def);
}

export function hasVariant(id: string): boolean {
  return variants.has(id);
}

export function getVariant(id: string): VariantDefinition {
  const v = variants.get(id);
  if (!v) throw new Error(`Unknown variant: ${id}`);
  return v;
}

export function listVariants(): VariantDefinition[] {
  return [...variants.values()];
}
