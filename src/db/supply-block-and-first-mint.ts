const bananojs = require("@bananocoin/bananojs");
import { INanoBlock, TAccount, TBlockHash, TNanoBlockSubtype } from "nano-account-crawler/dist/nano-interfaces";
import { TAssetState } from "banano-nft-crawler/dist/types/asset-state";

import { createOrUpdateAccount } from "./accounts";
import { DEBUG } from "../constants";
import { IAssetBlockDb } from "./db-prepare-asset-chain";
import { banano_ipfs } from "../lib/banano-ipfs";

export const createSupplyBlockAndFirstMint = async (crawl_at: Date, pgPool: any, firstMintBlock: INanoBlock, issuer_id: number, max_supply: (null | number), db_asset_chain_frontiers: IAssetBlockDb[], asset_chain_height: number) => {
  if (DEBUG) {
    console.log('createSupplyBlockAndFirstMint...');
  }

  const mint_block_hash: TBlockHash = firstMintBlock.hash;
  const mint_block_height: number = parseInt(firstMintBlock.height);
  const metadata_representative: TAccount = firstMintBlock.representative as TAccount;
  const ipfs_cid: string = banano_ipfs.accountToIpfsCidV0(metadata_representative);
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
    const recipient_address = bananojs.bananoUtil.getAccount(firstMintBlock.link, 'ban_') as TAccount;
    const supply_block_crawl_head = firstMintBlock.hash;
    const supply_block_crawl_height = parseInt(firstMintBlock.height);
    account_id = await createOrUpdateAccount(pgClient, recipient_address, crawl_at, supply_block_crawl_head, supply_block_crawl_height);
    // Create account
    if (firstMintBlock.subtype === 'send') {
      state = 'receivable';
      
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
    const frontier = db_asset_chain_frontiers[db_asset_chain_frontiers.length - 1];
    let burn_count = 0;
    if (frontier.state === 'burned') {
      burn_count = 1;
    }
    const supplyBlockRes = await pgClient.query(
      `INSERT INTO supply_blocks(metadata_representative, ipfs_cid, issuer_id, max_supply, mint_count, burn_count, block_hash, block_height, mint_crawl_at, mint_crawl_height, mint_crawl_head) VALUES ($1, $2, $3, 1, $4, $5, $6, $7, $8, $9, $10) RETURNING id;`,
      [metadata_representative, ipfs_cid, issuer_id, max_supply, burn_count, mint_block_hash, mint_block_height, crawl_at, mint_block_height, mint_block_hash]
    ).catch((error) => { throw(error); });
    if (DEBUG) {
      console.log('createSupplyBlockAndFirstMint // Create supply block!');
    }

    if (typeof(supplyBlockRes) !== 'undefined' && supplyBlockRes.rows[0]) {
      supply_block_id = supplyBlockRes.rows[0]["id"];
      console.log(`supply_block_id: ${supply_block_id}`);
    }

    if (DEBUG) {
      console.log('createSupplyBlockAndFirstMint // Create first NFT mint');
    }
    const locked = frontier.locked;
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
        frontier.block_height, // crawl_block_height
        frontier.block_hash, // crawl_block_head,
        locked,
        state,
        JSON.stringify(db_asset_chain_frontiers), // asset_chain_frontiers,
        asset_chain_height,
        frontier.block_hash, // frontier_hash
        frontier.block_height // frontier_height
      ]
    );

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
