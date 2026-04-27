/**
 * SharePoint helpers via Graph API.
 * Vereist scope: Files.ReadWrite (toe te voegen bij Outlook-connect).
 */

import { graphFetch } from "@/lib/microsoft-graph";

export type SharePointDrive = {
  id: string;
  name: string;
  driveType: string;
  siteId: string;
  siteName: string;
};

/**
 * Upload een bestand naar SharePoint.
 * Geeft de webURL van het geüploade bestand terug.
 */
export async function uploadToSharePoint(
  userId: string,
  driveId: string,
  folderPath: string,
  fileName: string,
  content: Buffer | Uint8Array,
  mimeType = "application/octet-stream"
): Promise<string | null> {
  try {
    const safePath = folderPath.replace(/^\/|\/$/g, "");
    const encodedPath = encodeURIComponent(`${safePath}/${fileName}`);
    const uploadUrl = `/drives/${driveId}/root:/${encodedPath}:/content`;

    const res = await graphFetch(userId, uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": mimeType },
      body: content as BodyInit,
    });

    if (!res.ok) {
      console.error("[sharepoint] upload mislukt:", await res.text());
      return null;
    }

    const data = (await res.json()) as { webUrl?: string };
    return data.webUrl ?? null;
  } catch (e) {
    console.error("[sharepoint] uploadToSharePoint fout:", e);
    return null;
  }
}

/** Haal alle SharePoint-drives op die de gebruiker kan benaderen (OneDrive + SharePoint sites). */
export async function listSharePointDrives(userId: string): Promise<SharePointDrive[]> {
  try {
    // Sites ophalen
    const sitesRes = await graphFetch(
      userId,
      "/sites?search=*&$select=id,displayName&$top=50"
    );

    const drives: SharePointDrive[] = [];

    if (sitesRes.ok) {
      const sitesData = (await sitesRes.json()) as {
        value: Array<{ id: string; displayName: string }>;
      };

      // Per site de drives ophalen
      await Promise.all(
        (sitesData.value ?? []).map(async (site) => {
          const drivesRes = await graphFetch(
            userId,
            `/sites/${site.id}/drives?$select=id,name,driveType`
          );
          if (!drivesRes.ok) return;
          const drivesData = (await drivesRes.json()) as {
            value: Array<{ id: string; name: string; driveType: string }>;
          };
          for (const drive of drivesData.value ?? []) {
            drives.push({
              id: drive.id,
              name: drive.name,
              driveType: drive.driveType,
              siteId: site.id,
              siteName: site.displayName,
            });
          }
        })
      );
    }

    // Voeg OneDrive van gebruiker toe
    const myDriveRes = await graphFetch(userId, "/me/drive?$select=id,name,driveType");
    if (myDriveRes.ok) {
      const myDrive = (await myDriveRes.json()) as {
        id: string;
        name: string;
        driveType: string;
      };
      drives.unshift({
        id: myDrive.id,
        name: myDrive.name ?? "OneDrive",
        driveType: myDrive.driveType,
        siteId: "",
        siteName: "Mijn OneDrive",
      });
    }

    return drives;
  } catch (e) {
    console.error("[sharepoint] listSharePointDrives fout:", e);
    return [];
  }
}
