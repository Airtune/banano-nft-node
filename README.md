
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

```


## 3) Run postgres migrations

```
DATABASE_URL=postgres://user:password@localhost:5432 npm run migrate up
```


## 4) Set NODE_RPC_URL

Set NODE_RPC_URL in /src/constants.ts to a Bananode RPC url.


# Bootstrap NFT ledger

When the Banano node is synced, to bootstrap, run:

```
npm run bootstrap
```


# Start server

Once the node has bootstrapped the NFT ledger, start the server with:

```
npm start
```


# Start server (daemon)

```
npm install pm2 -g
pm2 start --name bananonftnode "npm start"
```


# Check local_commands.txt for RPC calls

# Excalidraw Entity Relation Diagram

https://excalidraw.com/#json=Uw-HN-N6_DNt1pC4Q7-dj,_qQj_2660o7Dx6Zq_67FjQ


