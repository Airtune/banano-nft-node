const bananojs = require("@bananocoin/bananojs");
import { INanoBlock, TAccount, TBlockHash, TNanoBlockSubtype } from "nano-account-crawler/dist/nano-interfaces";
import { TAssetState } from "banano-nft-crawler/dist/types/asset-state";

import { createOrUpdateAccount } from "./accounts";
import { IAssetBlock } from "banano-nft-crawler/dist/interfaces/asset-block";
import { DEBUG } from "../constants";
import { dbPrepareAssetChain } from "./db-prepare-asset-chain";

export const createSupplyBlockAndFirstMint = async (pgPool: any, firstMintBlock: INanoBlock, issuer_id: number, max_supply: (null | number), asset_chain_frontiers: IAssetBlock[]) => {
  if (DEBUG) {
    console.log('createSupplyBlockAndFirstMint...');
  }

  const crawl_at: Date = new Date();
  const mint_block_hash: TBlockHash = firstMintBlock.hash;
  const mint_block_height: number = parseInt(firstMintBlock.height);
  const metadata_representative: TAccount = firstMintBlock.representative as TAccount;
  const asset_representative: TAccount = bananojs.bananoUtil.getAccount(mint_block_hash, 'ban_') as TAccount;
  let state: TAssetState;
  let account_id: number;
  let owner_id: number;
  let supply_block_id;

  const pgClient: any = await pgPool.connect().catch((error) => { throw(error); });
  
  try {
    await pgClient.query('BEGIN;');
    if (DEBUG) {
      console.log('createSupplyBlockAndFirstMint BEGIN!');
    }

    if (DEBUG) {
      console.log('createSupplyBlockAndFirstMint // Create account...');
    }
    // Create account
    if (firstMintBlock.subtype === 'send') {
      state = 'receivable';
      const recipient_address = bananojs.bananoUtil.getAccount(firstMintBlock.link, 'ban_') as TAccount;
      account_id = await createOrUpdateAccount(pgClient, recipient_address, null, null, null);
      owner_id = account_id;
    } else if (firstMintBlock.subtype === 'change') {
      state = 'owned';
      account_id = issuer_id;
      owner_id   = issuer_id;
    } else {
      throw Error(`Unable to create mint for block subtype ${firstMintBlock.subtype}`);
    }

    if (DEBUG) {
      console.log('createSupplyBlockAndFirstMint // Create supply block...');
    }
    // Create supply block
    const supplyBlockRes = await pgClient.query(
      `INSERT INTO supply_blocks(metadata_representative, issuer_id, max_supply, mint_count, block_hash, block_height, mint_crawl_at, mint_crawl_height, mint_crawl_head) VALUES ($1, $2, $3, 1, $4, $5, $6, $7, $8) RETURNING id;`,
      [metadata_representative, issuer_id, max_supply, mint_block_hash, mint_block_height, crawl_at, mint_block_height, mint_block_hash]
    ).catch((error) => { throw(error); });
    if (DEBUG) {
      console.log('createSupplyBlockAndFirstMint // Create supply block!');
    }

    if (typeof(supplyBlockRes) !== 'undefined' && supplyBlockRes.rows[0]) {
      supply_block_id = supplyBlockRes.rows[0]["id"];
      console.log(`supply_block_id: ${supply_block_id}`);
    }

    const dbAssetChainFrontiers = dbPrepareAssetChain(asset_chain_frontiers);

    if (DEBUG) {
      console.log('createSupplyBlockAndFirstMint // Create first NFT mint');
    }
    const frontier = asset_chain_frontiers[asset_chain_frontiers.length - 1];
    const locked = frontier.locked;
    const asset_chain_height = frontier.block_height;
    const mint_number = 1;
    // Create first NFT mint
    const assetBlockRes = await pgClient.query(
      `INSERT INTO nfts(asset_representative, owner_id, account_id, supply_block_id, mint_number, mint_block_hash, mint_block_height, crawl_at, crawl_block_height, crawl_block_head, locked, state, asset_chain_frontiers, asset_chain_height, frontier_hash, frontier_height) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING id;`,
      [
        asset_representative,
        owner_id,
        account_id,
        supply_block_id,
        mint_number,
        mint_block_hash,
        mint_block_height,
        crawl_at,
        mint_block_height, // crawl_block_height
        mint_block_hash, // crawl_block_head,
        locked,
        state,
        JSON.stringify(dbAssetChainFrontiers), // asset_chain_frontiers,
        asset_chain_height, // asset_chain_height
        mint_block_hash, // frontier_hash
        mint_block_height // frontier_height
      ]
    );
    /*
    const assetBlockRes = await pgClient.query(
      `INSERT INTO nfts(mint_number, locked, asset_representative, owner_id, account_id, supply_block_id, mint_block_hash, mint_block_height, crawl_at, crawl_block_head, crawl_block_height, state, asset_chain_height, frontier_hash, frontier_height) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id;`,
      [
        1,
        locked,
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
        blockHeight,
        mint_block_hash,
        mint_block_height
      ]
    );
    */

    if (DEBUG) {
      console.log('createSupplyBlockAndFirstMint COMMIT...');
    }
    await pgClient.query('COMMIT;');
    if (DEBUG) {
      console.log('createSupplyBlockAndFirstMint COMMIT!');
    }
  } catch (error) {
    if (DEBUG) {
      console.log('createSupplyBlockAndFirstMint ROLLBACK...');
    }
    try {
      await pgClient.query('ROLLBACK;');
    } catch (error) {
      console.log('createSupplyBlockAndFirstMint ROLLBACK ERROR');
      throw(error);
    }
    if (DEBUG) {
      console.log('createSupplyBlockAndFirstMint ROLLBACK!');
    }
    throw(error);
  } finally {
    if (DEBUG) {
      console.log('createSupplyBlockAndFirstMint  pgClient.release()...');
    }
    pgClient.release();
  }

  return supply_block_id;
};
