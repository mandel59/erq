import { MatchResult, Node } from "ohm-js"
import ErqGrammar, { ErqActionDict } from "../erq.ohm-bundle";

type ExtendNodeWith<X, N extends Node> = N & X;

type ExtendArgsWith<X, F, R>
  = F extends (this: infer This extends Node, ...args: infer Args extends Node[]) => any
  ? (this: ExtendNodeWith<X, This>, ...args: { [K in keyof Args]: ExtendNodeWith<X, Args[K]> }) => R
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

const semantics = ErqGrammar.createSemantics() as unknown as ExtendedSemantics;
export default semantics;

export type ExtendedSemantics = ErqSemanticsExtendedWith<Extension>;

export type Extension
  = import("./value").Type
  & import("./sql").Type
  ;

export type ExtendedNode = ExtendNodeWith<Extension, Node>;

import "./value";
import "./sql";
