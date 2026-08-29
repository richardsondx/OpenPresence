import { describe, expect, it, vi } from "vitest";
import type { EntityRef, MirrorObject } from "../lib/types";
import { compileSocialThreadContext, hydrateThreadContext } from "../lib/thread-context";

const ref = (id: string, type = "x.post"): EntityRef => ({ type, id });
const object = (id: string, options: Partial<MirrorObject> = {}): MirrorObject => ({
  id: `mirror-${id}`,
  bridgeId: "native:connection-1",
  presenceId: "presence-1",
  channelId: "x",
  externalRef: ref(id),
  objectType: "post",
  author: { displayName: id },
  content: { text: id },
  occurredAt: `2026-08-15T00:00:0${Math.min(9, Number(id.replace(/\D/g, "") || 0))}.000Z`,
  observedAt: "2026-08-15T00:00:00.000Z",
  visibility: "public",
  shareability: "presence-only",
  environment: "live",
  ...options,
});

describe("shared social thread context", () => {
  it("compiles a bounded multi-author ancestry in oldest-to-focal order", () => {
    const root = object("root", { conversationExternalRef: "root" });
    const parent = object("parent", { parentExternalRef: root.externalRef, conversationExternalRef: "root" });
    const focal = object("focal", { parentExternalRef: parent.externalRef, conversationExternalRef: "root" });
    const context = compileSocialThreadContext([focal, parent, root], focal);

    expect(context.status).toBe("complete");
    expect(context.rootExternalRef).toEqual(root.externalRef);
    expect(context.objects.map((item) => item.externalRef.id)).toEqual(["root", "parent", "focal"]);
    expect(context.missingExternalRefs).toEqual([]);
  });

  it("does not cross Presence or Sandbox session boundaries while compiling", () => {
    const root = object("root", { environment: "sandbox", sessionId: "session-a" });
    const focal = object("focal", { environment: "sandbox", sessionId: "session-a", parentExternalRef: root.externalRef });
    const privateRoot = object("root", { environment: "sandbox", sessionId: "session-b", content: { text: "private other session" } });
    const context = compileSocialThreadContext([focal, privateRoot], focal);

    expect(context.status).toBe("unavailable");
    expect(context.objects.map((item) => item.content?.text)).toEqual(["focal"]);
    expect(context.missingExternalRefs).toEqual(["x.post:root"]);
  });

  it("keeps legacy native Mirror rows available during the live lazy check", () => {
    const root = object("root", { environment: undefined, bridgeId: "native:legacy" });
    const focal = object("focal", { parentExternalRef: root.externalRef, environment: "live" });
    const context = compileSocialThreadContext([focal, root], focal);

    expect(context.status).toBe("complete");
    expect(context.objects.map((item) => item.externalRef.id)).toEqual(["root", "focal"]);
  });

  it("keeps quoted references separate from reply ancestry", () => {
    const root = object("root");
    const quoted = object("quoted", { content: { text: "quoted evidence" } });
    const focal = object("focal", { parentExternalRef: root.externalRef, referencedExternalRefs: [ref("quoted")] });
    const context = compileSocialThreadContext([root, quoted, focal], focal);

    expect(context.objects.map((item) => item.externalRef.id)).toEqual(["root", "focal"]);
    expect(context.referencedObjects.map((item) => item.content?.text)).toEqual(["quoted evidence"]);
    expect(context.status).toBe("complete");
  });

  it("hydrates quoted references for a standalone post when explicitly requested", async () => {
    const quoted = object("quoted", { author: { displayName: "Edward", handle: "@edward40e" }, content: { text: "The quoted project context." } });
    const focal = object("focal", { referencedExternalRefs: [quoted.externalRef] });
    const fetchObjects = vi.fn(async (refs: EntityRef[]) => refs[0]?.id === "quoted" ? [quoted] : []);
    const hydrated = await hydrateThreadContext({ mirror: [focal], observedObject: focal, fetchObjects, includeReferences: true });
    expect(fetchObjects).toHaveBeenCalledWith([quoted.externalRef]);
    expect(hydrated.objects.map((item) => item.author?.handle)).toEqual(["@edward40e"]);
  });

  it("hydrates missing ancestors once and returns connector evidence for persistence", async () => {
    const root = object("root", { conversationExternalRef: "root" });
    const parent = object("parent", { parentExternalRef: root.externalRef, conversationExternalRef: "root" });
    const focal = object("focal", { parentExternalRef: parent.externalRef, conversationExternalRef: "root" });
    const fetchObjects = vi.fn(async (refs: EntityRef[]) => refs[0]?.id === "parent" ? [parent, root] : []);

    const hydrated = await hydrateThreadContext({ mirror: [focal], observedObject: focal, fetchObjects, maxDepth: 8, maxObjects: 8 });
    expect(fetchObjects).toHaveBeenCalledTimes(1);
    expect(hydrated.objects.map((item) => item.externalRef.id)).toEqual(["parent", "root"]);

    const complete = compileSocialThreadContext([focal, ...hydrated.objects], focal);
    expect(complete.status).toBe("complete");
    expect(complete.objects.map((item) => item.externalRef.id)).toEqual(["root", "parent", "focal"]);
  });

  it("reports partial context when a later ancestor is unavailable", async () => {
    const parent = object("parent", { parentExternalRef: ref("missing"), conversationExternalRef: "missing" });
    const focal = object("focal", { parentExternalRef: parent.externalRef, conversationExternalRef: "missing" });
    const hydrated = await hydrateThreadContext({ mirror: [focal], observedObject: focal, fetchObjects: async () => [parent] });
    const context = compileSocialThreadContext([focal, ...hydrated.objects], focal);

    expect(context.status).toBe("partial");
    expect(context.objects.map((item) => item.externalRef.id)).toEqual(["parent", "focal"]);
    expect(context.missingExternalRefs).toEqual(["x.post:missing"]);
  });

  it("does not fetch thread ancestry or references when observing a specific standalone post (not a reply)", async () => {
    const standalonePost = object("standalone", {
      conversationExternalRef: "standalone",
      referencedExternalRefs: [ref("referenced-post")],
    });
    const fetchObjects = vi.fn(async () => []);

    const hydrated = await hydrateThreadContext({
      mirror: [standalonePost],
      observedObject: standalonePost,
      fetchObjects,
      maxDepth: 8,
      maxObjects: 8,
    });

    expect(fetchObjects).not.toHaveBeenCalled();
    expect(hydrated.objects).toEqual([]);
    expect(hydrated.missingExternalRefs).toEqual([]);
  });
});
