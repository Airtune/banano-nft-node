import { TAccount, TBlockHash } from "nano-account-crawler/dist/nano-interfaces";
import { NanoNode } from "nano-account-crawler/dist/nano-node";
import { MintBlocksCrawler } from "banano-nft-crawler/dist/mint-blocks-crawler";
import { retry_on_error } from "../lib/retry-on-error";
import { MINT_BLOCK_VERSION } from "../constants";
import { getBlock } from "banano-nft-crawler/dist/lib/get-block";

export const continue_trace_mint_blocks = async(bananode: NanoNode, issuer: TAccount, supplyBlockHeight: bigint, supplyBlockHash: TBlockHash, mint_crawl_head: TBlockHash, mintBlockCount: bigint, maxSupply: bigint, metadataRepresentative: TAccount) => {
  console.log('continue_trace_mint_blocks...');
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
    let crawlerHead = mint_crawl_head;
    // try {
    //   const crawlHeadBlockStatusReturn = await getBlock(bananode, issuer, mint_crawl_head);
    //   if (crawlHeadBlockStatusReturn.status === "ok" && crawlHeadBlockStatusReturn?.value?.previous) {
    //     if (crawlHeadBlockStatusReturn?.value?.previous === "0000000000000000000000000000000000000000000000000000000000000000") {
    //       crawlerHead = mint_crawl_head;
    //     } else {
    //       crawlerHead = crawlHeadBlockStatusReturn?.value?.previous;
    //     }
    //   } else {
    //     // TODO: handle this edge-case?
    //     crawlerHead = mint_crawl_head;
    //   }
    // } catch (error) {
    //   crawlerHead = mint_crawl_head;
    // }

    // TODO: Handle error with IStatusReturn
    await mintBlocksCrawler.crawlFromFrontier(bananode, crawlerHead).catch((error) => { throw(error); });

    const mintBlocks = mintBlocksCrawler.mintBlocks;
    
    if (Array.isArray(mintBlocks) && mintBlocks.length >= 1) {
      console.log(`continue_trace_mint_blocks!: ${mintBlocks.length}, ${mintBlocks ? mintBlocks[mintBlocks.length-1].height : 'none'}`);
      return mintBlocks;
    } else {
      console.log(`no new mint blocks for: ${supplyBlockHash}`);
      return [];
    }
  }).catch((error) => { throw(error); });
};
