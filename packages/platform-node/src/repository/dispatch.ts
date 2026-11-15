import type {
  ClaimDispatcherEventsInput,
  CompleteDispatcherLeaseInput,
  DispatcherLease,
  DispatcherLeasePort,
  RetryDispatcherLeaseInput,
} from "@lacecms/application";
import {
  dispatcherCandidates,
  dispatcherClaimPlan,
  completeDispatcherPlan,
  retryDispatcherPlan,
  failure,
} from "@lacecms/db";
import type { OutboxRow, WritePlanGroup } from "@lacecms/db";
import { NodeRepositoryBase } from "./base.js";
import { executeWritePlanGroup } from "./write-plan.js";

/** Outbox dispatcher leases. */
export class NodeDispatcherLeases extends NodeRepositoryBase implements DispatcherLeasePort {
  public async claim(input: ClaimDispatcherEventsInput): Promise<readonly DispatcherLease[]> {
    let leases: readonly DispatcherLease[] = [];
    try {
      const result = executeWritePlanGroup(this.connection, () => {
        const query = dispatcherCandidates(input);
        const rows = this.connection
          .prepare(query.sql)
          .all(...query.params) as readonly OutboxRow[];
        const prepared = dispatcherClaimPlan(
          rows,
          rows.map(() => this.nextId()),
          input.now,
        );
        leases = prepared.leases;
        return prepared.plan;
      });
      return Object.freeze(leases.filter((_, index) => result.changes[index] === 1));
    } catch (error) {
      this.throwWriteError(error, false);
    }
  }
  public async complete(input: CompleteDispatcherLeaseInput): Promise<void> {
    await this.transition(completeDispatcherPlan(input));
  }
  public async retry(input: RetryDispatcherLeaseInput): Promise<void> {
    await this.transition(retryDispatcherPlan(input));
  }
  private async transition(plan: WritePlanGroup): Promise<void> {
    try {
      const result = executeWritePlanGroup(this.connection, plan);
      if (result.changes[0] !== 1) failure("Dispatcher lease is missing or expired.");
    } catch (error) {
      this.throwWriteError(error, false);
    }
  }
}
