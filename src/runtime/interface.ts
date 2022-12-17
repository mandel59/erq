export interface Runtime<T = unknown, C = {}> {
  get<K extends keyof C>(key: K): Runtime<C[K], C>
  set<K extends string>(key: K): Runtime<T, Omit<C, K> & { [key in K]: T }>
  map<U>(f: (x: T) => U): Runtime<U, C>
  then<U>(f: (x: Awaited<T>) => U): Runtime<U, C>
}
