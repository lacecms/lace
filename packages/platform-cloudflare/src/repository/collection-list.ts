import { collectionListPlan } from "@lacecms/db";
import { CLOUDFLARE_LIST_QUERY_LIMITS } from "@lacecms/content";
import type { CollectionListRow } from "@lacecms/db";
import type {
  ContentEntryListPage,
  ContentEntryReadPort,
  ListContentEntriesInput,
} from "@lacecms/application";
import type { TotalsRow } from "@lacecms/db";
import { D1RepositoryBase } from "./base.js";

/** D1 collection list pages; positional binding and Cloudflare list-query limits. */
export class D1CollectionList
  extends D1RepositoryBase
  implements Pick<ContentEntryReadPort, "list">
{
  public async list(input: ListContentEntriesInput): Promise<ContentEntryListPage> {
    const plan = await collectionListPlan({
      ...input,
      listQueryLimits: CLOUDFLARE_LIST_QUERY_LIMITS,
    });
    const rows = await this.all<CollectionListRow>(plan.items.sql, ...plan.items.params);
    const totals = await this.first<TotalsRow>(plan.totals.sql, ...plan.totals.params);
    return plan.page(rows, totals!);
  }
}
