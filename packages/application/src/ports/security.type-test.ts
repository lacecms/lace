import { AccountUseCases, type AccountUseCasesInput } from "../accounts/use-cases.js";
import type {
  AccountSecurityPort,
  SecurityService,
  SessionSecurityPort,
  TokenSecurityPort,
  UserProfileReader,
} from "./security.js";

type Assert<T extends true> = T;
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Disjoint<A, B> = Equal<Extract<keyof A, keyof B>, never>;
export type ServiceKeys = Assert<
  Equal<
    keyof SecurityService,
    | keyof UserProfileReader
    | keyof AccountSecurityPort
    | keyof SessionSecurityPort
    | keyof TokenSecurityPort
  >
>;
export type AccountSessionDisjoint = Assert<Disjoint<AccountSecurityPort, SessionSecurityPort>>;
export type AccountTokenDisjoint = Assert<Disjoint<AccountSecurityPort, TokenSecurityPort>>;
export type SessionTokenDisjoint = Assert<Disjoint<SessionSecurityPort, TokenSecurityPort>>;

declare const security: UserProfileReader & AccountSecurityPort & SessionSecurityPort;
declare const dependencies: Omit<AccountUseCasesInput, "security">;
new AccountUseCases({ ...dependencies, security });
