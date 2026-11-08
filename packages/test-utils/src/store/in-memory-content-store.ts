import type {
  ContentEntryCommandPort,
  ContentEntryReadPort,
  ConfigurationSyncApplyPort,
  ConfigurationSyncStateReadPort,
  MediaCatalogPort,
  MediaCommandPort,
  MediaListPort,
  MediaReadPort,
  PublicContentReadPort,
} from "@lacecms/application";
import { InMemoryContentStoreDelivery } from "./delivery.js";

export class InMemoryContentStore
  extends InMemoryContentStoreDelivery
  implements
    ContentEntryReadPort,
    ContentEntryCommandPort,
    ConfigurationSyncApplyPort,
    ConfigurationSyncStateReadPort,
    MediaCatalogPort,
    MediaCommandPort,
    MediaListPort,
    MediaReadPort,
    PublicContentReadPort {}
