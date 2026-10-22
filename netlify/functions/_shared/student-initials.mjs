// Generated from apps/teaching/src/schemas/student-initials.ts; regenerate with scripts/generate-alchemy-schema.mjs.

// apps/teaching/src/schemas/student-initials.ts
var INITIALS_PATTERN = /^[A-Z]{1,4}[0-9]?$/;
var STUDENT_ID_PATTERN = /^st_[a-z0-9_]{1,24}$/;
function stripMarks(text) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function normaliseInitials(text) {
  return stripMarks(String(text ?? "")).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
}
function deriveInitials(name) {
  const letters = stripMarks(String(name ?? "")).split(/[\s-]+/).map((word) => word.replace(/[^A-Za-z]/g, "").charAt(0)).join("").toUpperCase().slice(0, 4);
  return letters || "S";
}
function fnv1a(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36);
}
function studentIdFor(name) {
  return `st_${fnv1a(String(name ?? "").replace(/\s+/g, " ").trim().toLowerCase())}`;
}
function freeInitials(base, taken) {
  if (!taken.has(base)) return base;
  for (let n = 2; n <= 9; n += 1) {
    const next = `${base.slice(0, 4)}${n}`;
    if (!taken.has(next)) return next;
  }
  for (const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
    const next = `${base.slice(0, 3)}${letter}`;
    if (!taken.has(next)) return next;
  }
  return base;
}
function assignInitials(students) {
  const held = /* @__PURE__ */ new Set();
  for (const s of students) {
    const own = normaliseInitials(s.initials ?? "");
    if (INITIALS_PATTERN.test(own)) held.add(own);
  }
  const used = /* @__PURE__ */ new Set();
  const reserved = /* @__PURE__ */ new Set();
  const keeps = students.map((s) => {
    if (s.id && STUDENT_ID_PATTERN.test(s.id) && !reserved.has(s.id)) {
      reserved.add(s.id);
      return true;
    }
    return false;
  });
  const ids = /* @__PURE__ */ new Set();
  return students.map((s, index) => {
    const own = normaliseInitials(s.initials ?? "");
    let initials;
    if (INITIALS_PATTERN.test(own) && !used.has(own)) initials = own;
    else initials = freeInitials(deriveInitials(s.name), /* @__PURE__ */ new Set([...held, ...used]));
    used.add(initials);
    let id;
    if (keeps[index]) id = s.id;
    else {
      const base = studentIdFor(s.name);
      id = base;
      for (let n = 2; ids.has(id) || reserved.has(id); n += 1) id = `${base}_${n}`;
    }
    ids.add(id);
    return { ...s, id, initials };
  });
}
function initialsProblems(students) {
  const out = /* @__PURE__ */ new Map();
  const first = /* @__PURE__ */ new Map();
  students.forEach((s, i) => {
    const value = normaliseInitials(s.initials ?? "");
    if (!INITIALS_PATTERN.test(value)) {
      out.set(i, "Use 1\u20134 letters, then a number if needed, like BB or BB2.");
      return;
    }
    const earlier = first.get(value);
    if (earlier !== void 0) out.set(i, `${value} is already used by ${students[earlier]?.name ?? "another student"}.`);
    else first.set(value, i);
  });
  return out;
}
export {
  INITIALS_PATTERN,
  STUDENT_ID_PATTERN,
  assignInitials,
  deriveInitials,
  initialsProblems,
  normaliseInitials,
  studentIdFor
};
