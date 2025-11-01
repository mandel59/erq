# 課題: comment[^article{id} = 1];; が文法エラーになる

```erq
comment[^article{id} = 1];;
```

これがパースできていない。これはSQLに変換すると

```sql
select * from comment where ((select id from article where ((comment.article = article.id))) = 1)
```

と同様になるべき。
