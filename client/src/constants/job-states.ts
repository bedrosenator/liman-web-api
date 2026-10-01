/**
 * Константы состояний задач BullMQ.
 * Использовать вместо строковых литералов (`job.state === 'completed'`).
 *
 * @example
 * if (job.state === JOB_STATE.COMPLETED) { ... }
 */
export const JOB_STATE = {
  COMPLETED: 'completed',
  FAILED: 'failed',
  ACTIVE: 'active',
  WAITING: 'waiting',
  DELAYED: 'delayed',
  PAUSED: 'paused',
} as const;

export type JobState = (typeof JOB_STATE)[keyof typeof JOB_STATE];
