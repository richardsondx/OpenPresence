import type { EntityRef, MirrorObject } from "./types";

export type ThreadContextStatus = "complete" | "partial" | "unavailable";

export interface SocialThreadContext {
  status: ThreadContextStatus;
  focalObject: MirrorObject;
  conversationExternalRef?: string;
  rootExternalRef?: EntityRef;
  ancestors: MirrorObject[];
  objects: MirrorObject[];
  referencedObjects: MirrorObject[];
  missingExternalRefs: string[];
}

export interface HydratedThreadContext {
  objects: MirrorObject[];
  missingExternalRefs: string[];
}

const refKey = (ref: EntityRef) => `${ref.type}:${ref.id}`;

function sameScope(candidate: MirrorObject, focal: MirrorObject) {
  const legacyLiveEnvironment = focal.environment === "live" && candidate.environment === undefined && candidate.bridgeId.startsWith("native:");
  return candidate.presenceId === focal.presenceId
    && candidate.channelId === focal.channelId
    && (candidate.environment === focal.environment || legacyLiveEnvironment)
    && (focal.environment !== "sandbox" || candidate.sessionId === focal.sessionId);
}

function objectMap(mirror: MirrorObject[], focal: MirrorObject) {
  return new Map(mirror.filter((item) => sameScope(item, focal)).map((item) => [refKey(item.externalRef), item]));
}

function uniqueRefs(refs: EntityRef[]) {
  return [...new Map(refs.map((ref) => [refKey(ref), ref])).values()];
}

/**
 * Compile the bounded social context that cognition receives. This is shared
 * by Sandbox, native connectors, and future Bridge hydrators. It only uses
 * evidence already present in the Mirror and never invents missing objects.
 */
export function compileSocialThreadContext(mirror: MirrorObject[], focalObject: MirrorObject, options?: { maxObjects?: number }): SocialThreadContext {
  const maxObjects = Math.max(1, Math.min(8, options?.maxObjects ?? 8));
  const objectsByRef = objectMap(mirror, focalObject);
  const ancestors: MirrorObject[] = [];
  const missingExternalRefs: string[] = [];
  const visited = new Set<string>([refKey(focalObject.externalRef)]);
  let current = focalObject;
  while (current.parentExternalRef && ancestors.length < maxObjects - 1) {
    const parentKey = refKey(current.parentExternalRef);
    if (visited.has(parentKey)) {
      missingExternalRefs.push(parentKey);
      break;
    }
    visited.add(parentKey);
    const parent = objectsByRef.get(parentKey);
    if (!parent) {
      missingExternalRefs.push(parentKey);
      break;
    }
    ancestors.push(parent);
    current = parent;
  }

  const threadObjects = [...ancestors.reverse(), focalObject];
  const referencedRefs = uniqueRefs(threadObjects.flatMap((item) => item.referencedExternalRefs ?? []).filter((ref) => !threadObjects.some((item) => refKey(item.externalRef) === refKey(ref))));
  const referencedObjects = referencedRefs
    .map((ref) => objectsByRef.get(refKey(ref)))
    .filter((item): item is MirrorObject => Boolean(item));
  for (const ref of referencedRefs) {
    if (!referencedObjects.some((item) => refKey(item.externalRef) === refKey(ref))) missingExternalRefs.push(refKey(ref));
  }

  const rootExternalRef = threadObjects[0]?.externalRef;
  const directParentMissing = Boolean(focalObject.parentExternalRef && !ancestors.length && missingExternalRefs.length);
  const status: ThreadContextStatus = missingExternalRefs.length ? (directParentMissing ? "unavailable" : "partial") : "complete";
  return {
    status,
    focalObject,
    conversationExternalRef: focalObject.conversationExternalRef,
    rootExternalRef,
    ancestors: threadObjects.slice(0, -1),
    objects: threadObjects,
    referencedObjects,
    missingExternalRefs: [...new Set(missingExternalRefs)],
  };
}

/**
 * Retrieve only missing ancestry and non-ancestor references. The connector
 * owns provider-specific lookup; this helper owns the bounded traversal and
 * ensures the result can be persisted as ordinary Mirror evidence.
 */
export async function hydrateThreadContext(input: {
  mirror: MirrorObject[];
  observedObject: MirrorObject;
  fetchObjects: (refs: EntityRef[]) => Promise<MirrorObject[]>;
  maxDepth?: number;
  maxObjects?: number;
}): Promise<HydratedThreadContext> {
  const maxDepth = Math.max(0, Math.min(8, input.maxDepth ?? 8));
  const maxObjects = Math.max(1, Math.min(8, input.maxObjects ?? 8));
  const known = objectMap(input.mirror, input.observedObject);
  const fetched: MirrorObject[] = [];
  const missingExternalRefs: string[] = [];
  const fetchedKeys = new Set<string>();
  let current = input.observedObject;
  let depth = 0;

  while (current.parentExternalRef && depth < maxDepth && fetched.length < maxObjects - 1) {
    const parentRef = current.parentExternalRef;
    const parentKey = refKey(parentRef);
    const parent = known.get(parentKey) ?? fetched.find((item) => refKey(item.externalRef) === parentKey);
    if (parent) {
      current = parent;
      depth += 1;
      continue;
    }
    if (fetchedKeys.has(parentKey)) {
      missingExternalRefs.push(parentKey);
      break;
    }
    fetchedKeys.add(parentKey);
    const results = await input.fetchObjects([parentRef]);
    const scoped = results.filter((item) => sameScope(item, input.observedObject));
    fetched.push(...scoped.filter((item) => !known.has(refKey(item.externalRef)) && !fetched.some((existing) => refKey(existing.externalRef) === refKey(item.externalRef))).slice(0, maxObjects - 1 - fetched.length));
    const hydratedParent = fetched.find((item) => refKey(item.externalRef) === parentKey);
    if (!hydratedParent) {
      missingExternalRefs.push(parentKey);
      break;
    }
    current = hydratedParent;
    depth += 1;
  }

  // Quoted and otherwise referenced objects are evidence, but not ancestors.
  // Fetch them after the ancestry walk and keep them separate in compilation.
  const ancestry = [...fetched, ...input.mirror].filter((item) => sameScope(item, input.observedObject));
  const referencedRefs = uniqueRefs([input.observedObject, ...fetched].flatMap((item) => item.referencedExternalRefs ?? []).filter((ref) => ![input.observedObject, ...fetched].some((item) => refKey(item.externalRef) === refKey(ref))));
  const missingReferences = referencedRefs.filter((ref) => !ancestry.some((item) => refKey(item.externalRef) === refKey(ref)) && !missingExternalRefs.includes(refKey(ref)));
  if (missingReferences.length && fetched.length < maxObjects - 1) {
    const results = await input.fetchObjects(missingReferences.slice(0, maxObjects - 1 - fetched.length));
    fetched.push(...results.filter((item) => sameScope(item, input.observedObject) && !fetched.some((existing) => refKey(existing.externalRef) === refKey(item.externalRef))).slice(0, maxObjects - 1 - fetched.length));
    for (const ref of missingReferences) {
      if (!fetched.some((item) => refKey(item.externalRef) === refKey(ref))) missingExternalRefs.push(refKey(ref));
    }
  } else {
    missingExternalRefs.push(...missingReferences.map(refKey));
  }

  return { objects: fetched, missingExternalRefs: [...new Set(missingExternalRefs)] };
}

export { refKey };
