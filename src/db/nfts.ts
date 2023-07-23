const bananojs = require("@bananocoin/bananojs");
import { INanoBlock, TAccount, TBlockHash, TNanoBlockSubtype } from "nano-account-crawler/dist/nano-interfaces";
import { TAssetState } from "banano-nft-crawler/dist/types/asset-state";

import { createAccount, findAccountIdByAddress } from "./accounts";
import { IAssetBlockDb } from "./db-prepare-asset-chain";
import { DEBUG } from "../constants";

export const createNFT = async (pgPool: any, mintBlock: INanoBlock, mintNumber: number, supply_block_id: number, asset_chain_frontiers: IAssetBlockDb[], asset_chain_height: number, asset_crawl_block_head: TBlockHash, asset_crawl_block_height: number) => {
  const crawl_at: Date = new Date();
  const mint_block_hash: TBlockHash = mintBlock.hash;
  const mint_block_height: number = parseInt(mintBlock.height);
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
        SET burn_count = burn_count + 1, mint_count = $2, mint_crawl_head = $3, mint_crawl_height = $4
        WHERE id = $1;`,
        [supply_block_id, mintNumber, mint_block_hash, mint_block_height]
      );
    } else {
      await pgClient.query(
        `UPDATE supply_blocks
        SET mint_count = $2, mint_crawl_head = $3, mint_crawl_height = $4
        WHERE id = $1`,
        [supply_block_id, mintNumber, mint_block_hash, mint_block_height]
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
        asset_crawl_block_head,
        asset_crawl_block_height,
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

export const updateNFT = async (pgClient: any, nft_id: number, crawl_at: Date, crawl_block_head: TBlockHash, crawl_block_height: number, new_db_asset_chain_frontiers: IAssetBlockDb[], asset_chain_height: number) => {
  const frontier: IAssetBlockDb = new_db_asset_chain_frontiers[new_db_asset_chain_frontiers.length-1];
  await pgClient.query(
    `UPDATE nfts
    SET locked = $1,
      crawl_at = $2,
      crawl_block_head = $3,
      crawl_block_height = $4,
      state = $5,
      asset_chain_frontiers = $6,
      asset_chain_height = $7,
      frontier_hash = $8,
      frontier_height = $9
    WHERE id = $10`,
    [
      frontier.locked,
      crawl_at,
      crawl_block_head,
      crawl_block_height,
      frontier.state,
      new_db_asset_chain_frontiers,
      asset_chain_height,
      frontier.block_hash,
      frontier.block_height,
      nft_id
    ]
  ).catch((error) => { throw(error); });
};
