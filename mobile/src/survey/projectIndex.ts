// ============================================================
// SolarPro project index for the start screen: every project the user
// can see, with client and address, cached on the phone so search works
// offline. Refreshed in the background when online.
// ============================================================

import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetchMobileClientProjects, fetchMobileClients, type MobileProject } from "../api/client";
import type { InstallType } from "./blueprint";

const KEY = "site-survey.project-index.v1";

export interface IndexedProject {
  id: string;
  name: string;
  clientId: string;
  clientName: string;
  address: string;
  installType: InstallType | null;
}

export interface ProjectIndex {
  updatedAt: string | null;
  projects: IndexedProject[];
}

export function detectInstallType(p: MobileProject): InstallType | null {
  const raw = [p.installation_type, p.installationType, p.system_type, p.systemType, p.mount_type, p.mountType, p.project_type, p.projectType]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[_\s-]/g, "");
  if (raw.includes("3phase") || raw.includes("threephase") || raw.includes("commercial")) return "commercial_3phase";
  if (raw.includes("roof")) return "roof_mount";
  if (raw.includes("ground")) return "ground_mount";
  if (raw.includes("fenc") || raw.includes("agri")) return "solar_fencing";
  return null;
}

export async function loadProjectIndex(): Promise<ProjectIndex> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as ProjectIndex;
  } catch {
    // fall through
  }
  return { updatedAt: null, projects: [] };
}

/** Fetch all clients' projects (3 at a time) and cache them. */
export async function refreshProjectIndex(onProgress?: (done: number, total: number) => void): Promise<ProjectIndex> {
  const clients = await fetchMobileClients();
  const projects: IndexedProject[] = [];
  let done = 0;
  const queue = [...clients];
  const worker = async () => {
    for (let c = queue.shift(); c; c = queue.shift()) {
      try {
        const list = await fetchMobileClientProjects(c.id);
        for (const p of list) {
          projects.push({
            id: p.id,
            name: (p.name || p.project_name || "").trim() || "Untitled project",
            clientId: c.id,
            clientName: c.name,
            address: (p.address || p.site_address || p.siteAddress || (c as { address?: string }).address || "").trim(),
            installType: detectInstallType(p),
          });
        }
      } catch {
        // one client failing shouldn't hide the rest
      }
      done++;
      onProgress?.(done, clients.length);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  projects.sort((a, b) => a.name.localeCompare(b.name));
  const index = { updatedAt: new Date().toISOString(), projects };
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(index));
  } catch {
    // cache is best-effort
  }
  return index;
}

/** Match every word of the query against name, client and address. */
export function searchProjects(projects: IndexedProject[], query: string, limit = 40): IndexedProject[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return projects.slice(0, limit);
  const scored: { p: IndexedProject; score: number }[] = [];
  for (const p of projects) {
    const name = p.name.toLowerCase();
    const hay = `${name} ${p.clientName.toLowerCase()} ${p.address.toLowerCase()}`;
    if (!words.every((w) => hay.includes(w))) continue;
    const score = words.reduce((acc, w) => acc + (name.startsWith(w) ? 3 : name.includes(w) ? 2 : 1), 0);
    scored.push({ p, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name)).slice(0, limit).map((x) => x.p);
}
