select tablename, count(*) as policies
from pg_policies
where schemaname = 'public'
group by tablename
order by tablename;