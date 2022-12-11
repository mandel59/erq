import { MatchResult } from "ohm-js"
import ErqGrammar, { ErqActionDict, ErqSemantics } from "../erq.ohm-bundle";

type ExtendArgsWith<X, F, R>
  = F extends (this: infer This, ...args: infer Args) => any
  ? (this: This & X, ...args: { [K in keyof Args]: Args[K] & X }) => R
  : undefined;

export type ErqActionDictExtendedWith<X, R> = {
  [K in keyof ErqActionDict<any>]: ExtendArgsWith<X, ErqActionDict<any>[K], R>
};

type ReturnType<T extends (...args: any) => any> = T extends (...args: any) => infer R ? R : never;

export interface ErqSemanticsExtendedWith<X extends Record<string, any>> {
  (match: MatchResult): X;
  addOperation<KX extends keyof X>(name: KX, actionDict: ErqActionDictExtendedWith<X, ReturnType<X[KX]>>): this;
  addAttribute<KX extends keyof X>(name: KX, actionDict: ErqActionDictExtendedWith<X, X[KX]>): this;
}

const semantics = ErqGrammar.createSemantics() as ErqSemanticsExtendedWith<Extension>;

export default semantics;

export interface ErqSemanticsExtention { }

type Extension
  = import("./value").Type
  & import("./sql").Type
  ;

import "./value";
import "./sql";
