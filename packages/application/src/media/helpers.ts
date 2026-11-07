import { DomainError } from "@lacecms/domain";

export function failure(message: string): never {
  throw new DomainError("CONTENT_INVALID_STATE", message);
}

export function detached<Value>(value: Value): Value {
  return JSON.parse(JSON.stringify(value)) as Value;
}
