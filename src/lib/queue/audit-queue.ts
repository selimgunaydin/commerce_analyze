import { Queue } from "bullmq";
import type { ConnectionOptions } from "bullmq";
import { getEnv } from "@/src/lib/config/env";

export const AUDIT_QUEUE_NAME = "audit-projects";

let connectionOptions: ConnectionOptions | null = null;
let queue: Queue | null = null;

export function getRedisConnectionOptions() {
  if (!connectionOptions) {
    connectionOptions = parseRedisUrl(getEnv().REDIS_URL);
  }

  return connectionOptions;
}

export function getAuditQueue() {
  if (!queue) {
    queue = new Queue(AUDIT_QUEUE_NAME, {
      connection: getRedisConnectionOptions()
    });
  }

  return queue;
}

export async function enqueueAuditProject(auditProjectId: string) {
  const auditQueue = getAuditQueue();

  return auditQueue.add(
    "audit.run",
    { auditProjectId },
    {
      attempts: 2,
      backoff: {
        type: "exponential",
        delay: 1_000
      },
      jobId: `audit-project-${auditProjectId}-${Date.now()}`,
      removeOnComplete: 100,
      removeOnFail: 100
    }
  );
}

function parseRedisUrl(redisUrl: string): ConnectionOptions {
  const url = new URL(redisUrl);

  const options: ConnectionOptions = {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: parseRedisDb(url.pathname),
    maxRetriesPerRequest: null
  };

  if (url.protocol === "rediss:") {
    return {
      ...options,
      tls: {}
    } as ConnectionOptions;
  }

  return options;
}

function parseRedisDb(pathname: string) {
  const rawDb = pathname.replace("/", "");

  if (!rawDb) {
    return 0;
  }

  const db = Number(rawDb);
  return Number.isInteger(db) && db >= 0 ? db : 0;
}
