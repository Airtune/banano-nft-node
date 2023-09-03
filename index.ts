import * as dotenv from 'dotenv' // see https://github.com/motdotla/dotenv#how-do-i-use-dotenv-with-import
dotenv.config();

// banano-nft-crawler
import { MintBlocksCrawler } from 'banano-nft-crawler/dist/mint-blocks-crawler';

// Typescript types and interfaces
import { INanoBlock, TAccount, TBlockHash } from 'nano-account-crawler/dist/nano-interfaces';
import { json_stringify_bigint } from './src/lib/json-stringify-bigint';

import { continueTraceAndStoreAssetChains } from './src/crawler/continue-trace-and-store-asset-chains';
import { continueTraceAndStoreNewlyMintedAssets } from './src/crawler/continue-trace-and-store-newly-minted-assets';
import { continueTraceAndStoreNewlySuppliedAssets } from './src/crawler/continue-trace-and-store-newly-supplied-assets';


const express = require('express');
const app = express();
const port = 1919;

const pg = require('pg');
const pgPool = new pg.Pool();

pgPool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

const BANANODE_RPC_URL = process.env.BANANODE_RPC_URL;
if (typeof BANANODE_RPC_URL !== 'string') { throw Error('Environment variable BANANODE_RPC_URL must be set.'); }
// TODO: check bananode is available

import { NanoNode } from "nano-account-crawler/dist/nano-node";
import { delay_between_undiscovered_crawls, ms_undiscovered_crawls } from './src/bananode-cooldown';
const fetch = require('node-fetch');
export const bananode = new NanoNode(BANANODE_RPC_URL, fetch);

const catchAndRespondWithError = async (res, fn) => {
  try {
    await fn();
  } catch(error) {
    res.send(JSON.stringify({
      status: 'error',
      error: error.toString(),
      stack: error.stack || error.stacktrace
    }));
  }
  console.log('\n');
}

// DB data
// Pending state includes atomic_swap_receivable, atomic_swap_payable, and receivable.
// `conflicting_state_nfts` is a list of NFTs for the account where you can only do one
// action and the other ones will be cancelled. E.g. one NFT in the state atomic_swap_receivable
// and another in the state atomic_swap_payable that both expect a block at the same height
// in the account.
/*
app.get('/pending_state_nfts_for_account', async (req, res) => {
  await catchAndRespondWithError(res, async () => {
    // NB: Account is different from owner. E.g. during an atomic swap the paying account that
    // has not payed yet is the account for the NFT but is not the owner yet.
    const account_address: TAccount = req.query['account'];
    // TODO: Review due to refactor
    const pgRes = await pgPool.query(`
      SELECT supply_blocks.metadata_representative AS metadata_representative,
             supply_blocks.ipfs_cid AS ipfs_cid,
             supply_blocks.block_hash AS supply_block_hash,
             supply_blocks.max_supply AS max_supply,
             supply_blocks.mint_count AS mint_count,
             supply_blocks.burn_count AS burn_count,
             nfts.state AS state,
             nfts.mint_number AS mint_number,
             nfts.crawl_at AS crawl_at,
             nfts.crawl_block_height AS crawl_block_height,
             nfts.crawl_block_head AS crawl_block_head,
             nfts.asset_representative AS asset_representative,
             issuer_account.address AS issuer_address
      FROM nfts
      INNER JOIN supply_blocks ON nfts.supply_block_id = supply_blocks.id
      INNER JOIN accounts AS issuer_account ON issuer_account.id = supply_blocks.issuer_id
      INNER JOIN accounts AS nft_account ON nft_account.id = nfts.account_id
      WHERE nft_account.address = $1 AND
        nfts.state IN ('atomic_swap_receivable', 'atomic_swap_payable', 'receivable')
      ORDER BY nfts.frontier_height;
    `, [account_address]).catch((error) => { throw(error) });


    let conflicting_nft_states: any[] = [];
    for (let i = 0; i < pgRes.rows.length; i++) {
      const nft = pgRes.rows[i];
      if (['atomic_swap_receivable', 'atomic_swap_payable'].includes(nft.state)) {
        conflicting_nft_states.push(nft);
      }
    }
    if (conflicting_nft_states.length <= 1) {
      conflicting_nft_states = [];
    }

    const response: string = json_stringify_bigint({
      account: account_address,
      pending_state_nfts: pgRes.rows,
      conflicting_state_nfts: conflicting_nft_states
    });

    res.send(response);
  });
});
*/

