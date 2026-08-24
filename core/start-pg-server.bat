@echo off
set SUPABASE_DATABASE_URL=postgresql://postgres.foaiwryvsctxmpbzlzrt:Pampalindaxd1.@aws-1-us-west-2.pooler.supabase.com:6543/postgres?pgbouncer=true
set JWT_SECRET=dev-secret-change-me
set PORT=4000
cd /d C:\Users\TCGADMIN\core
start "Postgres Server" node src/index.js > C:\Users\TCGADMIN\AppData\Local\Temp\opencode\server.log 2>&1
