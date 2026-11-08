import type { Plugin, UserConfig } from "vitest/config";

export const sourceConditionName: "@lacecms/source";
export function sourceCondition(): Plugin;
export function sharedTestConfig(extra?: UserConfig): UserConfig;
export function packagedTestConfig(extra?: UserConfig): UserConfig;