// Get all of the nfts owned by an address
app.get('/nftnode/owner/:address/nfts', async (req, res) => {
  await catchAndRespondWithError(res, async () => {
    const owner_address: TAccount = req.params.address;
    // TODO: Validate owner_address
    const query = `
      SELECT DISTINCT ON (nft_blocks.nft_id)
        nft_blocks.account_address AS account_address,
        nft_blocks.owner_address AS owner_address,
        nft_blocks.state AS state,
        nft_blocks.type AS type,
        nfts.mint_number AS mint_number,
        nfts.supply_block_hash AS supply_block_hash,
        nfts.asset_representative AS asset_representative,
        supply_blocks.metadata_representative AS metadata_representative,
        supply_blocks.issuer_address AS issuer_address,
        supply_blocks.max_supply AS max_supply,
        supply_blocks.mint_count AS mint_count,
        supply_blocks.burn_count AS burn_count,
        supply_blocks.ipfs_cid AS ipfs_cid
      FROM nft_blocks
      INNER JOIN nfts ON nft_blocks.nft_id = nfts.id
      INNER JOIN supply_blocks ON nfts.supply_block_id = supply_blocks.id
      WHERE nft_blocks.owner_address = $1
      ORDER BY nft_blocks.nft_id, nft_blocks.nft_block_height DESC
    `;

    const values = [owner_address];

    const pgRes = await pgPool.query(query, values).catch((error) => { throw(error); });

    const nfts = pgRes.rows.map((row: any) => {
      return {
        account_address: row.account_address,
        owner_address: row.owner_address,
        state: row.state,
        type: row.type,
        mint_number: row.mint_number,
        supply_block_hash: row.supply_block_hash,
        asset_representative: row.asset_representative,
        metadata_representative: row.metadata_representative,
        issuer_address: row.issuer_address,
        max_supply: row.max_supply,
        mint_count: row.mint_count,
        burn_count: row.burn_count,
        ipfs_cid: row.ipfs_cid
      };
    });

    const response: string = json_stringify_bigint({
      owner: owner_address,
      nfts: nfts
    });

    res.send(response);
  });
});

// Get all of the supply_blocks from an issuer address
app.get('/nftnode/issuer/:address/supply_blocks', async (req, res) => {
  await catchAndRespondWithError(res, async () => {
    const issuer_address: TAccount = req.params.address;
    // TODO: Validate issuer_address
    const query = `
      SELECT
        id,
        metadata_representative,
        ipfs_cid,
        max_supply,
        mint_count,
        burn_count,
        block_hash AS supply_block_hash,
        block_height AS supply_block_height
      FROM supply_blocks
      WHERE supply_blocks.issuer_address = $1
      ORDER BY supply_blocks.block_height DESC
    `;

    const values = [issuer_address];

    const pgRes = await pgPool.query(query, values).catch((error) => { throw(error); });

    const supply_blocks = pgRes.rows.map((row: any) => {
      return {
        metadata_representative: row.metadata_representative,
        ipfs_cid: row.ipfs_cid,
        max_supply: row.max_supply,
        mint_count: row.mint_count,
        burn_count: row.burn_count,
        supply_block_hash: row.supply_block_hash,
        supply_block_height: row.supply_block_height
      };
    });

    const response: string = json_stringify_bigint({
      issuer: issuer_address,
      supply_blocks: supply_blocks
    });

    res.send(response);
  });
});

