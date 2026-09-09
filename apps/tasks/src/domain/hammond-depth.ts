export type DepthSlot = {
  id: string;
  date: string;
  start_time: string;
  minutes: number;
  project_id: string | null;
  project_title: string | null;
};

export type DepthBudget = {
  available_slots: DepthSlot[];
  allocations: DepthSlot[];
  unallocated: number;
  note: string;
};

export function allocateDepthBudget(input: {
  windows: Array<{ id?: string; date: string; start_time: string; minutes: number }>;
  assignments: Array<{ slot_id: string; project_id: string; project_title: string }>;
}): DepthBudget {
  const available_slots: DepthSlot[] = input.windows.map((w, i) => ({
    id: w.id ?? `deep_${i + 1}`,
    date: w.date,
    start_time: w.start_time,
    minutes: w.minutes,
    project_id: null,
    project_title: null
  }));

  const byId = new Map(available_slots.map((s) => [s.id, s]));
  for (const a of input.assignments) {
    const slot = byId.get(a.slot_id);
    if (!slot) continue;
    slot.project_id = a.project_id;
    slot.project_title = a.project_title;
  }

  const allocations = available_slots.filter((s) => s.project_id);
  const unallocated = available_slots.length - allocations.length;
  return {
    available_slots,
    allocations,
    unallocated,
    note: available_slots.length
      ? `${available_slots.length} suitable deep window(s). ${allocations.length} assigned. ${unallocated} unallocated.`
      : 'No explicit deep windows found — reporting available capacity only.'
  };
}

export type DependencyNode = {
  id: string;
  title: string;
  kind: 'goal' | 'project' | 'task' | 'milestone';
};

export type DependencyLens = {
  focus_id: string;
  upstream: DependencyNode[];
  downstream: DependencyNode[];
  blockers: DependencyNode[];
  critical_chain: DependencyNode[];
};

export function goalDependencyLens(input: {
  focus: DependencyNode;
  links: Array<{ from_id: string; to_id: string }>;
  nodes: DependencyNode[];
}): DependencyLens {
  const byId = new Map(input.nodes.map((n) => [n.id, n]));
  const upstream: DependencyNode[] = [];
  const downstream: DependencyNode[] = [];
  for (const link of input.links) {
    if (link.to_id === input.focus.id) {
      const n = byId.get(link.from_id);
      if (n) upstream.push(n);
    }
    if (link.from_id === input.focus.id) {
      const n = byId.get(link.to_id);
      if (n) downstream.push(n);
    }
  }
  const blockers = upstream.slice(0, 2);
  const critical_chain = [...upstream.slice(0, 3), input.focus, ...downstream.slice(0, 2)];
  return {
    focus_id: input.focus.id,
    upstream,
    downstream,
    blockers,
    critical_chain
  };
}
