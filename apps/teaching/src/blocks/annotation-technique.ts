import {
  FAMILY_PALETTE,
  familyOfTechnique,
  lookupTechnique,
  type LiteraryElementsTable
} from '@/blocks/literary-elements';
import type {
  AnnotationColour,
  AnnotationFamilyKey,
  AnnotationItem,
  AnnotationLayer,
  AnnotationSublayer
} from '@/schemas/block';

export type TechniqueTagResult = {
  layers: AnnotationLayer[];
  annotation: AnnotationItem;
  techniqueName: string;
  symbol: string;
  colour: AnnotationColour;
  familyKey: string;
  subgroupId: string;
};

function nextId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Tag an annotation with a Periodic Table technique.
 * Creates the family layer (and missing sub-layer) when the annotation is not
 * already on a free/lens/teacher layer that Adam chose deliberately.
 */
export function applyTechniqueTag(options: {
  table: LiteraryElementsTable;
  techniqueId: string;
  annotation: AnnotationItem;
  layers: AnnotationLayer[];
  blockId: string;
  keepLayer?: boolean;
  now?: string;
}): TechniqueTagResult | null {
  const technique = lookupTechnique(options.table, options.techniqueId);
  if (!technique) return null;
  const family = familyOfTechnique(options.table, technique);
  if (!family) return null;

  const colour = FAMILY_PALETTE[family.key];
  const subgroupMeta = options.table.subgroups.find((sg) => sg.id === technique.subgroup);
  if (!subgroupMeta) return null;

  let layers = options.layers.map((layer) => ({
    ...layer,
    sublayers: layer.sublayers?.map((s) => ({ ...s }))
  }));

  const currentLayer = layers.find((layer) => layer.id === options.annotation.layer_id);
  const keepLayer =
    options.keepLayer === true ||
    (options.keepLayer !== false &&
      currentLayer != null &&
      (currentLayer.kind === 'free' ||
        currentLayer.kind === 'lens' ||
        currentLayer.kind === 'teacher'));

  let layerId = options.annotation.layer_id;
  let sublayerId: string | undefined = options.annotation.sublayer_id;

  if (!keepLayer) {
    let familyLayer = layers.find(
      (layer) => layer.kind === 'family' && layer.family === family.key
    );
    if (!familyLayer) {
      const sublayers: AnnotationSublayer[] = options.table.subgroups
        .filter((sg) => sg.family === family.key)
        .map((sg) => ({
          id: nextId(`${options.blockId}_sub`),
          name: sg.name,
          subgroup: sg.id
        }));
      familyLayer = {
        id: nextId(`${options.blockId}_layer`),
        name: family.name,
        kind: 'family',
        family: family.key,
        colour,
        sublayers
      };
      // Keep teacher notes last if present.
      const teacherIdx = layers.findIndex((layer) => layer.kind === 'teacher');
      if (teacherIdx >= 0) {
        layers = [
          ...layers.slice(0, teacherIdx),
          familyLayer,
          ...layers.slice(teacherIdx)
        ];
      } else {
        layers = [...layers, familyLayer];
      }
    } else if (!familyLayer.sublayers?.some((s) => s.subgroup === technique.subgroup)) {
      const sub: AnnotationSublayer = {
        id: nextId(`${options.blockId}_sub`),
        name: subgroupMeta.name,
        subgroup: technique.subgroup
      };
      familyLayer = {
        ...familyLayer,
        colour: familyLayer.colour || colour,
        sublayers: [...(familyLayer.sublayers ?? []), sub]
      };
      layers = layers.map((layer) =>
        layer.id === familyLayer!.id ? familyLayer! : layer
      );
    }

    layerId = familyLayer.id;
    const sub =
      familyLayer.sublayers?.find((s) => s.subgroup === technique.subgroup) ??
      familyLayer.sublayers?.[0];
    sublayerId = sub?.id;
  }

  const stamp = options.now ?? new Date().toISOString();
  const annotation: AnnotationItem = {
    ...options.annotation,
    layer_id: layerId,
    sublayer_id: sublayerId,
    technique: { id: technique.id, table_version: options.table.version },
    updated_at: stamp
  };

  return {
    layers,
    annotation,
    techniqueName: technique.name,
    symbol: technique.symbol,
    colour,
    familyKey: family.key,
    subgroupId: technique.subgroup
  };
}

export function createFamilyLayerFromTable(options: {
  table: LiteraryElementsTable;
  familyKey: AnnotationFamilyKey;
  blockId: string;
}): AnnotationLayer {
  const family = options.table.families.find((fam) => fam.key === options.familyKey);
  if (!family) {
    throw new Error(`Unknown family ${options.familyKey}`);
  }
  return {
    id: nextId(`${options.blockId}_layer`),
    name: family.name,
    kind: 'family',
    family: family.key,
    colour: FAMILY_PALETTE[family.key],
    sublayers: options.table.subgroups
      .filter((sg) => sg.family === family.key)
      .map((sg) => ({
        id: nextId(`${options.blockId}_sub`),
        name: sg.name,
        subgroup: sg.id
      }))
  };
}
