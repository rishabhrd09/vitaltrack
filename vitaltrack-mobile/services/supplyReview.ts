import { api, ApiClientError } from './api';
import { assertSession, type Session } from './assistantSession';
import { readCapabilities, readRun, readRuns, reviewId, type SupplyAnswer, type SupplyCapabilities, type SupplyRun } from '@/features/supplyReview/contracts';
const root = '/supply-reviews';
async function request(session: Session, path: string, method: string, signal: AbortSignal, body?: unknown) {
  assertSession(session);
  return api.assistantRequest<unknown>(root + path, { method, signal, ...(body ? { body: JSON.stringify(body) } : {}) }, () => assertSession(session));
}
export const supplyReview = {
  async capabilities(session: Session, signal: AbortSignal): Promise<SupplyCapabilities & { supported?: false }> {
    try { return readCapabilities(await request(session, '/capabilities', 'GET', signal)); }
    catch (error) {
      assertSession(session);
      if (error instanceof ApiClientError && error.status === 404) return { enabled: false, contract_version: 1, ttl_seconds: 900, max_items: 500, supported: false };
      throw error;
    }
  },
  async list(session: Session, signal: AbortSignal) { return readRuns(await request(session, '', 'GET', signal)); },
  async get(session: Session, id: string, signal: AbortSignal) { return readRun(await request(session, '/' + reviewId(id), 'GET', signal)); },
  async start(session: Session, requestId: string, signal: AbortSignal) {
    return readRun(await request(session, '', 'POST', signal, { request_id: reviewId(requestId), target_mode: 'minimum' }));
  },
  async answer(session: Session, run: SupplyRun, answers: SupplyAnswer[], signal: AbortSignal) {
    return readRun(await request(session, '/' + reviewId(run.id) + '/answers', 'POST', signal, { expected_run_version: run.version, answers }));
  },
  async refresh(session: Session, run: SupplyRun, signal: AbortSignal) {
    return readRun(await request(session, '/' + reviewId(run.id) + '/refresh', 'POST', signal, { expected_run_version: run.version }));
  },
  async cancel(session: Session, run: SupplyRun, signal: AbortSignal) {
    return readRun(await request(session, '/' + reviewId(run.id) + '/cancel', 'POST', signal, { expected_run_version: run.version }));
  },
  async confirm(session: Session, run: SupplyRun, key: string, signal: AbortSignal) {
    if (!run.proposal) throw new Error('Refresh and review the proposal first.');
    return readRun(await request(session, '/' + reviewId(run.id) + '/confirm', 'POST', signal, {
      expected_run_version: run.version, proposal_id: run.proposal.id, proposal_version: run.proposal.version, idempotency_key: reviewId(key),
    }));
  },
};
