
# Setup

## 0) Download banano-nft-node and change directory into this repository

```
cd banano-nft-node
```

## 1) Install dependencies

```
npm install
```

## 2) Create postgres database with username and pasword

## 3) Run postgres migrations

```
DATABASE_URL=postgres://user:password@localhost:5432 npm run migrate up
```

## 4) Set NODE_RPC_URL

Set NODE_RPC_URL in /src/constants.ts to a Bananode RPC url.

# Start server

```
npm start
```


# Check local_commands.txt for RPC calls

# Excalidraw Entity Relation Diagram

https://excalidraw.com/#json=Uw-HN-N6_DNt1pC4Q7-dj,_qQj_2660o7Dx6Zq_67FjQ


