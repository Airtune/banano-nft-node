import * as dotenv from 'dotenv' // see https://github.com/motdotla/dotenv#how-do-i-use-dotenv-with-import
dotenv.config();

// banano-nft-crawler
import { MintBlocksCrawler } from 'banano-nft-crawler/dist/mint-blocks-crawler';

// Typescript types and interfaces
import { INanoBlock, TAccount, TBlockHash } from 'nano-account-crawler/dist/nano-interfaces';
import { IAssetBlock } from 'banano-nft-crawler/dist/interfaces/asset-block';

import { traceAssetChain } from './src/crawler/trace-asset-chain';
import { traceAssetFrontier } from './src/crawler/trace-asset-frontier';
import { traceAssetBlockAtHeight } from './src/crawler/trace-asset-block-at-height';
import { traceSupplyBlocks } from './src/crawler/trace-supply-blocks';

const express = require('express');
const app = express();
const port = 1919;

const pg = require('pg');
const pgPool = new pg.Pool();

// nfts that has new blocks that are not yet crawled
const mintBlockHashesForNFTsPendingCrawl: TBlockHash[] = [];
// mints that have been discovered but not yet crawled
const mintBlockHashesForPendingMints: TBlockHash[] = [];

pgPool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

const BANANODE_RPC_URL = process.env.BANANODE_RPC_URL;
if (typeof BANANODE_RPC_URL !== 'string') { throw Error('Environment variable BANANODE_RPC_URL must be set.'); }
// TODO: check bananode is available

