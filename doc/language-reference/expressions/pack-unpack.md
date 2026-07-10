# `pack` and `unpack`

SQLiteはオブジェクトや配列をネイティブにサポートしていないので、表はオブジェクトや配列を含むことができません。そのかわりに、オブジェクトや配列はJSONテキストの形で取り扱うことができます。`pack`と`unpack`記法を使うと、JSONテキストの構築や分解を分かりやすく書くことができます。

たとえば、次のように、packを使ってJSONテキストとして複雑なデータ構造を保存しておくことができます。

```erq
table profile = {
  profile: pack {
    name: 'Alice',
    age: 21,
    jobList: ['Data Analyst', 'Programmer']
  }
};;
```



```erq
profile { unpack profile { name, age, jobList: [job1, job2] } };;
```
