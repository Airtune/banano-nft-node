import { AssetCrawler } from "banano-nft-crawler/dist/asset-crawler"
import { getBlock } from "banano-nft-crawler/dist/lib/get-block";
import { INanoBlock, TAccount } from "nano-account-crawler/dist/nano-interfaces";
import { IAssetBlock } from "banano-nft-crawler/dist/interfaces/asset-block";
import { bananode } from "./bananode";
import { dbPrepareAssetChain } from "./db/db-prepare-asset-chain";
import { ASSET_BLOCK_FRONTIER_COUNT } from "./constants";
import { updateNFT } from "./db/nfts";
import { mainMutexManager } from "./lib/mutex-manager";

export const scanAndUpdateNFT = async (pgClient: any, issuer: TAccount, asset_representative: TAccount) => {
  await mainMutexManager.runExclusive(asset_representative, async () => {
    const pgResult = await pgClient.query(`SELECT id, asset_chain_frontiers, mint_block_hash FROM nfts WHERE asset_representative = $1 LIMIT 1;`, [asset_representative]).catch((error) => { throw(error); });
    const nft_id = pgResult.rows[0].id;
    const asset_chain_frontiers = pgResult.rows[0].asset_chain_frontiers;
    const mint_block_hash = pgResult.rows[0].mint_block_hash;
    // TODO: check if asset_chain_frontiers is a json or a json string
    const mintBlock = await getBlock(bananode, issuer, mint_block_hash).catch((error) => { throw(error); });
    const crawl_at = new Date();
    const assetCrawler = new AssetCrawler(issuer, mintBlock);
    assetCrawler.initFromCache(asset_representative, asset_chain_frontiers);
    await assetCrawler.crawl(bananode).catch((error) => { throw(error); });
    
    const new_asset_chain_frontiers = assetCrawler.assetChain.slice(-ASSET_BLOCK_FRONTIER_COUNT);
    const new_db_asset_chain_frontiers = dbPrepareAssetChain(new_asset_chain_frontiers);
    await updateNFT(pgClient, nft_id, crawl_at, assetCrawler.head, assetCrawler.headHeight, new_db_asset_chain_frontiers).catch((error) => { throw(error); });

  }).catch((error) => { throw(error); });
};
