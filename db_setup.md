# Install
```
sudo apt install postgresql
```

# Setup

```
psql postgres
CREATE ROLE bananometanode WITH SUPERUSER;
ALTER ROLE bananometanode PASSWORD 'curlyfries';
CREATE DATABASE bananonfts;
\q
```

```
psql bananonfts
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
\q
```

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