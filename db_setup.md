# Install postgresql
```
apt install postgresql postgresql-contrib
```

# Setup

## Create root user
```
psql -u postgres postgres
CREATE ROLE root WITH SUPERUSER;
ALTER ROLE root WITH LOGIN;
\q
```

## Create bananometanode user and bananonfts db
```
psql postgres
CREATE ROLE bananometanode WITH SUPERUSER;
ALTER ROLE bananometanode WITH LOGIN;
ALTER ROLE bananometanode PASSWORD 'curlyfries';
CREATE DATABASE bananonfts;
\q
```

## Add pgcrypto extension
```
psql bananonfts
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
\q
```

## Run db migration
```
npm install
npm run migrate up
```

# Hard reset DB:

```
psql postgres
DROP DATABASE bananonfts;
CREATE DATABASE bananonfts;
\q
psql bananonfts
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
\q
npm run migrate up
```