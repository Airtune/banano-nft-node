import { SupplyBlocksCrawler } from 'banano-nft-crawler/dist/supply-blocks-crawler';
import { INanoBlock, TAccount } from 'nano-account-crawler/dist/nano-interfaces';
import { bananoIpfs } from 'banano-nft-crawler/dist/lib/banano-ipfs';
import { parseSupplyRepresentative } from "banano-nft-crawler/dist/block-parsers/supply";
import { NanoNode } from "nano-account-crawler/dist/nano-node";
import { mainMutexManager } from './lib/mutex-manager';
import { traceSupplyBlocks } from './crawler/trace-supply-blocks';
import { ISupplyBlock } from './interfaces/supply-block';
import { createOrUpdateAccount } from './db/accounts';
import { get_issuers } from './get-issuers';

const traceAndUpdateIssuerSupplyBlocks = async (nanoNode: NanoNode, pgClient: any, issuer: TAccount) => {
  const crawlAt = new Date();
  const supplyBlocks = await traceSupplyBlocks(nanoNode, issuer);
  if (supplyBlocks.length < 1) {
    return [];
  }

  const headSupplyBlock = supplyBlocks[supplyBlocks.length - 1];
  const _accountId = await createOrUpdateAccount(pgClient, issuer, crawlAt, headSupplyBlock.supply_block_hash, parseInt(headSupplyBlock.supply_block_height));
  const newSupplyBlocks = [];

  for (let i = 0; i < supplyBlocks.length; i++) {
    const supplyBlock: ISupplyBlock = supplyBlocks[i];
    const _supplyBlockId = await createSupplyBlock(pgClient, issuer, crawlAt, parseInt(supplyBlock.supply_block_height), supplyBlock.supply_block_hash);
    newSupplyBlocks.push(supplyBlock);
  }

  return newSupplyBlocks;
}

const scanIssuerForSupplyBlocks = async (nanoNode: NanoNode, pgClient: any, issuer: TAccount): Promise<ISupplyBlock[]> => {
  const { supply_block_crawl_at, supply_block_crawl_height, supply_block_crawl_head } = await fetchSupplyBlockHeadFromCache(pgClient, issuer).catch((error) => { throw(error); });

  const supplyBlocksCrawler = new SupplyBlocksCrawler(issuer, supply_block_crawl_head);
  // supplyBlocksCrawler.ignoreMetadataRepresentatives = [];
  const supplyBlocks = await supplyBlocksCrawler.crawl(nanoNode).catch((error) => { throw(error) });

  let newSupplyBlocks: ISupplyBlock[] = [];

  for (let i = 0; i < supplyBlocks.length; i++) {
    const supplyBlock: INanoBlock          = supplyBlocksCrawler.supplyBlocks[i];
    const metadataRepresentative: TAccount = supplyBlocksCrawler.metadataRepresentatives[i];

    if (BigInt(supplyBlock.height) <= BigInt(supply_block_crawl_height)) {
      continue;
    }

    const supplyRepresentative: TAccount = supplyBlock.representative as TAccount;
    const { version, maxSupply } = parseSupplyRepresentative(supplyRepresentative);
    const ipfsCid = bananoIpfs.accountToIpfsCidV0(metadataRepresentative);
    newSupplyBlocks.push({
      supply_block_hash: supplyBlock.hash,
      supply_block_height: supplyBlock.height,
      metadata_representative: metadataRepresentative,
      ipfs_cid: ipfsCid,
      max_supply: maxSupply.toString(),
      version: version
    });
  }

  return newSupplyBlocks;
};

const insertSupplyBlock = async (pgClient: any, issuerId: number, newSupplyBlock: NewSupplyBlock) => {
  await pgClient.query(`
      INSERT INTO supply_blocks (issuer_id, supply_block_hash, supply_block_height, max_supply, metadata_representative, latest_checked_mint_height)
      VALUES (?, ?, ?, ?, ?, ?);
    `,
    [
      issuerId,
      newSupplyBlock.supply_block_hash,
      newSupplyBlock.supply_block_height,
      newSupplyBlock.max_supply,
      newSupplyBlock.metadata_representative,
      0
    ]
  ).catch((e) => {
    // errors expected for unique constraint violations since previous metadata representatives are
    // not set on supplyBlocksCrawler.ignoreMetadataRepresentatives
    console.error(e);
  });
};

const _scanAndUpdateSupplyBlocks = async (nanoNode: NanoNode, pgClient: any): Promise<boolean> => {
  let addedNewSupplyBlocks: boolean = false;
  const issuers = await get_issuers();

  for (let i = 0; i < issuers.length; i++) {
    const issuer: TAccount = issuers[i].toLocaleLowerCase() as TAccount;
    const issuerId: number = await pgClient.query('SELECT issuer.id AS id FROM accounts WHERE accounts.address = $1', [issuer]).catch((error) => { throw(error) }) as number;

    await mainMutexManager.runExclusive(issuer, async () => {
      const newSupplyBlocks = await scanIssuerForSupplyBlocks(nanoNode, pgClient, issuer).catch((error) => { throw(error) });

      for (let j = 0; j < newSupplyBlocks.length; j++) {
        await insertSupplyBlock(pgClient, issuerId, newSupplyBlocks[j]).catch((error) => { throw(error) });
        addedNewSupplyBlocks = true;
      }
    }).catch((error) => { throw(error) });
  }

  return addedNewSupplyBlocks;
};

export const scanAndUpdateSupplyBlocks = async (nanoNode: NanoNode, pgPool: any): Promise<boolean> => {
  let addedNewSupplyBlocks: boolean = false;
  const pgClient = pgPool.connect().catch((error) => { throw(error) });

  try {
    addedNewSupplyBlocks = await _scanAndUpdateSupplyBlocks(nanoNode, pgClient);
  } catch(error) {
    throw(error);
  } finally {
    pgClient.release();
  }
  
  return addedNewSupplyBlocks;
};
