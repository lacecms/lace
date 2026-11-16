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
  sqliteWriteError,
} from "@lacecms/db";
import type { OutboxRow, WritePlanGroup } from "@lacecms/db";
import { D1RepositoryBase } from "./base.js";
import { executeWritePlanGroup } from "./write-plan.js";

/** Outbox dispatcher leases. */
export class D1DispatcherLeases extends D1RepositoryBase implements DispatcherLeasePort {
  public async claim(input: ClaimDispatcherEventsInput): Promise<readonly DispatcherLease[]> {
    const query = dispatcherCandidates(input);
    const rows = await this.all<OutboxRow>(query.sql, ...query.params);
    const prepared = dispatcherClaimPlan(
      rows,
      rows.map(() => this.nextId()),
      input.now,
    );
    const result = await executeWritePlanGroup(this.database, prepared.plan);
    return Object.freeze(
      prepared.leases.filter((_, index) => result.changes[prepared.claimIndices[index]!] === 1),
    );
  }
  public async complete(input: CompleteDispatcherLeaseInput): Promise<void> {
    await this.transition(completeDispatcherPlan(input));
  }
  public async retry(input: RetryDispatcherLeaseInput): Promise<void> {
    await this.transition(retryDispatcherPlan(input));
  }
  private async transition(plan: WritePlanGroup): Promise<void> {
    try {
      const result = await executeWritePlanGroup(this.database, plan);
      if (result.changes[0] !== 1) failure("Dispatcher lease is missing or expired.");
    } catch (error) {
      sqliteWriteError(error, false, "D1");
    }
  }
}
