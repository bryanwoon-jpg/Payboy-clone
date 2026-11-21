-- Cover the companies.created_by foreign key (performance advisor)
create index if not exists companies_created_by_idx on public.companies (created_by);
