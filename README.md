
# Setup

## 0) Download banano-nft-node and change directory into this repository

```
cd banano-nft-node
```


## 1) Install dependencies

```
npm install
```



Make sure postgres service is running and start it if it's not:
```
sudo systemctl status postgresql.service
sudo systemctl start postgresql.service
sudo systemctl restartstart postgresql.service
```


## 2) Create postgres database with username and pasword



Run psql:
```
psql postgres
```

Drop the database if you're doing a hard reset:

```
DROP DATABASE bananonfts;
```

Create database and add pgcrypto extension:
```
CREATE DATABASE bananonfts;
\q
psql bananonfts
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
```


## 3) Run postgres migrations

```
DATABASE_URL=postgres://user:password@localhost:5432 npm run migrate up
```


## 4) Create `.env`

Copy and rename `.env_example` to `.env`.

Set PGPASSWORD and BANANODE_RPC_URL.

# Bootstrap NFT ledger

When the Banano node is synced, to bootstrap, run:

```
npm run bootstrap
```

If you start with `npm start` it will also automatically bootstrap issuers that have not been bootstrap yet in the scheduler.

# Start server

Once the node has bootstrapped the NFT ledger, start the server with:

```
npm start
```

# Set issuers in `./src/get-issuers.ts`

Add addresses to `./src/get-issuers.ts` and restart the server to enable new issuers.

# Start server (daemon)

```
npm install pm2 -g
pm2 start --name bananonftnode "npm start"
```

# Example requests

## Get all NFTs owned by address

`curl -X GET https://cwispy.app/nftnode/owner/ban_1airtunes8qctdtjhnfu5tpegk337rgcgnbtktozg6ttz3hordo6chf5c31r/nfts`

## Get supply blocks (collections) created by issuer address

`curl -X GET https://cwispy.app/nftnode/issuer/ban_1bdaynbz85gw3tzzqh991kjegcetsjakjjg7wefee8r9jciiihk3gy76fpim/supply_blocks`


## Get NFTs minted from supply block

`curl -X GET https://cwispy.app/nftnode/supply_block/035F30B48459AF8EC086E7E6194A05940189E03BA5ACE6DB8B5CE22F3DE00A67/nfts`

## Get history for NFT from asset_representative
`curl -X GET https://cwispy.app/nftnode/nft/ban_3ra3j9abpxidodetmwbe3sc5dsbn7mekh9duu7j4wnk7aznwxezy7e3g6dne/history`

# Excalidraw Entity Relation Diagram

https://excalidraw.com/#json=Uw-HN-N6_DNt1pC4Q7-dj,_qQj_2660o7Dx6Zq_67FjQ
