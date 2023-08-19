type Arg1<T> = T extends (arg1: infer U, ...args: any[]) => any ? U : never;
type Arg2<T> = T extends (arg1: any, arg2: infer U, ...args: any[]) => any ? U : never;
type Arg3<T> = T extends (arg1: any, arg2: any, arg3: infer U, ...args: any[]) => any ? U : never;
type Arg4<T> = T extends (arg1: any, arg2: any, arg3: any, arg4: infer U, ...args: any[]) => any ? U : never;
type Arg5<T> = T extends (arg1: any, arg2: any, arg3: any, arg4: any, arg5: infer U, ...args: any[]) => any ? U : never;
type Arg6<T> = T extends (arg1: any, arg2: any, arg3: any, arg4: any, arg5: any, arg6: infer U, ...args: any[]) => any ? U : never;
type Arg7<T> = T extends (arg1: any, arg2: any, arg3: any, arg4: any, arg5: any, arg6: any, arg7: infer U, ...args: any[]) => any ? U : never;
type Arg8<T> = T extends (arg1: any, arg2: any, arg3: any, arg4: any, arg5: any, arg6: any, arg7: any, arg8: infer U, ...args: any[]) => any ? U : never;
