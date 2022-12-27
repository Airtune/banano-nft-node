const bananojs = require("@bananocoin/bananojs");
import { INanoBlock, TAccount, TBlockHash, TNanoBlockSubtype } from "nano-account-crawler/dist/nano-interfaces";
import { TAssetState } from "banano-nft-crawler/dist/types/asset-state";

import { createAccount, findAccountIdByAddress } from "./accounts";
import { IAssetBlockDb } from "./db-prepare-asset-chain";
import { DEBUG } from "../constants";

export const createNFT = async (pgPool: any, firstMintBlock: INanoBlock, mintNumber: number, supply_block_id: number, asset_chain_frontiers: IAssetBlockDb[], asset_chain_height: number) => {
  const crawl_at: Date = new Date();
  const mint_block_hash: TBlockHash = firstMintBlock.hash;
  const mint_block_height: number = parseInt(firstMintBlock.height);
  const asset_representative: TAccount = bananojs.bananoUtil.getAccount(mint_block_hash, 'ban_') as TAccount;

  const assetChainFrontier = asset_chain_frontiers[asset_chain_frontiers.length - 1];

  let state: TAssetState = assetChainFrontier.state;
  let account_id: number = await findAccountIdByAddress(pgPool, assetChainFrontier.account as TAccount);
  account_id ||= await createAccount(pgPool, assetChainFrontier.account as TAccount, crawl_at, null, null);
  let owner_id: number;

  if (assetChainFrontier.account === assetChainFrontier.owner) {
    owner_id = account_id;
  } else {
    owner_id = await findAccountIdByAddress(pgPool, assetChainFrontier.owner as TAccount);
    owner_id ||= await createAccount(pgPool, assetChainFrontier.owner as TAccount, crawl_at, null, null);
  }

  const pgClient: any = await pgPool.connect().catch((error) => { throw(error); });
  try {
    // Start transaction
    await pgClient.query('BEGIN;');
    // Lock supply_blocks row
    await pgClient.query(`SELECT FROM supply_blocks WHERE id = $1 FOR UPDATE LIMIT 1;`, [supply_block_id]);
    // Update supply_blocks row
    

    if (assetChainFrontier.state == 'burned') {
      await pgClient.query(
        `UPDATE supply_blocks
        SET burn_count = burn_count + 1, mint_count = $2
        WHERE id = $1;`,
        [supply_block_id, mintNumber]
      );
    } else {
      await pgClient.query(
        `UPDATE supply_blocks
        SET mint_count = $2
        WHERE id = $1`,
        [supply_block_id, mintNumber]
      );
    }

    // Create first NFT mint
    const assetBlockRes = await pgClient.query(
      `INSERT INTO nfts(
        mint_number,
        locked,
        asset_representative,
        owner_id,
        account_id,
        supply_block_id,
        mint_block_hash,
        mint_block_height,
        crawl_at,
        crawl_block_head,
        crawl_block_height,
        state,
        asset_chain_frontiers,
        asset_chain_height,
        frontier_hash,
        frontier_height) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING id;
      `,
      [
        mintNumber,
        assetChainFrontier.locked,
        asset_representative,
        owner_id,
        account_id,
        supply_block_id,
        mint_block_hash,
        mint_block_height,
        crawl_at,
        mint_block_hash,
        mint_block_height,
        state,
        JSON.stringify(asset_chain_frontiers),
        asset_chain_height,
        assetChainFrontier.block_hash,
        assetChainFrontier.block_height
      ]
    )
    if (DEBUG) {
      console.log('createNFT COMMIT...');
    }
    await pgClient.query('COMMIT;');
    if (DEBUG) {
      console.log('createNFT COMMIT!');
    }
  } catch (error) {
    if (DEBUG) {
      console.log('createNFT ROLLBACK...');
    }
    try {
      await pgClient.query('ROLLBACK;');
    } catch (error) {
      console.log('createNFT ROLLBACK ERROR');
      throw(error);
    }
    if (DEBUG) {
      console.log('createNFT ROLLBACK!');
    }
    throw(error);
  } finally {
    if (DEBUG) {
      console.log('createNFT  pgClient.release()...');
    }
    pgClient.release();
  }
};


export const createOrUpdateNFT = async (pgClient: any, firstMintBlock: INanoBlock, mintNumber: number, supply_block_id: number, asset_chain_frontiers: IAssetBlockDb[], asset_chain_height: number) => {
  const crawl_at: Date = new Date();
  const mint_block_hash: TBlockHash = firstMintBlock.hash;
  const mint_block_height: number = parseInt(firstMintBlock.height);
  const asset_representative: TAccount = bananojs.bananoUtil.getAccount(mint_block_hash, 'ban_') as TAccount;

  const assetChainFrontier = asset_chain_frontiers[asset_chain_frontiers.length - 1];

  let state: TAssetState = assetChainFrontier.state;
  let account_id: number = await findAccountIdByAddress(pgClient, assetChainFrontier.account as TAccount);
  let owner_id: number;

  if (assetChainFrontier.account === assetChainFrontier.owner) {
    owner_id = account_id;
  } else {
    owner_id = await findAccountIdByAddress(pgClient, assetChainFrontier.owner as TAccount);
  }

  // Create first NFT mint
  const assetBlockRes = await pgClient.query(
    `INSERT INTO nfts(
      mint_number,
      locked,
      asset_representative,
      owner_id,
      account_id,
      supply_block_id,
      mint_block_hash,
      mint_block_height,
      crawl_at,
      crawl_block_head,
      crawl_block_height,
      state,
      asset_chain_frontiers,
      asset_chain_height,
      frontier_hash,
      frontier_height) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (upper(mint_block_hash))
      DO
      UPDATE
        SET mint_number = $1,
            locked = $2,
            asset_representative = $3,
            owner_id = $4,
            account_id = $5,
            supply_block_id = $6,
            mint_block_hash = $7,
            mint_block_height = $8,
            crawl_at = $9,
            crawl_block_head = $10,
            crawl_block_height = $11,
            state = $12,
            asset_chain_frontiers = $13,
            asset_chain_height = $14,
            frontier_hash = $15,
            frontier_height = $16
      RETURNING id;
    `,
    [
      mintNumber,
      assetChainFrontier.locked,
      asset_representative,
      owner_id,
      account_id,
      supply_block_id,
      mint_block_hash,
      mint_block_height,
      crawl_at,
      mint_block_hash,
      mint_block_height,
      state,
      JSON.stringify(asset_chain_frontiers),
      asset_chain_height,
      assetChainFrontier.block_hash,
      assetChainFrontier.block_height
    ]
  ).catch((error) => { throw(error); });
};
