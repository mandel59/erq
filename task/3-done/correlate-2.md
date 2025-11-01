# 課題: correlate.md の続き

```erq
article join ^comment;;
article left join ^comment;;
article right join ^comment;;
article full join ^comment;;
```

これが

```erq
select * from article join comment on (comment.article = article.id)
select * from article left join comment on (comment.article = article.id)
select * from article right join comment on (comment.article = article.id)
select * from article full join comment on (comment.article = article.id)
```

となるようにしたい。joinの種類が変わっても同様。
