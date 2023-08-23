const bananojs = require("@bananocoin/bananojs");
import { INanoBlock, TAccount, TBlockHash } from "nano-account-crawler/dist/nano-interfaces";
import { TAssetState } from "banano-nft-crawler/dist/types/asset-state";

import { findOrCreateAccount } from "./accounts";
import { IAssetBlock } from "banano-nft-crawler/dist/interfaces/asset-block";

export const createNFT = async (pgPool: any, mintBlock: INanoBlock, mintNumber: number, supply_block_id: number, supply_block_hash: TBlockHash, asset_chain: IAssetBlock[], asset_chain_height: number, asset_crawl_block_head: TBlockHash, asset_crawl_block_height: number) => {
  const crawl_at: Date = new Date();
  const mint_block_hash: TBlockHash = mintBlock.hash;
  const mint_block_height: number = parseInt(mintBlock.height);
  const asset_representative: TAccount = bananojs.bananoUtil.getAccount(mint_block_hash, 'ban_') as TAccount;

  const pgClient: any = await pgPool.connect().catch((error) => { throw(error); });
  try {
    // Start transaction
    await pgClient.query('BEGIN;');
    // Lock supply_blocks row
    await pgClient.query(`SELECT * FROM supply_blocks WHERE id = $1 FOR UPDATE LIMIT 1;`, [supply_block_id]);

    const assetBlockRes = await pgClient.query(
      `INSERT INTO nfts(
        mint_number,
        asset_representative,
        supply_block_id,
        supply_block_hash,
        crawl_at,
        crawl_block_head,
        crawl_block_height) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id;
      `,
      [
        mintNumber,
        asset_representative,
        supply_block_id,
        supply_block_hash,
        crawl_at,
        asset_crawl_block_head,
        asset_crawl_block_height
      ]
    )

    // The created nft id.
    const nft_id = assetBlockRes.rows[0].id;

    // Inserting each block in asset_chain to the 'nft_blocks' table
    for (let assetBlockHeight = 0; assetBlockHeight < asset_chain.length; assetBlockHeight++) {
      const assetBlock = asset_chain[assetBlockHeight];
      let state: TAssetState = assetBlock.state;
      const account_id: number = await findOrCreateAccount(pgPool, assetBlock.account, null, null, null, false);
      let owner_id: number;

      if (assetBlock.account === assetBlock.owner) {
        owner_id = account_id;
      } else {
        owner_id = await findOrCreateAccount(pgPool, assetBlock.owner, null, null, null, false);
      }

      await pgClient.query(
        `INSERT INTO nft_blocks(
          nft_id,
          nft_block_height,
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
          block_amount) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        `,
        [
          nft_id,
          assetBlockHeight,
          state,
          assetBlock.type,
          account_id,
          assetBlock.account,
          owner_id,
          assetBlock.owner,
          assetBlock.block_hash,
          assetBlock.block_link,
          assetBlock.block_height,
          assetBlock.account,
          assetBlock.block_representative,
          assetBlock.block_subtype === 'change' ? '0' : assetBlock.block_amount
        ]
      )
    }

    await pgClient.query('COMMIT;');
  } catch (error) {
    try {
      await pgClient.query('ROLLBACK;');
    } catch (error) {
      console.log('createNFT ROLLBACK ERROR');
      throw(error);
    }
    throw(error);
  } finally {
    pgClient.release();
  }
};

export const updateNFT = async (pgClient: any, nft_id: number, crawl_at: Date, crawl_block_head: TBlockHash, crawl_block_height: number, new_asset_chain_frontiers: IAssetBlock[]) => {
  const highestBlockHeightResult = await pgClient.query(
    `SELECT id, MAX(block_height) AS block_height, block_hash as max_height
    FROM nft_blocks
    WHERE nft_id = $1;`, [nft_id]
  ).catch((error) => { throw(error); });
  
  let previous_nft_block_id = highestBlockHeightResult.rows[0].id;
  let previous_nft_block_height = highestBlockHeightResult.rows[0].block_height + 1;
  let previous_nft_block_hash = highestBlockHeightResult.rows[0].block_hash;
  
  // loop through new_asset_chain_frontiers and insert them into the 'nft_blocks' table
  let i_offset = 0;
  let frontier_block_reached;
  for(let i = 0; i < new_asset_chain_frontiers.length; i++) {
    const assetBlockDb = new_asset_chain_frontiers[i];
    
    if (previous_nft_block_hash === assetBlockDb.block_hash) {
      i_offset = -i;
      frontier_block_reached = true;
      continue;
    }
    // Only proccess assetBlock after current frontier nft_block
    if (!frontier_block_reached) {
      continue;
    }

    let account_id = await findOrCreateAccount(pgClient, assetBlockDb.account as TAccount, crawl_at, null, null, false);
    let owner_id: number;

    if (assetBlockDb.account === assetBlockDb.owner) {
      owner_id = account_id;
    } else {
      owner_id = await findOrCreateAccount(pgClient, assetBlockDb.owner as TAccount, crawl_at, null, null, false);
    }

    // you might need to adjust this query and the parameters, this is just an example
    const newNftBlockRes = await pgClient.query(
      `INSERT INTO nft_blocks(nft_id, nft_block_height, nft_block_parent_id, state, type, account_id, account_address, owner_id, owner_address, block_hash, block_link, block_height, block_representative, block_amount) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        nft_id, 
        previous_nft_block_height + i + i_offset, 
        previous_nft_block_id,
        assetBlockDb.state,
        assetBlockDb.type,
        account_id,
        assetBlockDb.account,
        owner_id,
        assetBlockDb.owner,
        assetBlockDb.block_hash,
        assetBlockDb.block_link,
        assetBlockDb.block_height,
        assetBlockDb.block_representative,
        assetBlockDb.block_amount
      ]
    ).catch((error) => { throw(error); });

    previous_nft_block_id = newNftBlockRes.rows[0].id;
  }
};
