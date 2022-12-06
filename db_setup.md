psql postgres
  CREATE ROLE airtune WITH SUPERUSER;
  CREATE DATABASE bananonfts;

psql bananonfts
  CREATE EXTENSION IF NOT EXISTS "pgcrypto";

npm install

npm run migrate up

