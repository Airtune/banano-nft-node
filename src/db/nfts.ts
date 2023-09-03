const bananojs = require("@bananocoin/bananojs");
import { INanoBlock, TAccount, TBlockHash } from "nano-account-crawler/dist/nano-interfaces";
import { TAssetState } from "banano-nft-crawler/dist/types/asset-state";

import { findOrCreateAccount } from "./accounts";
import { IAssetBlock } from "banano-nft-crawler/dist/interfaces/asset-block";
import { findFrontierNFTBlock } from "./nft-blocks";
import { updateSupplyBlockBurn, updateSupplyBlockNewMint } from "../db/supply-blocks";

export const findLatestNFTForSupplyBlock = async (pgPool: any, supply_block_id: number): Promise<any> => {
  const query = `
    SELECT *
    FROM nfts
    WHERE supply_block_id = $1
    ORDER BY mint_number DESC
    LIMIT 1;
  `;
  
  const values = [supply_block_id];

  // TODO: Handle errors with try/catch
  const { rows } = await pgPool.query(query, values);

  return rows.length > 0 ? rows[0] : null;
}

export const createNFT = async (pgPool: any, mintBlock: INanoBlock, mintNumber: number, supply_block_id: number, supply_block_hash: TBlockHash, asset_chain: IAssetBlock[], asset_chain_height: number, asset_crawl_block_head: TBlockHash, asset_crawl_block_height: number) => {
  const crawl_at: Date = new Date();
  const mint_block_hash: TBlockHash = mintBlock.hash;
  const mint_block_height: number = parseInt(mintBlock.height);
  const asset_representative: TAccount = bananojs.bananoUtil.getAccount(mint_block_hash, 'ban_') as TAccount;

  const pgClient: any = await pgPool.connect().catch((error) => { throw(error); });
  try {
    // Start transaction
    const frontier: IAssetBlock = asset_chain[asset_chain.length-1];
    await pgClient.query('BEGIN;');
    
    // Update mint_crawl_head for mints crawler
    // TODO: Figure out why uncommenting this line + 'npm start' on a clean setup only yields 1 supply_block
    console.log(`    ---updateSupplyBlockNewMint...---    `);
    await updateSupplyBlockNewMint(pgPool, supply_block_id, crawl_at, mint_block_height, mintBlock.hash, frontier.state === 'burned');
    console.log(`    ---updateSupplyBlockNewMint!---    `);
    // Lock supply_blocks row
    await pgClient.query(`SELECT * FROM supply_blocks WHERE id = $1 FOR UPDATE LIMIT 1;`, [supply_block_id]);

    console.log(`INSERT INTO nfts. mintNumber: ${mintNumber}, asset_crawl_block_height: ${asset_crawl_block_height}`);
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
    let nft_block_parent_id = null;
    for (let nftBlockHeight = 0; nftBlockHeight < asset_chain.length; nftBlockHeight++) {
      const assetBlock = asset_chain[nftBlockHeight];
      let state: TAssetState = assetBlock.state;
      const account_id: number = await findOrCreateAccount(pgPool, assetBlock.account, null, null, null, false);
      let owner_id: number;

      if (assetBlock.account === assetBlock.owner) {
        owner_id = account_id;
      } else {
        owner_id = await findOrCreateAccount(pgPool, assetBlock.owner, null, null, null, false);
      }

      console.log(`INSERT INTO nft_blocks`);
      const insertNftBlockRes = await pgClient.query(
        `INSERT INTO nft_blocks(
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
          block_amount) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          RETURNING id;
        `,
        [
          nft_id,
          nftBlockHeight,
          nft_block_parent_id,
          state,
          assetBlock.type,
          account_id,
          assetBlock.account,
          owner_id,
          assetBlock.owner,
          assetBlock.block_hash,
          assetBlock.block_link,
          assetBlock.block_height,
          assetBlock.block_account,
          assetBlock.block_representative,
          assetBlock.block_subtype === 'change' ? '0' : assetBlock.block_amount
        ]
      )
      nft_block_parent_id = insertNftBlockRes.rows[0].id;
    }

    await pgClient.query('COMMIT;');
  } catch (error) {
    try {
      console.log(`createNFT ROLLBACK`);
      console.error(error);
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

// TODO: Actually make use of crawl_block_head
export const updateNFT = async (pgPool: any, nft_id: number, crawl_at: Date, crawl_block_head: TBlockHash, crawl_block_height: number, new_asset_chain_frontiers: IAssetBlock[]) => {
  const highestBlockHeightResult = await findFrontierNFTBlock(pgPool, nft_id);

  if (highestBlockHeightResult === null) {
    throw Error(`unexpectedly unable to find frontier block for nft_id: ${nft_id}`);
  }
  
  let previous_nft_block_id = highestBlockHeightResult.id;
  let previous_nft_block_hash = highestBlockHeightResult.block_hash;

  const pgClient: any = await pgPool.connect().catch((error) => { throw(error); });

  try {
    await pgClient.query('BEGIN;');
    
    // loop through new_asset_chain_frontiers and insert them into the 'nft_blocks' table
    let old_frontier_block_reached;
    let new_frontier_block: IAssetBlock | undefined;
    let new_nft_block_height_count = 0;
    for(let i = 0; i < new_asset_chain_frontiers.length; i++) {
      const assetBlockDb = new_asset_chain_frontiers[i];
      
      if (previous_nft_block_hash === assetBlockDb.block_hash) {
        old_frontier_block_reached = true;
        // TODO: remove log
        console.log(`updateNFT: old_frontier_block_reached i: ${i}`);
        continue;
      }
      // Only proccess assetBlock after current frontier nft_block
      if (!old_frontier_block_reached) {
        // TODO: remove log
        console.log(`updateNFT: !old_frontier_block_reached i: ${i}`);
        continue;
      }
      new_frontier_block = assetBlockDb;

      let account_id = await findOrCreateAccount(pgClient, assetBlockDb.account as TAccount, crawl_at, null, null, false);
      let owner_id: number;

      if (assetBlockDb.account === assetBlockDb.owner) {
        owner_id = account_id;
      } else {
        owner_id = await findOrCreateAccount(pgClient, assetBlockDb.owner as TAccount, crawl_at, null, null, false);
      }

      new_nft_block_height_count += 1;
      // you might need to adjust this query and the parameters, this is just an example
      const newNftBlockRes = await pgClient.query(
        `INSERT INTO nft_blocks(nft_id, nft_block_height, nft_block_parent_id, state, type, account_id, account_address, owner_id, owner_address, block_account, block_hash, block_link, block_height, block_representative, block_amount) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING id`,
        [
          nft_id, 
          highestBlockHeightResult.nft_block_height + new_nft_block_height_count, 
          previous_nft_block_id,
          assetBlockDb.state,
          assetBlockDb.type,
          account_id,
          assetBlockDb.account,
          owner_id,
          assetBlockDb.owner,
          assetBlockDb.block_account,
          assetBlockDb.block_hash,
          assetBlockDb.block_link,
          assetBlockDb.block_height,
          assetBlockDb.block_representative,
          assetBlockDb.block_amount
        ]
      ).catch((error) => { throw(error); });

      previous_nft_block_id = newNftBlockRes.rows[0].id;
    }
    if (new_frontier_block?.state === 'burned') {
      updateSupplyBlockBurn(pgClient, nft_id)
    }
    await pgClient.query('COMMIT;');
  } catch (error) {
    try {
      console.log(`updateNFT ROLLBACK`);
      console.error(error);
      await pgClient.query('ROLLBACK;');
    } catch (error) {
      console.log('updateNFT ROLLBACK ERROR');
      throw(error);
    }
    throw(error);
  } finally {
    pgClient.release();
  }
};
