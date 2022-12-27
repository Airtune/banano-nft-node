psql postgres
  CREATE ROLE bananometanode WITH SUPERUSER;
  CREATE DATABASE bananonfts;

psql bananonfts
  CREATE EXTENSION IF NOT EXISTS "pgcrypto";

npm install

npm run migrate up

