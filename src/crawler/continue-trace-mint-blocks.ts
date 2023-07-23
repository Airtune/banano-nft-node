import { TAccount, TBlockHash } from "nano-account-crawler/dist/nano-interfaces";
import { NanoNode } from "nano-account-crawler/dist/nano-node";
import { MintBlocksCrawler } from "banano-nft-crawler/dist/mint-blocks-crawler";
import { retry_on_error } from "../lib/retry-on-error";
import { MINT_BLOCK_VERSION } from "../constants";

export const continue_trace_mint_blocks = async(bananode: NanoNode, issuer: TAccount, supplyBlockHeight: bigint, supplyBlockHash: TBlockHash, mint_crawl_head: TBlockHash, mintBlockCount: bigint, maxSupply: bigint, metadataRepresentative: TAccount) => {
  return await retry_on_error(async () => {
    const mintBlocksCrawler: MintBlocksCrawler = new MintBlocksCrawler(issuer, supplyBlockHash);
    // TODO: Refactor inconsistency between assetCrawler and mintBlocksCrawler:
    // assetCrawler.initFromCache(...)
    // assetCrawler.crawl(...)
    //
    // mintBlocksCrawler.initFromCache(...)
    // mintBlocksCrawler.crawlFromFrontier(...)
    mintBlocksCrawler.initFromCache(supplyBlockHeight, mintBlockCount, MINT_BLOCK_VERSION, maxSupply, metadataRepresentative);
    // TODO: Add tests to make sure we don't miss mint blocks near mint_crawl_head
    await mintBlocksCrawler.crawlFromFrontier(bananode, mint_crawl_head).catch((error) => { throw(error); });

    const mintBlocks = mintBlocksCrawler.mintBlocks;
    if (Array.isArray(mintBlocks)) {
      return mintBlocks;
    } else {
      return [];
    }
  }).catch((error) => { throw(error); });
};
