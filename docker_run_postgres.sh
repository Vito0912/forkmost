docker run -d \
  --name docmost-postgres \
  -e POSTGRES_DB=docmost \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=password \
  -p 5432:5432 \
  -v docmost_postgres_data:/var/lib/postgresql/data \
  postgres:16