// Get all of the nfts minted from a supply_block_hash
app.get('/nftnode/supply_block/:supply_block_hash/nfts', async (req, res) => {
  await catchAndRespondWithError(res, async () => {
    const supply_block_hash: TBlockHash = req.params.supply_block_hash;
    // TODO: Validate supply_block_hash is an upper case hex string of correct length
    const query = `
      SELECT DISTINCT ON (nft_blocks.nft_id)
        nft_blocks.account_address AS account_address,
        nft_blocks.owner_address AS owner_address,
        nft_blocks.state AS state,
        nft_blocks.type AS type,
        nfts.mint_number AS mint_number,
        nfts.supply_block_hash AS supply_block_hash,
        nfts.asset_representative AS asset_representative,
        supply_blocks.metadata_representative AS metadata_representative,
        supply_blocks.issuer_address AS issuer_address,
        supply_blocks.max_supply AS max_supply,
        supply_blocks.mint_count AS mint_count,
        supply_blocks.burn_count AS burn_count,
        supply_blocks.ipfs_cid AS ipfs_cid
      FROM nft_blocks
      INNER JOIN nfts ON nft_blocks.nft_id = nfts.id
      INNER JOIN supply_blocks ON nfts.supply_block_id = supply_blocks.id AND supply_blocks.block_hash = $1
      ORDER BY nft_blocks.nft_id, nft_blocks.nft_block_height DESC
    `;

    const values = [supply_block_hash];

    const pgRes = await pgPool.query(query, values).catch((error) => { throw(error); });

    const nfts = pgRes.rows.map((row: any) => {
      return {
        account_address: row.account_address,
        owner_address: row.owner_address,
        state: row.state,
        type: row.type,
        mint_number: row.mint_number,
        supply_block_hash: row.supply_block_hash,
        asset_representative: row.asset_representative,
        metadata_representative: row.metadata_representative,
        issuer_address: row.issuer_address,
        max_supply: row.max_supply,
        mint_count: row.mint_count,
        burn_count: row.burn_count,
        ipfs_cid: row.ipfs_cid
      };
    });

    const response: string = json_stringify_bigint({
      supply_block_hash: supply_block_hash,
      nfts: nfts
    });

    res.send(response);
  });
});

// Get the transaction history for an nft
app.get('/nftnode/nft/:asset_representative/history', async (req, res) => {
  await catchAndRespondWithError(res, async () => {
    const asset_representative: TAccount = req.params.asset_representative;
    // TODO: Validate asset_representative
    const query = `
      SELECT
        nft_blocks.account_address AS next_crawl_address,
        nft_blocks.owner_address AS owner_address,
        nft_blocks.state AS state,
        nft_blocks.type AS type,
        nft_blocks.nft_block_height AS nft_block_height,
        nft_blocks.block_account AS block_account,
        nft_blocks.block_hash AS block_hash,
        nft_blocks.block_link AS block_link,
        nft_blocks.block_height AS block_height,
        nft_blocks.block_representative AS block_representative,
        nft_blocks.block_amount AS block_amount

      FROM nft_blocks
      INNER JOIN nfts ON nft_blocks.nft_id = nfts.id AND nfts.asset_representative = $1
      ORDER BY nft_blocks.nft_block_height DESC
    `;

    const values = [asset_representative];

    const pgRes = await pgPool.query(query, values).catch((error) => { throw(error); });

    const nft_history = pgRes.rows.map((row: any) => {
      return {
        account_address: row.account_address,
        owner_address: row.owner_address,
        state: row.state,
        type: row.type,
        nft_block_height: row.nft_block_height,
        block_account: row.block_account,
        block_hash: row.block_hash,
        block_link: row.block_link,
        block_height: row.block_height,
        block_representative: row.block_representative,
        block_amount: row.block_amount
      };
    });

    const response: string = json_stringify_bigint({
      asset_representative: asset_representative,
      nft_history: nft_history
    });

    res.send(response);
  });
});

