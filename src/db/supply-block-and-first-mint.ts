const bananojs = require("@bananocoin/bananojs");
import { INanoBlock, TAccount, TBlockHash, TNanoBlockSubtype } from "nano-account-crawler/dist/nano-interfaces";
import { TAssetState } from "banano-nft-crawler/dist/types/asset-state";

import { createOrUpdateAccount, findOrCreateAccount } from "./accounts";
import { DEBUG } from "../constants";
import { banano_ipfs } from "../lib/banano-ipfs";
import { IAssetBlock } from "banano-nft-crawler/dist/interfaces/asset-block";
import { ISupplyBlock } from "../interfaces/supply-block";

export const createSupplyBlockAndFirstMint = async (crawl_at: Date, pgPool: any, firstMintBlock: INanoBlock, supplyBlock: ISupplyBlock, issuer_id: number, issuer_address: TAccount, max_supply: (null | string), asset_chain: IAssetBlock[], asset_crawler_block_head: TBlockHash, asset_crawler_block_height: number) => {
  const supply_block_hash: TBlockHash = supplyBlock.supply_block_hash;
  const supply_block_height: number = parseInt(supplyBlock.supply_block_height);
  const mint_block_hash: TBlockHash = firstMintBlock.hash;
  const mint_block_height: number = parseInt(firstMintBlock.height);
  const metadata_representative: TAccount = firstMintBlock.representative as TAccount;
  const ipfs_cid: string = banano_ipfs.accountToIpfsCidV0(metadata_representative);
  const asset_representative: TAccount = bananojs.bananoUtil.getAccount(mint_block_hash, 'ban_') as TAccount;
  let state: TAssetState;
  let account_id: number;
  let account_address: TAccount;
  let owner_id: number;
  let owner_address: TAccount;
  let supply_block_id;

  const pgClient: any = await pgPool.connect().catch((error) => { throw (error); });

  try {
    await pgClient.query('BEGIN;');

    const recipient_address = bananojs.bananoUtil.getAccount(firstMintBlock.link, 'ban_') as TAccount;
    const supply_block_crawl_head = firstMintBlock.hash;
    const supply_block_crawl_height = parseInt(firstMintBlock.height);
    account_id = await createOrUpdateAccount(pgClient, recipient_address, crawl_at, supply_block_crawl_head, supply_block_crawl_height, false);
    // Create account
    if (firstMintBlock.subtype === 'send') {
      state = 'receivable';

      owner_id = account_id;
      owner_address = recipient_address;
    } else if (firstMintBlock.subtype === 'change') {
      state = 'owned';
      account_id = issuer_id;
      owner_id = issuer_id;
      account_address = issuer_address;
      owner_address = issuer_address;
    } else {
      throw Error(`Unable to create mint for block subtype ${firstMintBlock.subtype}`);
    }

    // Create supply block
    const frontier = asset_chain[asset_chain.length - 1];
    let burn_count = 0;
    if (frontier.state === 'burned') {
      burn_count = 1;
    }
    const mint_crawl_head = asset_chain[0].block_hash;
    const supplyBlockRes = await pgClient.query(
      `INSERT INTO supply_blocks(metadata_representative, ipfs_cid, issuer_id, issuer_address, max_supply, mint_count, burn_count, block_hash, block_height, mint_crawl_at, mint_crawl_height, mint_crawl_head) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id;`,
      [metadata_representative, ipfs_cid, issuer_id, issuer_address, max_supply, 1, burn_count, supply_block_hash, supply_block_height, crawl_at, mint_block_height, mint_crawl_head]
    ).catch((error) => { throw (error); });

    if (typeof (supplyBlockRes) !== 'undefined' && supplyBlockRes.rows[0]) {
      supply_block_id = supplyBlockRes.rows[0]["id"];
      // console.log(`supply_block_id: ${supply_block_id}`);
    }

    const mint_number = 1;
    // Create first NFT mint
    const nftRes = await pgClient.query(
      `INSERT INTO nfts(asset_representative, supply_block_id, supply_block_hash, mint_number, crawl_at, crawl_block_height, crawl_block_head) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id;`,
      [
        asset_representative,
        supply_block_id,
        supply_block_hash,
        mint_number,
        crawl_at,
        asset_crawler_block_height, // crawl_block_height
        asset_crawler_block_head, // crawl_block_head,
      ]
    ).catch((error) => { throw (error); });

    const nft_id = nftRes.rows[0].id;

    // Create nft_blocks
    let nft_block_parent_id = null;
    for (let nft_block_index = 0; nft_block_index < asset_chain.length; nft_block_index++) {
      const asset_block: IAssetBlock = asset_chain[nft_block_index];
      const asset_block_account_id = await findOrCreateAccount(pgClient, asset_block.account, null, null, null, false);
      let asset_block_owner_id;
      if (asset_block.account === asset_block.owner) {
        asset_block_owner_id = asset_block_account_id;
      } else {
        asset_block_owner_id = await findOrCreateAccount(pgClient, asset_block.owner, null, null, null, false);
      }

      // Inserting into nft_blocks
      const insertNftBlockRes = await pgClient.query(`
    INSERT INTO nft_blocks(
      nft_id,
      nft_block_height,
      nft_block_parent_id,
      state,
      type,
      account_id,
      account_address,
      owner_id,
      owner_address,
      block_hash,
      block_link,
      block_height,
      block_account,
      block_representative,
      block_amount,
      created_at,
      updated_at
    ) VALUES (
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      $8,
      $9,
      $10,
      $11,
      $12,
      $13,
      $14,
      $15,
      current_timestamp,
      current_timestamp
    )
    RETURNING id;
  `, [
        nft_id,
        nft_block_index,
        nft_block_parent_id,
        asset_block.state,
        asset_block.type,
        asset_block_account_id,
        asset_block.account,
        asset_block_owner_id,
        asset_block.owner,
        asset_block.block_hash,
        asset_block.block_link,
        asset_block.block_height,
        asset_block.block_account,
        asset_block.block_representative,
        asset_block.block_amount || '0', // TODO: Inspect when block_amount is null or undefined
      ]).catch((error) => { throw (error); });
      nft_block_parent_id = insertNftBlockRes.rows[0].id;
    }

    await pgClient.query('COMMIT;');
  } catch (error) {
    if (DEBUG) {
      // console.log('createSupplyBlockAndFirstMint ROLLBACK...');
    }
    try {
      await pgClient.query('ROLLBACK;');
      // TODO: Block this NFT from being supplied if it keeps failing?
    } catch (error) {
      // console.log('createSupplyBlockAndFirstMint ROLLBACK ERROR');
      console.error(error);
      throw (error);
    }
    if (DEBUG) {
      // console.log('createSupplyBlockAndFirstMint ROLLBACK!');
      console.error(error);
    }
    throw (error);
  } finally {
    pgClient.release();
  }

  return supply_block_id;
};