import { NanoNode } from "nano-account-crawler/dist/nano-node";
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
app.get('/pending_state_nfts_for_account', async (req, res) => {
  await catchAndRespondWithError(res, async () => {
    // NB: Account is different from owner. E.g. during an atomic swap the paying account that
    // has not payed yet is the account for the NFT but is not the owner yet.
    const account_address: TAccount = req.query['account'];
    const pgRes = await pgPool.query(`
      SELECT supply_blocks.metadata_representative AS metadata_representative,
             supply_blocks.ipfs_cid AS ipfs_cid,
             supply_blocks.block_hash AS supply_block_hash,
             supply_blocks.max_supply AS max_supply,
             supply_blocks.mint_count AS mint_count,
             supply_blocks.burn_count AS burn_count,
             nfts.state AS state,
             nfts.mint_number AS mint_number,
             nfts.frontier_height AS frontier_height,
             nfts.frontier_hash AS frontier_hash,
             nfts.asset_representative AS asset_representative,
             nfts.mint_block_hash AS mint_block_hash,
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

    const reponse: string = JSON.stringify({
      account: account_address,
      pending_state_nfts: pgRes.rows,
      conflicting_state_nfts: conflicting_nft_states
    });

    res.send(reponse);
  });
});

app.get('/nfts_for_owner', async (req, res) => {
  await catchAndRespondWithError(res, async () => {
    const owner_address: TAccount = req.query['owner'];
    const pgRes = await pgPool.query(`
      SELECT supply_blocks.metadata_representative AS metadata_representative,
             supply_blocks.ipfs_cid AS ipfs_cid,
             supply_blocks.block_hash AS supply_block_hash,
             supply_blocks.max_supply AS max_supply,
             supply_blocks.mint_count AS mint_count,
             supply_blocks.burn_count AS burn_count,
             nfts.mint_number AS mint_number,
             nfts.frontier_height AS frontier_height,
             nfts.frontier_hash AS frontier_hash,
             nfts.asset_representative AS asset_representative,
             nfts.mint_block_hash AS mint_block_hash,
             issuer_account.address AS issuer_address
      FROM nfts
      INNER JOIN supply_blocks ON nfts.supply_block_id = supply_blocks.id
      INNER JOIN accounts AS issuer_account ON issuer_account.id = supply_blocks.issuer_id
      INNER JOIN accounts AS owner_account ON owner_account.id = nfts.owner_id
      WHERE owner_account.address = $1
      ORDER BY nfts.frontier_height;
    `, [owner_address]).catch((error) => { throw(error) });

    const nfts = pgRes.rows.map((row: any) => {
      return {
        owner_address:                  row.owner_address,
        metadata_representative:        row.metadata_representative,
        ipfs_cid:                       row.ipfs_cid,
        supply_block_hash:              row.supply_block_hash,
        max_supply:                     row.max_supply,
        mint_count:                     row.mint_count,
        burn_count:                     row.burn_count,
        issuer_address:                 row.issuer_address,
        asset_representative:           row.asset_representative,
        mint_block_hash:                row.mint_block_hash,
        mint_number:                    row.mint_number
      };
    });

    const reponse: string = JSON.stringify({
      owner: owner_address,
      nfts: nfts
    });

    res.send(reponse);
  });
});

// Realtime crawling
app.get('/get_supply_blocks', async (req, res) => {
  await catchAndRespondWithError(res, async () => {
    const issuer: TAccount = req.query['issuer'] as TAccount;
    const { supplyBlocks, crawlerHead, crawlerHeadHeight } = await traceSupplyBlocks(bananode, issuer);

    for (let i = 0; i < supplyBlocks.length; i++) {
      const supplyBlock = supplyBlocks[i];
    }

    const reponse: string = JSON.stringify({
      issuer: issuer,
      supply_blocks: supplyBlocks
    });

    res.send(reponse);
  });
});

app.get('/get_mint_blocks', async (req, res) => {
  await catchAndRespondWithError(res, async () => {
    const issuer: TAccount = req.query['issuer'] as TAccount;
    const supplyBlockHash: TBlockHash = req.query['supply_block_hash'] as TBlockHash;

    console.log(`/supply_blocks\nissuer: ${issuer}\n`);
    const mintBlocksCrawler = new MintBlocksCrawler(issuer, supplyBlockHash)
    await mintBlocksCrawler.crawl(bananode);

    let mints: object[] = [];

    for (let i = 0; i < mintBlocksCrawler.mintBlocks.length; i++) {
      const mintBlock: INanoBlock = mintBlocksCrawler.mintBlocks[i];
      mints.push({
        mint_number: (i+1).toString(),
        mint_block_hash: mintBlock.hash
      })
    }

    const reponse: string = JSON.stringify({
      mints: mints
    });

    res.send(reponse);
  });
});

// TRACE
app.get('/get_asset_frontier', async (req, res) => {
  await catchAndRespondWithError(res, async () => {
    // TODO: validate params !!!
    const issuer: TAccount = req.query['issuer'] as TAccount;
    const mintBlockHash: TBlockHash = req.query['mint_block_hash'] as TBlockHash;

    const frontier = await traceAssetFrontier(bananode, issuer, mintBlockHash).catch((error) => { throw(error); });
    const reponse: string = JSON.stringify({
      block_hash: frontier.block_hash,
      account:    frontier.account,
      owner:      frontier.owner,
      locked:     frontier.locked,
      state:      frontier.state,
      type:       frontier.type
    });

    res.send(reponse);
  });
});

app.get('/get_asset_at_height', async (req, res) => {
  await catchAndRespondWithError(res, async () => {
    // TODO: validate params !!!
    const issuer: TAccount          = req.query['issuer'] as TAccount;
    const mintBlockHash: TBlockHash = req.query['mint_block_hash'] as TBlockHash;
    const height: number            = parseInt(req.query['height']);

    const assetBlock = await traceAssetBlockAtHeight(bananode, issuer, mintBlockHash, height).catch((error) => { throw(error); });

    const reponse: string = JSON.stringify({
      block_hash: assetBlock.block_hash,
      account:    assetBlock.account,
      owner:      assetBlock.owner,
      locked:     assetBlock.locked,
      state:      assetBlock.state,
      type:       assetBlock.type
    });

    res.send(reponse);
  });
});

app.get('/get_asset_chain', async (req, res) => {
  await catchAndRespondWithError(res, async () => {
    // TODO: validate params !!!
    const issuer: TAccount          = req.query['issuer'] as TAccount;
    const mintBlockHash: TBlockHash = req.query['mint_block_hash'] as TBlockHash;

    const assetCrawler = await traceAssetChain(bananode, issuer, mintBlockHash).catch((error) => { throw(error); });
    const assetChain = assetCrawler.assetChain.map((assetBlock: IAssetBlock) => {
      return {
        account:    assetBlock.account,
        owner:      assetBlock.owner,
        locked:     assetBlock.locked,
        block_hash: assetBlock.block_hash,
        state:      assetBlock.state,
        type:       assetBlock.type
      };
    });

    const reponse: string = JSON.stringify({
      asset_chain: assetChain
    });

    res.send(reponse);
  });
});

app.listen(port, async () => {
  console.log(`Banano Meta Node listening at port ${port}`);
});

