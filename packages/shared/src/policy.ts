import { z } from 'zod';

const minutes = (max: number) => z.number().int().positive().max(max).nullable();

/**
 * Who may open tables on this server, and the limits on tables opened by
 * people who do not run it. The owner and admins change this live from the
 * Server page; it is kept in Postgres so it survives a restart.
 */
export const instancePolicySchema = z.object({
  /** 'hosts' keeps table-opening to the owner and admins; 'anyone' opens the server up. */
  openTo: z.enum(['hosts', 'anyone']),
  /** Public tables live at once. Null for no cap. */
  maxTables: z.number().int().positive().max(500).nullable(),
  /** Wall-clock life of a public table, from when it was opened. Null for no limit. */
  maxTableMinutes: minutes(7 * 24 * 60),
  /** Live public tables one identity, or one address, may have open at once. */
  maxTablesPerPerson: z.number().int().positive().max(50),
  /** Cancel a public table nobody has started within this long. */
  lobbyIdleMinutes: minutes(24 * 60),
  /** End a public table once no person has been connected to it for this long. */
  emptyIdleMinutes: minutes(24 * 60),
  /**
   * End any table, the owner's and admins' included, once nobody has been
   * connected to it for this many hours. Abandoned tables are not kept forever.
   */
  abandonedHours: z.number().int().positive().max(30 * 24).nullable(),
});

export type InstancePolicy = z.infer<typeof instancePolicySchema>;

export const DEFAULT_INSTANCE_POLICY: InstancePolicy = {
  openTo: 'hosts',
  maxTables: 6,
  maxTableMinutes: 240,
  maxTablesPerPerson: 1,
  lobbyIdleMinutes: 30,
  emptyIdleMinutes: 15,
  abandonedHours: 24,
};

/** The policy on a server with no HOST_KEY: open, with nobody to set limits. */
export const OPEN_INSTANCE_POLICY: InstancePolicy = {
  openTo: 'anyone',
  maxTables: null,
  maxTableMinutes: null,
  maxTablesPerPerson: 50,
  lobbyIdleMinutes: null,
  emptyIdleMinutes: null,
  abandonedHours: null,
};

/** How many minutes before a public table closes its players are warned. */
export const SERVER_LIMIT_WARNING_MINUTES = 10;

/** The owner holds HOST_KEY; an admin holds a key the owner made in the app. */
export type ServerRole = 'owner' | 'admin';

/** What a visitor is told about the server before signing in. */
export interface InstanceInfo {
  /** Only the owner and admins may open tables. */
  restricted: boolean;
  /** Limits on tables opened by everyone else; null when there are none. */
  limits: {
    maxTables: number | null;
    inUse: number;
    maxTableMinutes: number | null;
    maxTablesPerPerson: number;
  } | null;
}

/** One live table, as the Server page lists it. */
export interface ServerTable {
  code: string;
  name: string;
  hostName: string;
  phase: string;
  humans: number;
  bots: number;
  connected: number;
  createdAt: number;
  /** When the server will close it; null for the owner's and admins' tables. */
  expiresAt: number | null;
  /** Opened by someone without a server role, so the limits apply. */
  public: boolean;
  /** Since when nobody has had it open, or null while someone does. */
  emptySince: number | null;
}

export interface AdminKeyView {
  id: string;
  label: string;
  createdAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
  /** Identities that have entered this key. */
  holders: number;
}