// TODO: refactor fetch from nft_blocks
/*
app.get('/get_mint_blocks', async (req, res) => {
  await catchAndRespondWithError(res, async () => {
    const issuer: TAccount = req.query['issuer'] as TAccount;
    const supplyBlockHash: TBlockHash = req.query['supply_block_hash'] as TBlockHash;

    console.log(`/supply_blocks\nissuer: ${issuer}\n`);
    const mintBlocksCrawler = new MintBlocksCrawler(issuer, supplyBlockHash)
    await mintBlocksCrawler.crawl(bananode).catch((error) => { throw(error); } );

    let mints: object[] = [];

    for (let i = 0; i < mintBlocksCrawler.mintBlocks.length; i++) {
      const mintBlock: INanoBlock = mintBlocksCrawler.mintBlocks[i];
      mints.push({
        mint_number: (i+1).toString(),
        mint_block_hash: mintBlock.hash
      })
    }

    const response: string = JSON.stringify({
      mints: mints
    });

    res.send(response);
  });
});
*/

// TRACE
// TODO: refactor to use nft_blocks
/*
app.get('/get_asset_frontier', async (req, res) => {
  await catchAndRespondWithError(res, async () => {
    // TODO: validate params !!!
    const issuer: TAccount = req.query['issuer'] as TAccount;
    const mintBlockHash: TBlockHash = req.query['mint_block_hash'] as TBlockHash;

    const frontier = await traceAssetFrontier(bananode, issuer, mintBlockHash).catch((error) => { throw(error); });
    const response: string = JSON.stringify({
      block_hash: frontier.block_hash,
      account:    frontier.account,
      owner:      frontier.owner,
      locked:     frontier.locked,
      state:      frontier.state,
      type:       frontier.type
    });

    res.send(response);
  });
});
*/

const catchUndiscoveredAssetUpdatesLoop = async () => {
  console.log("CUASUL: catchUndiscoveredAssetUpdatesLoop...");
  try {
    const assetTraceStatusReturn = await continueTraceAndStoreAssetChains(bananode, pgPool);
    if (assetTraceStatusReturn.status === "error") {
      console.log(`IErrorReturn: ${assetTraceStatusReturn.error_type}: ${assetTraceStatusReturn.message}`);
    }
  } catch (error) {
    console.log(`assetTraceStatusReturn error:`);
    console.error(error);
  }
  
  console.log("CUASUL: catchUndiscoveredAssetUpdatesLoop!"); 

  setTimeout(catchUndiscoveredAssetUpdatesLoop, ms_undiscovered_crawls);
}

const catchUndiscoveredMintUpdatesLoop = async () => {
  console.log("catchUndiscoveredMintUpdatesLoop...");

  try {
    const supplyTraceStatusReturn = await continueTraceAndStoreNewlySuppliedAssets(bananode, pgPool);
    if (supplyTraceStatusReturn.status === "error") {
      console.log(`IErrorReturn: ${supplyTraceStatusReturn.error_type}: ${supplyTraceStatusReturn.message}`);
    }
  } catch (error) {
    console.log(`supplyTraceStatusReturn error:`);
    console.error(error);
  }

  await delay_between_undiscovered_crawls();

  try {
    // TODO: Optimize this by supplying supply blocks from continueTraceAndStoreNewlySuppliedAssets
    const mintTraceStatusReturn = await continueTraceAndStoreNewlyMintedAssets(bananode, pgPool);
    if (mintTraceStatusReturn.status === "error") {
      console.log(`IErrorReturn: ${mintTraceStatusReturn.error_type}: ${mintTraceStatusReturn.message}`);
    }
  } catch (error) {
    console.log(`mintTraceStatusReturn error:`);
    console.error(error);
  }
  
  console.log("catchUndiscoveredMintUpdatesLoop!"); 

  setTimeout(catchUndiscoveredMintUpdatesLoop, ms_undiscovered_crawls);
};

app.listen(port, async () => {
  console.log(`Banano Meta Node listening at port ${port}`);
  catchUndiscoveredMintUpdatesLoop();
  catchUndiscoveredAssetUpdatesLoop();
});
