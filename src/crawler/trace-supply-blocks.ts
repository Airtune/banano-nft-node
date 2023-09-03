import { INanoBlock, TAccount, TBlockHash } from 'nano-account-crawler/dist/nano-interfaces';

import { SupplyBlocksCrawler } from 'banano-nft-crawler/dist/supply-blocks-crawler';
import { bananoIpfs } from 'banano-nft-crawler/dist/lib/banano-ipfs';
import { parseSupplyRepresentative } from "banano-nft-crawler/dist/block-parsers/supply";
import { ISupplyBlock } from '../interfaces/supply-block';
import { getBlock } from 'banano-nft-crawler/dist/lib/get-block';

export const traceSupplyBlocks = async (bananode, issuer: TAccount, head: TBlockHash = undefined, offset: ("0" | "-1") = "0", ignoreMetadataRepresentatives: TAccount[] = undefined): Promise<{ supplyBlocks: ISupplyBlock[], crawlerHead: TBlockHash, crawlerHeadHeight: number } > => {
  let crawlerHead = head;
  //if (offset === "-1") {
  //  const crawlHeadBlockStatusReturn = await getBlock(bananode, issuer, head);
  //  let crawlerHead;
  //  if (crawlHeadBlockStatusReturn.status === "ok" && crawlHeadBlockStatusReturn?.value?.previous) {
  //    if (crawlHeadBlockStatusReturn?.value?.previous === "0000000000000000000000000000000000000000000000000000000000000000") {
  //      crawlerHead = head;
  //    } else {
  //      crawlerHead = crawlHeadBlockStatusReturn?.value?.previous;
  //    }
  //  } else {
  //    // TODO: handle this edge case
  //    crawlerHead = head;
  //  }
  //} else {
  //  crawlerHead = head;
  //}
//
  const supplyBlocksCrawler = new SupplyBlocksCrawler(issuer, head);
  if (Array.isArray(ignoreMetadataRepresentatives) && ignoreMetadataRepresentatives.length > 0) {
    supplyBlocksCrawler.ignoreMetadataRepresentatives = ignoreMetadataRepresentatives;
  }

  await supplyBlocksCrawler.crawl(bananode).catch((error) => { throw(error) });

  let supplyBlocks: ISupplyBlock[] = [];

  for (let i = 0; i < supplyBlocksCrawler.supplyBlocks.length; i++) {
    const supplyBlock: INanoBlock          = supplyBlocksCrawler.supplyBlocks[i];
    const metadataRepresentative: TAccount = supplyBlocksCrawler.metadataRepresentatives[i];

    const supplyRepresentative: TAccount = supplyBlock.representative as TAccount;
    const { version, maxSupply } = parseSupplyRepresentative(supplyRepresentative);
    const ipfsCid = bananoIpfs.accountToIpfsCidV0(metadataRepresentative);

    supplyBlocks.push({
      supply_block_hash: supplyBlock.hash,
      supply_block_height: supplyBlock.height,
      metadata_representative: metadataRepresentative,
      ipfs_cid: ipfsCid,
      max_supply: maxSupply.toString(),
      version: version
    });
  }

  return { supplyBlocks: supplyBlocks, crawlerHead: supplyBlocksCrawler.head, crawlerHeadHeight: supplyBlocksCrawler.headHeight };
};
