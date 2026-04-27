/**
 * Microsoft Planner helpers via Graph API.
 * Vereist scope: Tasks.ReadWrite (toe te voegen bij Outlook-connect).
 */

import { graphFetch } from "@/lib/microsoft-graph";

export type PlannerTask = {
  id: string;
  title: string;
  planId: string;
  bucketId: string;
  percentComplete: number;
  dueDateTime?: string | null;
};

export type PlannerPlan = {
  id: string;
  title: string;
};

export type PlannerBucket = {
  id: string;
  name: string;
  planId: string;
};

/** Maakt een nieuwe Planner-taak aan en geeft het task-ID terug. */
export async function createPlannerTask(
  userId: string,
  planId: string,
  bucketId: string,
  task: {
    title: string;
    assigneeUpn?: string | null;
    dueDate?: Date | null;
    description?: string | null;
  }
): Promise<string | null> {
  try {
    const body: Record<string, unknown> = {
      planId,
      bucketId,
      title: task.title,
    };

    if (task.dueDate) {
      body.dueDateTime = task.dueDate.toISOString();
    }

    const res = await graphFetch(userId, "/planner/tasks", {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.error("[planner] task aanmaken mislukt:", await res.text());
      return null;
    }

    const data = (await res.json()) as { id: string };

    // Voeg beschrijving toe als notitie (apart endpoint)
    if (task.description && data.id) {
      await setPlannerTaskDetails(userId, data.id, task.description).catch(() => {});
    }

    return data.id;
  } catch (e) {
    console.error("[planner] createPlannerTask fout:", e);
    return null;
  }
}

/** Zet taak op voltooid (100%). */
export async function completePlannerTask(userId: string, taskId: string): Promise<void> {
  try {
    // Eerst etag ophalen (Planner vereist If-Match header bij PATCH)
    const getRes = await graphFetch(userId, `/planner/tasks/${taskId}`);
    if (!getRes.ok) return;
    const etag = getRes.headers.get("ETag") ?? "*";

    await graphFetch(userId, `/planner/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "If-Match": etag },
      body: JSON.stringify({ percentComplete: 100 }),
    });
  } catch (e) {
    console.error("[planner] completePlannerTask fout:", e);
  }
}

/** Beschrijving opslaan in task details. */
async function setPlannerTaskDetails(
  userId: string,
  taskId: string,
  description: string
): Promise<void> {
  const getRes = await graphFetch(userId, `/planner/tasks/${taskId}/details`);
  if (!getRes.ok) return;
  const etag = getRes.headers.get("ETag") ?? "*";

  await graphFetch(userId, `/planner/tasks/${taskId}/details`, {
    method: "PATCH",
    headers: { "If-Match": etag },
    body: JSON.stringify({ description }),
  });
}

/** Haal alle Planner-plannen op van de ingelogde gebruiker. */
export async function listMyPlannerPlans(userId: string): Promise<PlannerPlan[]> {
  const res = await graphFetch(userId, "/me/planner/plans?$select=id,title");
  if (!res.ok) return [];
  const data = (await res.json()) as { value: PlannerPlan[] };
  return data.value ?? [];
}

/** Haal buckets op voor een specifiek plan. */
export async function listPlannerBuckets(
  userId: string,
  planId: string
): Promise<PlannerBucket[]> {
  const res = await graphFetch(userId, `/planner/plans/${planId}/buckets?$select=id,name,planId`);
  if (!res.ok) return [];
  const data = (await res.json()) as { value: PlannerBucket[] };
  return data.value ?? [];
}
