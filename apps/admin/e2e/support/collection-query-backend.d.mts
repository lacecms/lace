export function startCollectionQueryBackend(kind: "node" | "d1"): Promise<{
  origin: string;
  requests: string[];
  responses: {
    url: string;
    status: number;
    body: { nextCursor?: string; items: { id: string; title: string }[] };
  }[];
  mutateBoundary(action: "edit" | "delete"): Promise<void>;
  close(): Promise<void>;
}>;
