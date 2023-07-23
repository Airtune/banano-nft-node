import { IAssetBlock } from "banano-nft-crawler/dist/interfaces/asset-block";
import { TAssetState } from "banano-nft-crawler/dist/types/asset-state";
import { TAssetBlockType } from "banano-nft-crawler/dist/types/asset-block-type";
import { TAccount, TBlockHash } from "nano-account-crawler/dist/nano-interfaces";

export interface IAssetBlockDb {
  state:      TAssetState,
  type:       TAssetBlockType,
  account:    TAccount,
  owner:      TAccount,
  locked:     boolean,
  block_hash: TBlockHash,
  block_height: string,
  block_representative: TAccount,
  block_link: TBlockHash,
  block_amount: string
};

export const dbPrepareAssetChain = (assetChain: IAssetBlock[]): IAssetBlockDb[] => {
  return assetChain.map((assetBlock: IAssetBlock) => {
    return {
      state: assetBlock.state,
      type: assetBlock.type,
      account: assetBlock.account,
      owner: assetBlock.owner,
      locked: assetBlock.locked,
      block_hash: assetBlock.block_hash,
      block_height: assetBlock.block_height,
      block_representative: assetBlock.block_representative,
      block_link: assetBlock.block_link,
      block_amount: assetBlock.block_amount
    };
  });
};
